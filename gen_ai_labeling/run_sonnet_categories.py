"""Run Claude Sonnet 4.6 on the human-labeled subset using the new
single-select 3-category schema. Output side-by-side with the human labels
so we can see what the API natively produces vs the deterministic remap.

Usage:
  python run_sonnet_categories.py
  python run_sonnet_categories.py --limit 5     # smoke test
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from tqdm.asyncio import tqdm_asyncio

from prompt_categories import (
    RESPONSE_SCHEMA,
    SYSTEM_PROMPT,
    VALID_CATEGORIES,
    build_user_prompt,
)

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

HOLDOUT_CSV = ROOT.parent / "data" / "mortgage_holdout_1000.csv"
HUMAN_CSV   = Path("/Users/aryanchoudhary/Library/Messages/Attachments/47/07/148FD2B6-304D-45B9-9936-3559C8321C46/human_consensus_holdout.csv")
OUT_DIR     = ROOT / "outputs" / "anthropic__claude-sonnet-4-6_native"
MODEL       = "claude-sonnet-4-6"
LABELER     = "anthropic__claude-sonnet-4-6_native"
RPM         = 4
CONCURRENCY = 2
CSV_FIELDS  = ["complaint_id", "labeler_name", "complaint_category", "created_at"]


class _MinIntervalLimiter:
    def __init__(self, rpm: int):
        self.min_interval = 60.0 / rpm
        self.next_allowed = 0.0
        self.lock = asyncio.Lock()

    async def acquire(self):
        async with self.lock:
            now = time.monotonic()
            wait = self.next_allowed - now
            if wait > 0:
                await asyncio.sleep(wait)
            self.next_allowed = max(now, self.next_allowed) + self.min_interval


_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


def _extract_json(text: str) -> dict:
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = _JSON_RE.search(text)
        if not m:
            raise
        return json.loads(m.group(0))


async def call_sonnet(client, user_prompt: str) -> dict:
    tool = {
        "name": "submit_label",
        "description": "Submit the single-category label for this complaint.",
        "input_schema": RESPONSE_SCHEMA,
    }
    msg = await client.messages.create(
        model=MODEL,
        max_tokens=128,
        system=SYSTEM_PROMPT,
        tools=[tool],
        tool_choice={"type": "tool", "name": "submit_label"},
        messages=[{"role": "user", "content": user_prompt}],
    )
    for block in msg.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "submit_label":
            return dict(block.input)
    text = "".join(getattr(b, "text", "") for b in msg.content)
    return _extract_json(text)


async def label_one(client, complaint, sem, limiter, retries=2):
    user_prompt = build_user_prompt(
        issue=complaint["issue"],
        sub_issue=complaint["sub_issue"],
        narrative=complaint["complaint_what_happened"],
    )
    last_err = None
    async with sem:
        for attempt in range(retries + 1):
            try:
                await limiter.acquire()
                raw = await call_sonnet(client, user_prompt)
                cat = raw.get("complaint_category")
                if cat not in VALID_CATEGORIES:
                    raise ValueError(f"invalid complaint_category: {cat!r}")
                return {
                    "complaint_id":       int(complaint["complaint_id"]),
                    "labeler_name":       LABELER,
                    "complaint_category": cat,
                    "created_at":         datetime.now(timezone.utc).isoformat(),
                }
            except Exception as e:
                last_err = e
                if attempt < retries:
                    await asyncio.sleep(2 ** attempt)
        return {
            "complaint_id":       int(complaint["complaint_id"]),
            "labeler_name":       LABELER,
            "complaint_category": "",
            "created_at":         datetime.now(timezone.utc).isoformat(),
            "_error":             f"{type(last_err).__name__}: {last_err}",
        }


def load_target_complaints(limit: int | None) -> list[dict]:
    h = pd.read_csv(HUMAN_CSV)
    target_ids = set(h[h["rater_1_category_slugs"].notna()]["complaint_id"].astype(int))
    holdout = pd.read_csv(HOLDOUT_CSV)[
        ["complaint_id", "issue", "sub_issue", "complaint_what_happened"]
    ].fillna("")
    holdout = holdout[holdout["complaint_id"].astype(int).isin(target_ids)]
    if limit:
        holdout = holdout.head(limit)
    return holdout.to_dict("records")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    from anthropic import AsyncAnthropic
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise SystemExit("ANTHROPIC_API_KEY not set in gen_ai_labeling/.env")
    client = AsyncAnthropic(api_key=key)

    complaints = load_target_complaints(args.limit)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_csv = OUT_DIR / "labels.csv"
    err_log = OUT_DIR / "errors.log"

    done_ids: set[int] = set()
    if out_csv.exists():
        kept_rows: list[dict] = []
        with out_csv.open("r", newline="", encoding="utf-8") as rf:
            reader = csv.DictReader(rf)
            for row in reader:
                cid = row.get("complaint_id")
                cat = row.get("complaint_category")
                if cid and cat:
                    try:
                        done_ids.add(int(cid))
                        kept_rows.append(row)
                    except ValueError:
                        pass
        with out_csv.open("w", newline="", encoding="utf-8") as wf:
            writer = csv.DictWriter(wf, fieldnames=CSV_FIELDS)
            writer.writeheader()
            for row in kept_rows:
                writer.writerow({k: row.get(k, "") for k in CSV_FIELDS})

    remaining = [c for c in complaints if int(c["complaint_id"]) not in done_ids]
    print(f"running Sonnet on {len(remaining)} human-labeled complaints "
          f"({len(done_ids)} already done, {len(complaints)} total)")
    print(f"  rate: {RPM} rpm, concurrency: {CONCURRENCY}")
    print(f"  estimated runtime: ~{len(remaining) * 60 / RPM / 60:.1f} min "
          f"(rate-limited at {RPM} rpm)")

    if not remaining:
        print(f"nothing to do — all {len(complaints)} rows already in {out_csv.relative_to(ROOT.parent)}")
        return

    sem = asyncio.Semaphore(CONCURRENCY)
    limiter = _MinIntervalLimiter(RPM)
    tasks = [label_one(client, c, sem, limiter) for c in remaining]

    write_header = not out_csv.exists() or out_csv.stat().st_size == 0
    f = out_csv.open("a", newline="", encoding="utf-8")
    writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
    if write_header:
        writer.writeheader()
    ef = err_log.open("a", encoding="utf-8")

    errors = 0
    t0 = time.time()
    try:
        for fut in tqdm_asyncio.as_completed(tasks, total=len(tasks), desc="sonnet"):
            row = await fut
            err = row.pop("_error", None)
            if err:
                errors += 1
                ef.write(f"{datetime.now(timezone.utc).isoformat()}\t{row['complaint_id']}\t{err}\n")
                ef.flush()
            writer.writerow(row)
            f.flush()
    finally:
        f.close()
        ef.close()

    print(f"\ndone in {time.time() - t0:.1f}s. wrote {len(remaining)} rows "
          f"({errors} errors) to {out_csv.relative_to(ROOT.parent)}")


if __name__ == "__main__":
    asyncio.run(main())

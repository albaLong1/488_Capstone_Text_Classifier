"""Label the mortgage holdout with 9 LLMs (3 Anthropic, 3 Google, 3 DeepSeek).

Output: one CSV per model under gen_ai_labeling/outputs/<labeler_name>/labels.csv
matching the human `labels` table schema (complaint_id, labeler_name,
unfairness_type, justice_violation, severity, created_at).

Usage:
  python run_labeling.py                 # all 9 models, full holdout
  python run_labeling.py --limit 25      # quick smoke test
  python run_labeling.py --models anthropic__claude-haiku-4-5 deepseek__chat-temp0
  python run_labeling.py --concurrency 4
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from dotenv import load_dotenv
from tqdm.asyncio import tqdm_asyncio

from prompt import (
    RESPONSE_SCHEMA,
    SYSTEM_PROMPT,
    VALID_JUSTICE,
    VALID_SEVERITY,
    VALID_UNFAIRNESS,
    build_user_prompt,
)

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

HOLDOUT_CSV = ROOT.parent / "data" / "mortgage_holdout_1000.csv"
OUTPUT_DIR  = ROOT / "outputs"
CSV_FIELDS  = ["complaint_id", "labeler_name", "unfairness_type",
               "justice_violation", "severity", "created_at"]


# --- model registry --------------------------------------------------------

MODELS: list[dict[str, Any]] = [
    # Anthropic — tier is 5 RPM per model; pace at 4 RPM to stay under
    {"id": "anthropic__claude-opus-4-7",    "provider": "anthropic", "model": "claude-opus-4-7",           "concurrency": 2, "rpm": 4},
    {"id": "anthropic__claude-sonnet-4-6",  "provider": "anthropic", "model": "claude-sonnet-4-6",         "concurrency": 2, "rpm": 4},
    {"id": "anthropic__claude-haiku-4-5",   "provider": "anthropic", "model": "claude-haiku-4-5-20251001", "concurrency": 2, "rpm": 4},
    # Google
    {"id": "google__gemini-2.5-pro",        "provider": "google",    "model": "gemini-2.5-pro",            "concurrency": 6},
    {"id": "google__gemini-2.5-flash",      "provider": "google",    "model": "gemini-2.5-flash",          "concurrency": 20},
    {"id": "google__gemini-2.5-flash-lite", "provider": "google",    "model": "gemini-2.5-flash-lite",     "concurrency": 25},
    # DeepSeek — three temperature "effort" variants on the cheapest endpoint (deepseek-chat).
    # Skips the pricier deepseek-reasoner to stay well under the $5 budget.
    {"id": "deepseek__chat-temp0",  "provider": "deepseek", "model": "deepseek-chat", "temperature": 0.0, "concurrency": 20},
    {"id": "deepseek__chat-temp03", "provider": "deepseek", "model": "deepseek-chat", "temperature": 0.3, "concurrency": 20},
    {"id": "deepseek__chat-temp07", "provider": "deepseek", "model": "deepseek-chat", "temperature": 0.7, "concurrency": 20},
]


# --- rate limiting ---------------------------------------------------------

class _MinIntervalLimiter:
    """Token-bucket-ish async limiter: enforces at most `rpm` acquires per minute.

    Used to stay under per-model RPM caps (Anthropic's starter tier is 5 RPM).
    """
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


# --- response parsing / validation ----------------------------------------

_JSON_OBJ_RE = re.compile(r"\{.*\}", re.DOTALL)


def _extract_json(text: str) -> dict[str, Any]:
    """Pull the first JSON object out of a model's text response."""
    text = text.strip()
    # strip ```json ... ``` fences if present
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = _JSON_OBJ_RE.search(text)
        if not m:
            raise
        return json.loads(m.group(0))


def _validate(label: dict[str, Any]) -> dict[str, Any]:
    unfairness = label.get("unfairness_type")
    justice    = label.get("justice_violation")
    severity   = label.get("severity")
    if not isinstance(unfairness, list) or not unfairness:
        raise ValueError(f"unfairness_type must be a non-empty array, got {unfairness!r}")
    bad_u = [u for u in unfairness if u not in VALID_UNFAIRNESS]
    if bad_u:
        raise ValueError(f"invalid unfairness_type values: {bad_u}")
    if justice not in VALID_JUSTICE:
        raise ValueError(f"invalid justice_violation: {justice!r}")
    if severity not in VALID_SEVERITY:
        raise ValueError(f"invalid severity: {severity!r}")
    # de-dupe while preserving order
    seen, deduped = set(), []
    for u in unfairness:
        if u not in seen:
            seen.add(u)
            deduped.append(u)
    return {"unfairness_type": deduped, "justice_violation": justice, "severity": severity}


# --- provider clients ------------------------------------------------------

def _make_anthropic_client():
    from anthropic import AsyncAnthropic
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        return None
    return AsyncAnthropic(api_key=key)


def _make_gemini_client():
    from google import genai
    key = os.getenv("GOOGLE_API_KEY")
    if not key:
        return None
    return genai.Client(api_key=key)


def _make_deepseek_client():
    from openai import AsyncOpenAI
    key = os.getenv("DEEPSEEK_API_KEY")
    if not key:
        return None
    return AsyncOpenAI(api_key=key, base_url="https://api.deepseek.com")


# --- per-provider call helpers --------------------------------------------

async def _call_anthropic(client, model_cfg, user_prompt: str) -> dict:
    # Force structured output via tool_use.
    tool = {
        "name": "submit_label",
        "description": "Submit the three-dimensional label for this complaint.",
        "input_schema": RESPONSE_SCHEMA,
    }
    msg = await client.messages.create(
        model=model_cfg["model"],
        max_tokens=256,
        system=SYSTEM_PROMPT,
        tools=[tool],
        tool_choice={"type": "tool", "name": "submit_label"},
        messages=[{"role": "user", "content": user_prompt}],
    )
    for block in msg.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "submit_label":
            return dict(block.input)
    # fallback: try to parse any text block
    text = "".join(getattr(b, "text", "") for b in msg.content)
    return _extract_json(text)


def _gemini_schema(schema: dict) -> dict:
    """Convert a JSON-Schema dict into Gemini's OpenAPI-subset form.

    Strips keys Gemini rejects (`additionalProperties`, `minItems`) while
    preserving `type`, `enum`, `properties`, `items`, and `required`.
    """
    if not isinstance(schema, dict):
        return schema
    out = {}
    for k, v in schema.items():
        if k in ("additionalProperties", "minItems"):
            continue
        if isinstance(v, dict):
            out[k] = _gemini_schema(v)
        elif isinstance(v, list):
            out[k] = [_gemini_schema(x) if isinstance(x, dict) else x for x in v]
        else:
            out[k] = v
    return out


_GEMINI_SCHEMA = None  # memoized


async def _call_gemini(client, model_cfg, user_prompt: str) -> dict:
    from google.genai import types

    global _GEMINI_SCHEMA
    if _GEMINI_SCHEMA is None:
        _GEMINI_SCHEMA = _gemini_schema(RESPONSE_SCHEMA)

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        response_mime_type="application/json",
        response_schema=_GEMINI_SCHEMA,
        temperature=0.0,
    )
    resp = await client.aio.models.generate_content(
        model=model_cfg["model"],
        contents=user_prompt,
        config=config,
    )
    text = resp.text or ""
    return _extract_json(text)


async def _call_deepseek(client, model_cfg, user_prompt: str) -> dict:
    kwargs = {
        "model": model_cfg["model"],
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
    }
    # deepseek-reasoner does not accept temperature; deepseek-chat does.
    if model_cfg["model"] != "deepseek-reasoner":
        kwargs["temperature"] = float(model_cfg.get("temperature", 0.0))
    resp = await client.chat.completions.create(**kwargs)
    text = resp.choices[0].message.content or ""
    return _extract_json(text)


PROVIDER_CALL = {
    "anthropic": _call_anthropic,
    "google":    _call_gemini,
    "deepseek":  _call_deepseek,
}


# --- labeling driver -------------------------------------------------------

async def label_one(client, model_cfg, complaint, semaphore, limiter=None, retries=2):
    user_prompt = build_user_prompt(
        issue=complaint["issue"],
        sub_issue=complaint["sub_issue"],
        narrative=complaint["complaint_what_happened"],
    )
    fn = PROVIDER_CALL[model_cfg["provider"]]
    last_err = None
    async with semaphore:
        for attempt in range(retries + 1):
            try:
                if limiter is not None:
                    await limiter.acquire()
                raw = await fn(client, model_cfg, user_prompt)
                label = _validate(raw)
                return {
                    "complaint_id":      int(complaint["complaint_id"]),
                    "labeler_name":      model_cfg["id"],
                    "unfairness_type":   json.dumps(label["unfairness_type"]),
                    "justice_violation": label["justice_violation"],
                    "severity":          label["severity"],
                    "created_at":        datetime.now(timezone.utc).isoformat(),
                }
            except Exception as e:  # network errors, validation errors, etc.
                last_err = e
                if attempt < retries:
                    await asyncio.sleep(2 ** attempt)
        # exhausted retries
        return {
            "complaint_id":      int(complaint["complaint_id"]),
            "labeler_name":      model_cfg["id"],
            "unfairness_type":   "",
            "justice_violation": "",
            "severity":          "",
            "created_at":        datetime.now(timezone.utc).isoformat(),
            "_error":            f"{type(last_err).__name__}: {last_err}",
        }


def _dedupe_labels_csv(out_csv: Path) -> None:
    """Rewrite the CSV so each complaint_id appears at most once.

    If a complaint has both a good row and an empty/error row (from a prior
    buggy resume), keep the good one. Safe to call on a missing file.
    """
    if not out_csv.exists() or out_csv.stat().st_size == 0:
        return
    df = pd.read_csv(out_csv)
    if "complaint_id" not in df.columns:
        return
    # mark each row's "quality" — 1 if it has a real label, 0 otherwise
    has_label = df["unfairness_type"].notna() & (df["unfairness_type"].astype(str).str.strip() != "")
    df = df.assign(_good=has_label.astype(int))
    # for each complaint_id keep the best (good first), then oldest
    df = df.sort_values(by=["_good", "created_at"], ascending=[False, True])
    df = df.drop_duplicates(subset=["complaint_id"], keep="first")
    df = df.sort_values(by="complaint_id").drop(columns="_good")
    df.to_csv(out_csv, index=False, columns=CSV_FIELDS)


def _load_existing(out_csv: Path) -> set[int]:
    """Return the set of complaint_ids that already have a real (non-empty) label.

    Rows with an empty/NaN `unfairness_type` are treated as failures and get
    retried on re-run. Pandas reads an empty CSV cell as NaN, so we must
    explicitly filter NaN here — `.astype(str)` on a NaN gives the literal
    string "nan", which would otherwise falsely count as done.
    """
    if not out_csv.exists():
        return set()
    df = pd.read_csv(out_csv)
    if "complaint_id" not in df.columns:
        return set()
    if "unfairness_type" in df.columns:
        col = df["unfairness_type"]
        mask = col.notna() & (col.astype(str).str.strip() != "")
        df = df[mask]
    return set(df["complaint_id"].astype(int).tolist())


async def run_model(model_cfg, complaints: list[dict], cli_concurrency: int | None):
    out_dir = OUTPUT_DIR / model_cfg["id"]
    out_dir.mkdir(parents=True, exist_ok=True)
    out_csv  = out_dir / "labels.csv"
    err_log  = out_dir / "errors.log"

    # pick client
    if model_cfg["provider"] == "anthropic":
        client = _make_anthropic_client()
    elif model_cfg["provider"] == "google":
        client = _make_gemini_client()
    else:
        client = _make_deepseek_client()
    if client is None:
        print(f"[skip] {model_cfg['id']}: missing API key for {model_cfg['provider']}")
        return

    _dedupe_labels_csv(out_csv)
    done = _load_existing(out_csv)
    todo = [c for c in complaints if int(c["complaint_id"]) not in done]
    if not todo:
        print(f"[done] {model_cfg['id']}: already complete ({len(done)} rows)")
        return

    concurrency = cli_concurrency or model_cfg.get("concurrency", 6)
    print(f"[run]  {model_cfg['id']}: {len(todo)} to label, concurrency={concurrency} "
          f"(skipping {len(done)} already done) → {out_csv.relative_to(ROOT.parent)}")

    file_exists = out_csv.exists() and out_csv.stat().st_size > 0
    f = out_csv.open("a", newline="", encoding="utf-8")
    writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
    if not file_exists:
        writer.writeheader()
        f.flush()
    ef = err_log.open("a", encoding="utf-8")

    sem = asyncio.Semaphore(concurrency)
    limiter = _MinIntervalLimiter(model_cfg["rpm"]) if model_cfg.get("rpm") else None
    tasks = [label_one(client, model_cfg, c, sem, limiter) for c in todo]

    errors = 0
    try:
        for fut in tqdm_asyncio.as_completed(tasks, total=len(tasks), desc=model_cfg["id"]):
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

    print(f"[end]  {model_cfg['id']}: wrote {len(todo)} rows ({errors} errors; see errors.log)")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--models", nargs="*", default=None,
                   help="Subset of model ids or providers to run. Default: all.")
    p.add_argument("--limit", type=int, default=None,
                   help="Only label the first N complaints (smoke test).")
    p.add_argument("--concurrency", type=int, default=None,
                   help="Override concurrency for every model. Default: per-model tuned values in the MODELS registry.")
    p.add_argument("--skip", nargs="*", default=None,
                   help="Model ids or providers to exclude from the run.")
    p.add_argument("--list", action="store_true",
                   help="List the model registry and exit.")
    return p.parse_args()


def select_models(filters: list[str] | None, skips: list[str] | None) -> list[dict]:
    if filters:
        chosen = [m for m in MODELS if m["id"] in filters or m["provider"] in filters]
    else:
        chosen = list(MODELS)
    if skips:
        chosen = [m for m in chosen if m["id"] not in skips and m["provider"] not in skips]
    return chosen


def load_complaints(limit: int | None) -> list[dict]:
    df = pd.read_csv(HOLDOUT_CSV)
    df = df[["complaint_id", "issue", "sub_issue", "complaint_what_happened"]]
    df = df.fillna("")
    if limit:
        df = df.head(limit)
    return df.to_dict("records")


async def main():
    args = parse_args()
    if args.list:
        for m in MODELS:
            extra = f" (temp={m['temperature']})" if "temperature" in m else ""
            print(f"  {m['id']:36s}  provider={m['provider']:9s}  model={m['model']}{extra}")
        return

    models = select_models(args.models, args.skip)
    if not models:
        print(f"no models matched {args.models!r} (skip={args.skip!r}); use --list to see available ids", file=sys.stderr)
        sys.exit(1)

    complaints = load_complaints(args.limit)
    print(f"loaded {len(complaints)} complaints from {HOLDOUT_CSV.name}")
    print(f"running {len(models)} model(s): {[m['id'] for m in models]}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    t0 = time.time()

    # Run the 3 providers in parallel (independent rate-limit buckets), but
    # keep models within a provider sequential so each one gets the full
    # provider-side quota while running.
    by_provider: dict[str, list[dict]] = {}
    for m in models:
        by_provider.setdefault(m["provider"], []).append(m)

    async def run_provider_chain(chain: list[dict]):
        for m in chain:
            await run_model(m, complaints, args.concurrency)

    await asyncio.gather(*(run_provider_chain(chain) for chain in by_provider.values()))

    print(f"all done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    asyncio.run(main())

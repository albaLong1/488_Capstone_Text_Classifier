"""Remap old (unfairness_type, justice_violation, severity) labels into the
new single-select complaint_category schema:

  1. improper_charges          (financial / dollar dispute)
  2. improper_process          (procedural / admin — fallback)
  3. deceptive_discriminatory  (deception / discrimination — trumps 1 and 2)

Precedence: Cat 3 > Cat 1 > Cat 2.

Per-token rules:
  unethical_collections                 → Cat 3
  unaware_of_charge, excessive_charge   → Cat 1
  delay, none_other                     → Cat 2 (fallback)

The justice_violation field is unused — empirically it skews "procedural"
across all three true categories (~80% even on human-Cat3 rows), so it
has no discriminative power. See tune_remap.py for the rule comparison.

Reads each gen_ai_labeling/outputs/*/labels.csv and writes a sibling
labels_remapped.csv with columns:
  complaint_id, labeler_name, complaint_category, created_at
"""

from __future__ import annotations

import csv
import glob
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "outputs"

CAT_CHARGES = "improper_charges"
CAT_PROCESS = "improper_process"
CAT_DECEPTIVE = "deceptive_discriminatory"

CHARGE_TOKENS = {"unaware_of_charge", "excessive_charge"}
PROCESS_TOKENS = {"delay", "none_other"}
DECEPTIVE_TOKEN = "unethical_collections"

NEW_FIELDS = ["complaint_id", "labeler_name", "complaint_category", "created_at"]


def remap(unfairness: list[str], justice: str | None = None) -> str:
    tokens = set(unfairness or [])
    if DECEPTIVE_TOKEN in tokens:
        return CAT_DECEPTIVE
    if tokens & CHARGE_TOKENS:
        return CAT_CHARGES
    return CAT_PROCESS


def _parse_unfairness(raw: str) -> list[str]:
    if not raw or not raw.strip():
        return []
    try:
        val = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(val, list):
        return [str(x) for x in val]
    if isinstance(val, str):
        return [val]
    return []


def remap_file(in_csv: Path) -> tuple[Path, Counter, int]:
    out_csv = in_csv.with_name("labels_remapped.csv")
    counts: Counter = Counter()
    skipped = 0

    with in_csv.open(newline="", encoding="utf-8") as f_in, \
         out_csv.open("w", newline="", encoding="utf-8") as f_out:
        reader = csv.DictReader(f_in)
        writer = csv.DictWriter(f_out, fieldnames=NEW_FIELDS)
        writer.writeheader()

        for row in reader:
            unfairness = _parse_unfairness(row.get("unfairness_type", ""))
            if not unfairness:
                # failed/empty original label — skip rather than guess
                skipped += 1
                continue
            justice = (row.get("justice_violation") or "").strip() or None
            category = remap(unfairness, justice)
            counts[category] += 1
            writer.writerow({
                "complaint_id":       row["complaint_id"],
                "labeler_name":       row["labeler_name"],
                "complaint_category": category,
                "created_at":         row.get("created_at", ""),
            })

    return out_csv, counts, skipped


def main() -> None:
    files = sorted(Path(p) for p in glob.glob(str(OUTPUT_DIR / "*" / "labels.csv")))
    if not files:
        print(f"no labels.csv files under {OUTPUT_DIR}")
        return

    grand = Counter()
    grand_skipped = 0
    for in_csv in files:
        out_csv, counts, skipped = remap_file(in_csv)
        grand.update(counts)
        grand_skipped += skipped
        n = sum(counts.values())
        pct = lambda k: f"{counts[k]/n*100:5.1f}%" if n else "    -"
        rel = out_csv.relative_to(ROOT.parent)
        print(f"{in_csv.parent.name:36s}  "
              f"{n:5d} rows  "
              f"charges={counts[CAT_CHARGES]:4d} ({pct(CAT_CHARGES)})  "
              f"process={counts[CAT_PROCESS]:4d} ({pct(CAT_PROCESS)})  "
              f"deceptive={counts[CAT_DECEPTIVE]:4d} ({pct(CAT_DECEPTIVE)})  "
              f"skipped={skipped}")

    n = sum(grand.values())
    print()
    print(f"TOTAL: {n} rows across {len(files)} models, skipped {grand_skipped} empty rows")
    if n:
        for k in (CAT_CHARGES, CAT_PROCESS, CAT_DECEPTIVE):
            print(f"  {k:28s} {grand[k]:5d}  ({grand[k]/n*100:5.2f}%)")


if __name__ == "__main__":
    main()

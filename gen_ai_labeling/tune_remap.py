"""Try several deterministic remap rules and report macro-F1 vs human consensus.

Reads the original labels.csv files (with old schema) and the human consensus,
applies each candidate rule, and prints macro-F1 + per-class F1.
"""

from __future__ import annotations

import glob
import json
from pathlib import Path

import pandas as pd
from sklearn.metrics import f1_score, accuracy_score, precision_recall_fscore_support

ROOT = Path(__file__).resolve().parent
HUMAN = Path("/Users/aryanchoudhary/Downloads/human_category_labels.csv")

CATS = ["improper_charges", "improper_process", "deceptive_discriminatory"]
CAT1, CAT2, CAT3 = CATS


def parse_tokens(raw: str) -> set[str]:
    if not isinstance(raw, str) or not raw.strip():
        return set()
    try:
        v = json.loads(raw)
        return set(v) if isinstance(v, list) else {v}
    except Exception:
        return set()


# --- candidate rules ------------------------------------------------------

def rule_v1(tokens: set[str], justice: str, severity: str) -> str:
    """Original rule: unethical_collections + non-procedural justice → Cat 3."""
    if "unethical_collections" in tokens and justice != "procedural":
        return CAT3
    if tokens & {"unaware_of_charge", "excessive_charge"}:
        return CAT1
    return CAT2


def rule_v2(tokens: set[str], justice: str, severity: str) -> str:
    """Drop the justice gate — any unethical_collections → Cat 3."""
    if "unethical_collections" in tokens:
        return CAT3
    if tokens & {"unaware_of_charge", "excessive_charge"}:
        return CAT1
    return CAT2


def rule_v3(tokens: set[str], justice: str, severity: str) -> str:
    """Cat 3 only when unethical_collections AND severity == high."""
    if "unethical_collections" in tokens and severity == "high":
        return CAT3
    if tokens & {"unaware_of_charge", "excessive_charge"}:
        return CAT1
    return CAT2


def rule_v4(tokens: set[str], justice: str, severity: str) -> str:
    """Cat 3 if unethical_collections AND (high severity OR non-procedural justice)."""
    if "unethical_collections" in tokens and (severity == "high" or justice != "procedural"):
        return CAT3
    if tokens & {"unaware_of_charge", "excessive_charge"}:
        return CAT1
    return CAT2


def rule_v5(tokens: set[str], justice: str, severity: str) -> str:
    """Broaden Cat 3: unethical_collections, OR high+interactional, OR
    high severity with no charge token (suggests fraud / discrimination)."""
    has_unethical = "unethical_collections" in tokens
    has_charge = bool(tokens & {"unaware_of_charge", "excessive_charge"})
    if has_unethical:
        return CAT3
    if severity == "high" and justice == "interactional":
        return CAT3
    if has_charge:
        return CAT1
    return CAT2


def rule_v6(tokens: set[str], justice: str, severity: str) -> str:
    """v5 minus the standalone interactional clause."""
    if "unethical_collections" in tokens:
        return CAT3
    has_charge = bool(tokens & {"unaware_of_charge", "excessive_charge"})
    if has_charge:
        return CAT1
    return CAT2


RULES = {
    "v1 (orig: unethical & ¬procedural)": rule_v1,
    "v2 (any unethical → Cat3)":          rule_v2,
    "v3 (unethical & high)":              rule_v3,
    "v4 (unethical & (high | ¬proc))":    rule_v4,
    "v5 (unethical OR high+interact)":    rule_v5,
    "v6 (unethical → Cat3, simple)":      rule_v6,
}


# --- evaluation -----------------------------------------------------------

def main() -> None:
    h = pd.read_csv(HUMAN)
    truth = h.dropna(subset=["consensus_category_slugs"])[
        ["complaint_id", "consensus_category_slugs"]
    ].copy()
    truth["complaint_id"] = truth["complaint_id"].astype(int)
    truth = truth.rename(columns={"consensus_category_slugs": "y_true"})

    rows = []
    for f in sorted(glob.glob(str(ROOT / "outputs" / "*" / "labels.csv"))):
        df = pd.read_csv(f)
        df["complaint_id"] = df["complaint_id"].astype(int)
        df["_model"] = f.split("/")[-2]
        df["_tokens"] = df["unfairness_type"].apply(parse_tokens)
        rows.append(df)
    ai = pd.concat(rows, ignore_index=True)
    merged = ai.merge(truth, on="complaint_id")
    print(f"merged rows: {len(merged)} (across 9 models × 93 consensus complaints)")
    print()

    print(f"{'rule':40s}  {'macroF1':>7s}  {'acc':>6s}  "
          f"{'F1_chg':>6s}  {'F1_prc':>6s}  {'F1_dec':>6s}  "
          f"{'P_dec':>6s}  {'R_dec':>6s}")
    print("-" * 105)
    for name, fn in RULES.items():
        merged["y_pred"] = merged.apply(
            lambda r: fn(r._tokens, r.justice_violation, r.severity), axis=1
        )
        macro = f1_score(merged.y_true, merged.y_pred, labels=CATS, average="macro", zero_division=0)
        acc = accuracy_score(merged.y_true, merged.y_pred)
        p, r, f1, _ = precision_recall_fscore_support(
            merged.y_true, merged.y_pred, labels=CATS, zero_division=0
        )
        print(f"{name:40s}  {macro:7.3f}  {acc:6.3f}  "
              f"{f1[0]:6.3f}  {f1[1]:6.3f}  {f1[2]:6.3f}  "
              f"{p[2]:6.3f}  {r[2]:6.3f}")


if __name__ == "__main__":
    main()

"""Score each AI model's remapped labels against the human consensus.

Ground truth: consensus_category_slugs from human_category_labels.csv (rows
where all 3 raters agreed). Predictions: labels_remapped.csv per model.

Reports per-class precision/recall/F1, macro-F1, and accuracy.
"""

from __future__ import annotations

import argparse
import glob
from pathlib import Path

import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    f1_score,
    precision_recall_fscore_support,
)

ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "outputs"

CATS = ["improper_charges", "improper_process", "deceptive_discriminatory"]


def load_truth(path: Path) -> pd.DataFrame:
    h = pd.read_csv(path)
    truth = h.dropna(subset=["consensus_category_slugs"]).copy()
    truth["complaint_id"] = truth["complaint_id"].astype(int)
    return truth[["complaint_id", "consensus_category_slugs"]].rename(
        columns={"consensus_category_slugs": "y_true"}
    )


def score_model(in_csv: Path, truth: pd.DataFrame) -> dict | None:
    df = pd.read_csv(in_csv)
    df["complaint_id"] = df["complaint_id"].astype(int)
    df = df[["complaint_id", "complaint_category"]].rename(
        columns={"complaint_category": "y_pred"}
    )
    merged = truth.merge(df, on="complaint_id", how="inner")
    if merged.empty:
        return None

    y_true = merged["y_true"].tolist()
    y_pred = merged["y_pred"].tolist()

    p, r, f1, sup = precision_recall_fscore_support(
        y_true, y_pred, labels=CATS, zero_division=0
    )
    macro_f1 = f1_score(y_true, y_pred, labels=CATS, average="macro", zero_division=0)
    acc = accuracy_score(y_true, y_pred)
    return {
        "model": in_csv.parent.name,
        "n": len(merged),
        "accuracy": acc,
        "macro_f1": macro_f1,
        "f1_charges": f1[0],
        "f1_process": f1[1],
        "f1_deceptive": f1[2],
        "p_charges": p[0],
        "p_process": p[1],
        "p_deceptive": p[2],
        "r_charges": r[0],
        "r_process": r[1],
        "r_deceptive": r[2],
        "sup_charges": sup[0],
        "sup_process": sup[1],
        "sup_deceptive": sup[2],
        "y_true": y_true,
        "y_pred": y_pred,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--human", default="/Users/aryanchoudhary/Downloads/human_category_labels.csv")
    ap.add_argument("--report", action="store_true",
                    help="also print sklearn classification_report per model")
    args = ap.parse_args()

    truth = load_truth(Path(args.human))
    print(f"ground truth: {len(truth)} complaints with full 3-rater consensus")
    print(f"  class support: " + ", ".join(
        f"{c}={int((truth.y_true == c).sum())}" for c in CATS
    ))
    print()

    files = sorted(Path(p) for p in glob.glob(str(OUTPUT_DIR / "*" / "labels_remapped.csv")))
    rows = []
    detailed = []
    for f in files:
        s = score_model(f, truth)
        if s is None:
            continue
        rows.append(s)
        detailed.append(s)

    if not rows:
        print("no remapped labels found — run remap_to_categories.py first")
        return

    df = pd.DataFrame(rows).sort_values("macro_f1", ascending=False)

    print(f"{'model':36s}  {'n':>3s}  {'acc':>6s}  {'macroF1':>7s}  "
          f"{'F1_chg':>6s}  {'F1_prc':>6s}  {'F1_dec':>6s}")
    print("-" * 90)
    for _, r in df.iterrows():
        print(f"{r['model']:36s}  {r['n']:3d}  {r['accuracy']:6.3f}  {r['macro_f1']:7.3f}  "
              f"{r['f1_charges']:6.3f}  {r['f1_process']:6.3f}  {r['f1_deceptive']:6.3f}")

    print()
    print(f"{'model':36s}  {'P_chg':>6s}  {'R_chg':>6s}  {'P_prc':>6s}  {'R_prc':>6s}  "
          f"{'P_dec':>6s}  {'R_dec':>6s}")
    print("-" * 90)
    for _, r in df.iterrows():
        print(f"{r['model']:36s}  {r['p_charges']:6.3f}  {r['r_charges']:6.3f}  "
              f"{r['p_process']:6.3f}  {r['r_process']:6.3f}  "
              f"{r['p_deceptive']:6.3f}  {r['r_deceptive']:6.3f}")

    if args.report:
        print()
        for s in detailed:
            print(f"\n=== {s['model']} ===")
            print(classification_report(
                s["y_true"], s["y_pred"], labels=CATS, zero_division=0, digits=3
            ))


if __name__ == "__main__":
    main()

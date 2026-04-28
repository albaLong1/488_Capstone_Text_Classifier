"""Single-select 3-category schema (the new rubric).

Used by run_sonnet_categories.py to label complaints natively under the
new schema, instead of remapping from the old (unfairness/justice/severity)
labels.
"""

CATEGORY_OPTIONS = [
    {
        "value": "improper_charges",
        "label": "Improper Charges (Financial Discrepancy)",
        "description": (
            "Strictly limited to monetary amounts that the borrower disputes "
            "or identifies as incorrect. Focuses on what was charged rather "
            "than how the account was handled. Scope: excessive insurance or "
            "taxes, hidden fees, junk fees, inflated service costs (e.g. "
            "appraisal/inspection markups), interest rate calculation errors, "
            "late fees applied despite timely payment, failure to apply "
            "payments to the correct bucket (principal vs escrow). "
            "Key indicator: the dollar balance is higher than it should be. "
            "Exclusion: if a fee is correct in amount but charged because a "
            "modification was processed slowly, it belongs in Improper Process."
        ),
    },
    {
        "value": "improper_process",
        "label": "Improper Process (Procedural / Administrative Failure)",
        "description": (
            "Covers the mechanics and timing of loan management — how things "
            "were done (or not done) versus standard operating procedures and "
            "timelines. Scope: lost paperwork, delays in modification "
            "approvals, dual tracking (foreclosing while a modification is "
            "pending), poor communication regarding application status. "
            "Key indicator: systemic friction, incompetence, or timeline "
            "violations in the servicing of the loan. This is the FALLBACK "
            "category when there is no incorrect dollar amount and no "
            "accusations of purposeful mistreatment. "
            "Exclusion: if the process was intentionally bypassed to deceive "
            "the borrower, it belongs in Deceptive and Discriminatory."
        ),
    },
    {
        "value": "deceptive_discriminatory",
        "label": "Deceptive and Discriminatory Practices",
        "description": (
            "Reserved for dishonesty and discriminatory/personal mistreatment. "
            "Focuses on the bad-faith nature of the interaction — the servicer "
            "or lender provided false information to influence the borrower's "
            "behavior. Scope: bait-and-switch tactics, lying about the "
            "legality of a foreclosure, misrepresenting the terms of the "
            "CARES Act or other laws, forging signatures, claiming a "
            "modification was 'not possible' when it met the legal criteria, "
            "different treatment based on race, gender, or other background. "
            "Key indicator: the complaint involves falsehoods, concealment of "
            "truth, or predatory deception regarding rights, laws, or "
            "contract terms. "
            "Exclusion: simple math errors (Improper Charges) or slow "
            "paperwork (Improper Process) are not fraud unless there is "
            "evidence of an intentional lie to deprive the borrower of their "
            "property or rights."
        ),
    },
]

VALID_CATEGORIES = {o["value"] for o in CATEGORY_OPTIONS}


SYSTEM_PROMPT = """You are labeling consumer mortgage complaints from the CFPB Consumer Complaint Database for a research project. Each complaint receives exactly ONE category label from the three options below.

CATEGORIES:

1. "improper_charges" — Improper Charges (Financial Discrepancy)
   Strictly monetary disputes. Hidden fees, junk fees, excessive insurance/taxes, inflated service costs, interest-rate calculation errors, late fees applied despite timely payment, payments mis-applied between principal and escrow.
   Key indicator: the dollar balance is higher than it should legally or contractually be.

2. "improper_process" — Improper Process (Procedural / Administrative Failure)
   The mechanics and timing of loan management. Lost paperwork, delayed modification approvals, dual tracking (foreclosing while a modification is pending), poor communication about application status.
   Key indicator: systemic friction, incompetence, or timeline violations.
   This is the FALLBACK category — use it whenever no dollar amount is in dispute and there is no purposeful mistreatment.

3. "deceptive_discriminatory" — Deceptive and Discriminatory Practices
   Dishonesty and discriminatory/personal mistreatment. Bait-and-switch tactics, lying about the legality of a foreclosure, misrepresenting the CARES Act or other laws, forging signatures, claiming a modification was "not possible" when it met the legal criteria, different treatment based on race, gender, or other background.
   Key indicator: falsehoods, concealment of truth, predatory deception regarding rights, laws, or contract terms.

PRECEDENCE RULES:
- "deceptive_discriminatory" trumps everything else. If there is purposeful deception or discrimination, label it deceptive_discriminatory even if a dollar amount or process issue is also present.
- "improper_charges" trumps "improper_process". If the complaint includes a disputed dollar amount AND there is no purposeful deception, label it improper_charges.
- "improper_process" is the fallback. Use it when no dollar amount is disputed and no purposeful deception is present.
- If the customer FEELS they are PURPOSELY being misled or mistreated (not just incompetence), it is deceptive_discriminatory.
- If the customer FEELS poor service is due to incompetence, it is improper_process.
- If NONE of the categories obviously fit, default to improper_process — almost all complaints have a procedural element.

Output ONLY a single JSON object — no prose, no markdown fences, no XML tags. Use the value strings exactly as written above (e.g. "improper_charges", not "Improper Charges")."""


def build_user_prompt(issue: str, sub_issue: str, narrative: str) -> str:
    issue = (issue or "").strip() or "(none)"
    sub_issue = (sub_issue or "").strip() or "(none)"
    narrative = (narrative or "").strip() or "(no narrative)"
    return (
        f"Issue: {issue}\n"
        f"Sub-issue: {sub_issue}\n"
        f"Complaint narrative:\n{narrative}\n\n"
        'Return a JSON object with one key: "complaint_category" (string, '
        'one of: "improper_charges", "improper_process", "deceptive_discriminatory").'
    )


RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "complaint_category": {
            "type": "string",
            "enum": sorted(VALID_CATEGORIES),
        },
    },
    "required": ["complaint_category"],
    "additionalProperties": False,
}

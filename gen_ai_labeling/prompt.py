"""Shared prompt + label-option definitions.

Mirrors labeler/lib/options.ts so the AI labelers see the same definitions
that the human labelers saw in the web UI.
"""

UNFAIRNESS_OPTIONS = [
    {"value": "unaware_of_charge",   "label": "Unaware of charge",            "hint": "hidden fee, unauthorized charge, deceptive pricing"},
    {"value": "excessive_charge",    "label": "Excessive charge",             "hint": "overdraft, rate discrimination"},
    {"value": "delay",               "label": "Delay on payment / modification", "hint": ""},
    {"value": "unethical_collections","label": "Unethical collections",       "hint": ""},
    {"value": "none_other",          "label": "None / Other",                 "hint": ""},
]

JUSTICE_OPTIONS = [
    {"value": "distributive",  "label": "Distributive",  "hint": "unfairness in the DECISION"},
    {"value": "procedural",    "label": "Procedural",    "hint": "unfairness in the PROCESS"},
    {"value": "interactional", "label": "Interactional", "hint": "unfairness in PERSONAL INTERACTION"},
]

SEVERITY_OPTIONS = [
    {"value": "low",    "label": "Low",    "hint": "<= $100, one-off, low emotional tone, no regulatory risk"},
    {"value": "medium", "label": "Medium", "hint": "$100-1,000, repeated issue, customer frustrated, early compliance concern"},
    {"value": "high",   "label": "High",   "hint": "$1,000+, fraud / discrimination / legal threat / severe distress"},
]

VALID_UNFAIRNESS = {o["value"] for o in UNFAIRNESS_OPTIONS}
VALID_JUSTICE    = {o["value"] for o in JUSTICE_OPTIONS}
VALID_SEVERITY   = {o["value"] for o in SEVERITY_OPTIONS}


def _format_options(options):
    lines = []
    for o in options:
        line = f'  - "{o["value"]}" ({o["label"]})'
        if o["hint"]:
            line += f": {o['hint']}"
        lines.append(line)
    return "\n".join(lines)


SYSTEM_PROMPT = f"""You are labeling consumer mortgage complaints from the CFPB Consumer Complaint Database for a research project. Each complaint must receive three labels matching the same scheme that human labelers used.

Pick labels using ONLY the values listed below (the value strings, not the labels).

1. unfairness_type — one OR MORE of:
{_format_options(UNFAIRNESS_OPTIONS)}

2. justice_violation — exactly ONE of:
{_format_options(JUSTICE_OPTIONS)}

3. severity — exactly ONE of:
{_format_options(SEVERITY_OPTIONS)}

Rules:
- Use only the value strings shown above (e.g. "unaware_of_charge", not "Unaware of charge").
- unfairness_type is an array with at least one value.
- If nothing else fits, use ["none_other"] for unfairness_type.
- The three fields are DISJOINT. Never put a justice_violation value ("distributive", "procedural", "interactional") into unfairness_type, and never put an unfairness_type value into justice_violation. Each value belongs to exactly one field.
- Base your judgment on the complaint text alone; do not invent facts.
- Output ONLY a single JSON object — no prose, no markdown fences, no XML tags."""


def build_user_prompt(issue: str, sub_issue: str, narrative: str) -> str:
    issue = (issue or "").strip() or "(none)"
    sub_issue = (sub_issue or "").strip() or "(none)"
    narrative = (narrative or "").strip() or "(no narrative)"
    return (
        f"Issue: {issue}\n"
        f"Sub-issue: {sub_issue}\n"
        f"Complaint narrative:\n{narrative}\n\n"
        "Return a JSON object with keys: unfairness_type (array of strings), "
        "justice_violation (string), severity (string)."
    )


# JSON schema usable by Anthropic tool_use, Gemini response_schema, and OpenAI-style structured output.
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "unfairness_type": {
            "type": "array",
            "items": {"type": "string", "enum": sorted(VALID_UNFAIRNESS)},
            "minItems": 1,
        },
        "justice_violation": {"type": "string", "enum": sorted(VALID_JUSTICE)},
        "severity":          {"type": "string", "enum": sorted(VALID_SEVERITY)},
    },
    "required": ["unfairness_type", "justice_violation", "severity"],
    "additionalProperties": False,
}

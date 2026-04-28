/** Stored in DB and CSV as `value` (slug). Each label is 1–2 slugs (deduped, sorted). */
export const COMPLAINT_CATEGORY_OPTIONS = [
  {
    value: 'improper_charges',
    label: 'Improper charges',
    meaning: 'Category 1 — financial / dollar dispute',
  },
  {
    value: 'improper_process',
    label: 'Improper process',
    meaning: 'Category 2 — procedural / admin (incl. “none clearly fit”)',
  },
  {
    value: 'deceptive_discriminatory',
    label: 'Deceptive and discriminatory',
    meaning: 'Category 3 — deception / discrimination',
  },
] as const;

/** Plain-language name for a slug (for UI); falls back to slug if unknown. */
export function categoryTitle(slug: string): string {
  const o = COMPLAINT_CATEGORY_OPTIONS.find((x) => x.value === slug);
  return o?.label ?? slug;
}

export const MIN_COMPLAINT_CATEGORY_PICKS = 1;
export const MAX_COMPLAINT_CATEGORY_PICKS = 2;

export const VALID_COMPLAINT_CATEGORY: Set<string> = new Set(
  COMPLAINT_CATEGORY_OPTIONS.map((o) => o.value),
);

/** Accepts a single slug string or an array; returns sorted unique slugs, or null if invalid. */
export function normalizeComplaintCategories(raw: unknown): string[] | null {
  const items: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'string' && raw.trim()
      ? [raw.trim()]
      : [];
  const out: string[] = [];
  for (const x of items) {
    if (typeof x !== 'string') return null;
    const v = x.trim();
    if (!VALID_COMPLAINT_CATEGORY.has(v)) return null;
    if (!out.includes(v)) out.push(v);
  }
  if (
    out.length < MIN_COMPLAINT_CATEGORY_PICKS ||
    out.length > MAX_COMPLAINT_CATEGORY_PICKS
  ) {
    return null;
  }
  return out.slice().sort();
}

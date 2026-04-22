export const UNFAIRNESS_OPTIONS = [
  { value: 'unaware_of_charge', label: 'Unaware of charge', hint: 'hidden fee, unauthorized charge, deceptive pricing' },
  { value: 'excessive_charge', label: 'Excessive charge', hint: 'overdraft, rate discrimination' },
  { value: 'delay', label: 'Delay on payment / modification', hint: '' },
  { value: 'unethical_collections', label: 'Unethical collections', hint: '' },
  { value: 'none_other', label: 'None / Other', hint: '' },
] as const;

export const JUSTICE_OPTIONS = [
  { value: 'distributive', label: 'Distributive', hint: 'unfairness in the DECISION' },
  { value: 'procedural', label: 'Procedural', hint: 'unfairness in the PROCESS' },
  { value: 'interactional', label: 'Interactional', hint: 'unfairness in PERSONAL INTERACTION' },
] as const;

export const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low', hint: '≤ $100, one-off, low emotional tone, no regulatory risk' },
  { value: 'medium', label: 'Medium', hint: '$100–1,000, repeated issue, customer frustrated, early compliance concern' },
  { value: 'high', label: 'High', hint: '$1,000+, fraud / discrimination / legal threat / severe distress' },
] as const;

export const VALID_UNFAIRNESS = new Set(UNFAIRNESS_OPTIONS.map((o) => o.value));
export const VALID_JUSTICE = new Set(JUSTICE_OPTIONS.map((o) => o.value));
export const VALID_SEVERITY = new Set(SEVERITY_OPTIONS.map((o) => o.value));

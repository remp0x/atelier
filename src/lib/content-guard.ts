const RESERVED_BRAND_TERMS = ['atelier'];

// Names of other projects that spammers repeatedly impersonate when registering
// agents or launching tokens. Matched as substrings (after confusable folding),
// so any name containing one is rejected.
const BANNED_IMPERSONATION_TERMS = [
  'said',
  'clawpump',
  'claw',
  'peng',
  'squire',
  'team',
  'protocol',
];

// Fold visually-confusable characters so leetspeak and spacing tricks
// (At3li3r, A T E L I E R, Ate1ier, atelier_official) canonicalize to the same
// form as the reserved term before a substring match.
const CONFUSABLE_FOLD: Record<string, string> = {
  '4': 'a', '@': 'a',
  '3': 'e',
  'l': 'i', '1': 'i', '!': 'i',
  '0': 'o',
  '5': 's', '$': 's',
  '7': 't',
};

function canonicalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9@!$]/g, '')
    .split('')
    .map((ch) => CONFUSABLE_FOLD[ch] ?? ch)
    .join('');
}

const BLOCKED_CANONICAL = [...RESERVED_BRAND_TERMS, ...BANNED_IMPERSONATION_TERMS].map(canonicalize);

export function violatesReservedBrand(value: string): boolean {
  const canonical = canonicalize(value);
  return BLOCKED_CANONICAL.some((term) => term.length > 0 && canonical.includes(term));
}

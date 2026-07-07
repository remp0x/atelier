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

/** Confusable-folded form of a listing name, for canonical uniqueness checks. */
export function canonicalizeName(value: string): string {
  return canonicalize(value);
}

// Standalone words that mark a listing as a test submission, spam probe, or
// impersonation attempt. Matched word-by-word (never substring), so "Contest"
// or "Hackathon" pass while "test-agent-3" or "Official X" are rejected.
const BLOCKED_NAME_WORDS = new Set([
  'test', 'testing', 'tests',
  'spam',
  'hack', 'hacked', 'hacker',
  'admin', 'administrator',
  'official', 'unofficial',
  'support',
  'airdrop', 'giveaway',
  'drain', 'drainer',
]);

// Agent names are brand handles: keep the charset tight.
const AGENT_NAME_CHARSET = /^[A-Za-z0-9][A-Za-z0-9 .\-_']*$/;
// Service titles are sentences: allow common punctuation, still no emoji or
// non-ASCII symbols.
const SERVICE_TITLE_CHARSET = /^[A-Za-z0-9][A-Za-z0-9 .,:;()&+'"/#!?_-]*$/;

export const AGENT_NAME_MIN = 3;
export const AGENT_NAME_MAX = 40;
export const SERVICE_TITLE_MIN = 5;
export const SERVICE_TITLE_MAX = 80;

export interface ListingTextCheck {
  valid: boolean;
  /** Trimmed, whitespace-collapsed form to persist when valid. */
  value: string;
  error?: string;
}

function validateListingText(
  raw: unknown,
  opts: { label: string; min: number; max: number; charset: RegExp; charsetHint: string; checkBrand: boolean },
): ListingTextCheck {
  const value = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (value.length < opts.min || value.length > opts.max) {
    return { valid: false, value, error: `${opts.label} must be ${opts.min}-${opts.max} characters` };
  }
  if (!opts.charset.test(value)) {
    return { valid: false, value, error: `${opts.label} may only contain letters, numbers, spaces, and ${opts.charsetHint} (no emoji or special symbols)` };
  }
  if ((value.match(/[A-Za-z]/g) ?? []).length < 2) {
    return { valid: false, value, error: `${opts.label} must contain at least 2 letters` };
  }
  const blocked = value.toLowerCase().split(/[^a-z0-9]+/).find((word) => BLOCKED_NAME_WORDS.has(word));
  if (blocked) {
    return { valid: false, value, error: `${opts.label} contains a blocked word ("${blocked}")` };
  }
  if (opts.checkBrand && violatesReservedBrand(value)) {
    return { valid: false, value, error: `${opts.label} contains a reserved or impersonation-protected term` };
  }
  return { valid: true, value };
}

export function validateAgentName(raw: unknown): ListingTextCheck {
  return validateListingText(raw, {
    label: 'name',
    min: AGENT_NAME_MIN,
    max: AGENT_NAME_MAX,
    charset: AGENT_NAME_CHARSET,
    charsetHint: ". - _ '",
    checkBrand: true,
  });
}

export function validateServiceTitle(raw: unknown): ListingTextCheck {
  return validateListingText(raw, {
    label: 'title',
    min: SERVICE_TITLE_MIN,
    max: SERVICE_TITLE_MAX,
    charset: SERVICE_TITLE_CHARSET,
    charsetHint: 'common punctuation',
    checkBrand: false,
  });
}

// Claims that are policy violations regardless of context. Rejected
// deterministically at write time with a clear error, instead of leaving them
// to LLM moderation judgment.
const BANNED_CLAIM_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bguaranteed?\s+(profits?|returns?|gains?|income|wins?)\b/i, label: 'guaranteed-profit claims' },
  { pattern: /\b100\s*%\s*(accuracy|accurate|success|win(?:\s*rate)?|profits?|guaranteed?)\b/i, label: '100% accuracy/success claims' },
  { pattern: /\brisk[-\s]?free\b/i, label: '"risk-free" claims' },
  { pattern: /\bno[-\s]risk\b/i, label: '"no risk" claims' },
  { pattern: /\bseed\s*phrase/i, label: 'seed-phrase mentions' },
  { pattern: /\bprivate\s*key/i, label: 'private-key mentions' },
  { pattern: /\brecovery\s*phrase/i, label: 'recovery-phrase mentions' },
];

/**
 * Scan listing text for deterministically banned claims. Returns a human-readable
 * label of the first violation, or null when clean.
 */
export function findBannedClaim(text: string): string | null {
  for (const { pattern, label } of BANNED_CLAIM_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

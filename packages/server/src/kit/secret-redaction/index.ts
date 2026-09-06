// Exact-value credential scrubbing for every diagnostic boundary. The replacement itself must be safe:
// a fixed word can contain a short credential and recreate the value it was meant to remove.
//
// SPELLINGS (#1785) — several callers SERIALIZE before they scrub (the custom-byo wire capture, the "Test
// endpoint" inspector's surfaced request, the bug-report bundle) and others scrub bytes an upstream
// serialized for them (an echoing endpoint's body, a provider's JSON error). `JSON.stringify` ESCAPES `"`
// and `\`, so a credential holding either is present in those bytes ONLY as `a\"b` — a spelling a search for
// the RAW literal never sees, and which the fail-closed containment check below then certified as clean. So
// every literal enters the scrub set in BOTH spellings, expanded HERE: the rule has one home, and no call
// site can hold half of it.
// DELIBERATELY NOT ADDED: URL-encoded and base64 spellings. No caller encodes a credential either way before
// scrubbing (audited 2026-09-05 across the providers tier, `infra/network`, and `foundation/observability` —
// the only base64 there is image payloads, and no credential reaches a query string), and a belt for a shape
// nothing produces is pure over-redaction. A caller that starts emitting one widens this function, not itself.
// STATED LIMIT: exactly ONE level of escaping. A document serialized TWICE (a JSON string nested inside a JSON
// document) spells the credential `a\\\"b`, and no finite expansion covers every depth — the answer to a
// nested document is to scrub each layer as it is produced, not to guess the nesting depth here.

const MARKER_CANDIDATES = ["█", "■", "◆", "●", "¤", "§", "¶", "※"] as const;

/** A literal's JSON-STRING spelling (`a"b` → `a\"b`) — the form a serialized document holds it in. */
function jsonEscaped(literal: string): string {
  return JSON.stringify(literal).slice(1, -1);
}

/**
 * The literals a text is actually searched for: every non-empty secret in BOTH its raw and its JSON-escaped
 * spelling, deduped and LONGEST-FIRST (a longer spelling is replaced before a shorter one it contains; for a
 * metacharacter-free secret the two spellings coincide and the set is unchanged).
 *
 * Exported because a boundary that runs its OWN post-condition on a scrubbed string — "is a literal still
 * present?", the last gate before bytes reach disk in `foundation/observability/debug/bug-report` — must ask
 * it about THIS set. Asking it about the raw literals it passed in is the same blind spot one layer up.
 */
export function secretRedactionLiterals(secrets: readonly string[]): string[] {
  const spellings = new Set<string>();
  for (const secret of secrets) {
    if (secret.length > 0) {
      spellings.add(secret);
      spellings.add(jsonEscaped(secret));
    }
  }
  return [...spellings].sort((left, right) => right.length - left.length);
}

/** A marker containing none of the known literals. Empty is the fail-closed last resort. */
export function secretSafeRedactionMarker(secrets: readonly string[]): string {
  const literals = secretRedactionLiterals(secrets);
  return MARKER_CANDIDATES.find((candidate) => literals.every((secret) => !candidate.includes(secret))) ?? "";
}

/** Remove every non-empty known literal — in both spellings — and verify the result before it may leave the
 *  trust boundary. The verification reads the SAME expanded set, or it is blind to exactly the class the
 *  removal just widened for. */
export function redactKnownSecrets(text: string, secrets: readonly string[]): string {
  const literals = secretRedactionLiterals(secrets);
  if (literals.length === 0) {
    return text;
  }
  const marker = secretSafeRedactionMarker(secrets);
  let scrubbed = text;
  for (const secret of literals) {
    while (scrubbed.includes(secret)) {
      scrubbed = scrubbed.replaceAll(secret, marker);
    }
  }
  return literals.some((secret) => scrubbed.includes(secret)) ? "" : scrubbed;
}

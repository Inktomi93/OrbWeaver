// Exact-value credential scrubbing for every diagnostic boundary. The replacement itself must be safe:
// a fixed word can contain a short credential and recreate the value it was meant to remove.

const MARKER_CANDIDATES = ["█", "■", "◆", "●", "¤", "§", "¶", "※"] as const;

function normalizedSecrets(secrets: readonly string[]): string[] {
  return [...new Set(secrets)].filter((secret) => secret.length > 0).sort((left, right) => right.length - left.length);
}

/** A marker containing none of the known literals. Empty is the fail-closed last resort. */
export function secretSafeRedactionMarker(secrets: readonly string[]): string {
  const literals = normalizedSecrets(secrets);
  return MARKER_CANDIDATES.find((candidate) => literals.every((secret) => !candidate.includes(secret))) ?? "";
}

/** Remove every non-empty known literal and verify the result before it may leave the trust boundary. */
export function redactKnownSecrets(text: string, secrets: readonly string[]): string {
  const literals = normalizedSecrets(secrets);
  if (literals.length === 0) {
    return text;
  }
  const marker = secretSafeRedactionMarker(literals);
  let scrubbed = text;
  for (const secret of literals) {
    while (scrubbed.includes(secret)) {
      scrubbed = scrubbed.replaceAll(secret, marker);
    }
  }
  return literals.some((secret) => scrubbed.includes(secret)) ? "" : scrubbed;
}

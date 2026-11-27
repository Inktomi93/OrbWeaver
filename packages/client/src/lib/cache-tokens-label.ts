// The one spelling of a generation's cache economics, shared by every surface that shows what a call read from or wrote
// to the provider's cache (the chat metadata row, the image provenance strip).

/** The per-call CACHE economics beside the token count — `null` when the backend reported none (both
 *  columns absent, or both zero: a call that neither read nor wrote cache has no economics to show).
 */
export function cacheTokensLabel(readTokens: number | null, writeTokens: number | null): string | null {
  const parts: string[] = [];
  if (readTokens !== null && readTokens > 0) {
    parts.push(`${readTokens} read`);
  }
  if (writeTokens !== null && writeTokens > 0) {
    parts.push(`${writeTokens} written`);
  }
  return parts.length === 0 ? null : `cache ${parts.join(" / ")}`;
}

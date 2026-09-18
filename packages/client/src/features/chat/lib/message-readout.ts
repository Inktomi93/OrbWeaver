// The metadata row's per-turn cache economics readout (#1032, the viewgap WIRE batch). `MessageView` has
// carried `cacheReadTokens`/`cacheWriteTokens` since the variant economics landed and no client file
// spelled them, so cache economics — the single biggest lever on what a turn costs — were invisible beside
// the token count they explain.
//
// PURE + PROP-DRIVEN, the `gen-duration.ts` precedent: these unit-test without a render, and the row stays
// a formatter over data it is handed.
//
// THE OUTCOME NOTICE WAS KILLED (#1876, owner ruling). The "cut off — length cap" badge caused confusion
// (not role-gated, an edit triggered it, unreadable on some themes) and was removed entirely.
// `messageOutcomeNotice`, `MessageOutcomeNotice` and the supporting types were deleted in the same commit.

/** The per-turn CACHE economics beside the token count — `null` when the backend reported none (both
 *  columns absent, or both zero: a turn that neither read nor wrote cache has no economics to show).
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

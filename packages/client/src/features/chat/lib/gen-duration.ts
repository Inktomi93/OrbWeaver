// The per-turn generation-duration derivation for the `showGenerationTimer` metadata readout.
// `MessageView` carries the raw gen-window bounds (`genStartedAt`/`genFinishedAt`, epoch-ms, written by
// the turn engine's canon-write); the duration is `gf − gs` and is only meaningful when both bounds are
// present AND ordered — the stats gen-time axis uses the same guard (`domain/chat/substrate/stats-delta`).
// Kept pure + prop-driven so it unit-tests without a render.

const MS_PER_SECOND = 1000;
const SUB_SECOND_MAX_MS = MS_PER_SECOND;

/** The completed generation window in ms (`gf − gs`) when both bounds are present and ordered, else null
 *  (a non-generated row, or an in-flight/rebuild row missing a bound).
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function genDurationMs(startedAt: number | null, finishedAt: number | null): number | null {
  if (startedAt === null || finishedAt === null || finishedAt < startedAt) {
    return null;
  }
  return finishedAt - startedAt;
}

/** The quiet-metadata format for ANY millisecond duration in this row: sub-second → whole `Nms`, else
 *  `N.Ns` (one decimal). Extracted (#1032) so the `ttftMs` readout beside the timer prints in the SAME
 *  shape as the timer itself — two spellings of "a duration" in one `·`-separated row would read as two
 *  different kinds of number.
 */
export function durationLabel(ms: number): string {
  return ms < SUB_SECOND_MAX_MS ? `${ms}ms` : `${(ms / MS_PER_SECOND).toFixed(1)}s`;
}

/** The quiet-metadata label for a gen duration: sub-second → whole `Nms`, else `N.Ns` (one decimal).
 *  Returns null when there is no complete window to show (caller renders no chip). */
export function genDurationLabel(startedAt: number | null, finishedAt: number | null): string | null {
  const ms = genDurationMs(startedAt, finishedAt);
  return ms === null ? null : durationLabel(ms);
}

// Stats TALLY primitives — the pure word-count regex / UTC-day bucketer / model-key rule shared by
// the stats rebuild-from-canon path AND the chat engine's StatsDelta builders. Keeping the SAME
// primitives at both sites is what lets the live deltas never drift from the reconcile rebuild.
//
// PURE HALF ONLY: the `StatsDelta` payload type and the `applyStatsDelta` upsert (which touch the
// stats db schema) live in the stats domain, NOT here — kit stays I/O-free.

// 'YYYY-MM-DD' is the first 10 chars of an ISO-8601 timestamp — the daily_stats grain.
const ISO_DATE_LENGTH = 10;
// Sentinel provider bucket when a model row carries no provider.
const UNKNOWN_PROVIDER = "(unknown)";

/** ST's exact `\b\w+\b` word count — the validation harness matches SillyTavern's stats.json. */
export function wordCount(s: string | null | undefined): number {
  return s ? (s.match(/\b\w+\b/g)?.length ?? 0) : 0;
}

/** UTC 'YYYY-MM-DD' of an epoch-ms — the daily_stats grain. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, ISO_DATE_LENGTH);
}

/** The model_stats group key — `(unknown)` provider bucket when a model has no provider. model null
 *  → no model_stats row. */
export function modelKey(
  model: string | null,
  provider: string | null,
): { model: string | null; provider: string | null } {
  return {
    model,
    provider: model === null ? null : (provider ?? UNKNOWN_PROVIDER),
  };
}

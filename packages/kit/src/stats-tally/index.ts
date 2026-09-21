// Stats TALLY primitives — the pure word-count regex / UTC-day bucketer / model-key rule shared by
// the stats rebuild-from-canon path AND the chat engine's StatsDelta builders. Keeping the SAME
// primitives at both sites is what lets the live deltas never drift from the reconcile rebuild.
//
// PURE HALF ONLY: the `StatsDelta` payload type and the `applyStatsDelta` upsert (which touch the
// stats db schema) live in the stats domain, NOT here — kit stays I/O-free.

// 'YYYY-MM-DD' is the first 10 chars of an ISO-8601 timestamp — the daily_stats grain.
const ISO_DATE_LENGTH = 10;
// Sentinel provider bucket when a model row carries no provider.
/** The sole non-registry provider bucket, used only by the non-null `model_stats.provider` natural key. */
export const MODEL_PROVIDER_UNKNOWN = "(unknown)" as const;

/** ST's exact `\b\w+\b` word count — the validation harness matches SillyTavern's stats.json. */
export function wordCount(s: string | null | undefined): number {
  return s !== null && s !== undefined && s !== "" ? (s.match(/\b\w+\b/g)?.length ?? 0) : 0;
}

/** UTC 'YYYY-MM-DD' of an epoch-ms — the daily_stats grain. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, ISO_DATE_LENGTH);
}

/** The model_stats group key — `(unknown)` provider bucket when a model has no provider. model null
 *  → no model_stats row. */
export function modelKey<Model extends string, Provider extends string>(
  model: Model | null,
  provider: Provider | null,
): { model: Model | null; provider: Provider | typeof MODEL_PROVIDER_UNKNOWN | null } {
  return {
    model,
    provider: model === null ? null : (provider ?? MODEL_PROVIDER_UNKNOWN),
  };
}

// Stats TALLY primitives — the pure word-count regex / timeline bucketer / model-key rule shared by
// the stats rebuild-from-canon path AND the chat engine's StatsDelta builders. Keeping the SAME
// primitives at both sites is what lets the live deltas never drift from the reconcile rebuild.
//
// PURE HALF ONLY: the `StatsDelta` payload type and the `applyStatsDelta` upsert (which touch the
// stats db schema) live in the stats domain, NOT here — kit stays I/O-free.

/** The `daily_stats` timeline grain: a UTC quarter-hour. Every offset a modern zone uses is a whole multiple
 *  of 15 minutes (+5:30, +5:45, +12:45), so a bucket lies inside one local hour and day in every viewer zone,
 *  which is what lets the client fold the timeline into the viewer's days and hours exactly. */
export const STATS_BUCKET_MS = 900_000;
// Sentinel provider bucket when a model row carries no provider.
/** The sole non-registry provider bucket, used only by the non-null `model_stats.provider` natural key. */
export const MODEL_PROVIDER_UNKNOWN = "(unknown)" as const;

/** ST's exact `\b\w+\b` word count — the validation harness matches SillyTavern's stats.json. */
export function wordCount(s: string | null | undefined): number {
  return s !== null && s !== undefined && s !== "" ? (s.match(/\b\w+\b/g)?.length ?? 0) : 0;
}

/** The start (epoch-ms) of the {@link STATS_BUCKET_MS} bucket an epoch-ms instant falls in — the
 *  `daily_stats` key. */
export function statsBucketStart(ms: number): number {
  return Math.floor(ms / STATS_BUCKET_MS) * STATS_BUCKET_MS;
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

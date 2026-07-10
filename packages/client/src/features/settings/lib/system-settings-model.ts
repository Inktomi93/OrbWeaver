// The SYSTEM settings pane's form MODEL (Task #37 — the APP-tier AppSettings home). Split out of the
// surface (UI-Arch §2.1 component-size gate) since this is pure data + mapping, not JSX.
//
// THE READ/WRITE ASYMMETRY (Spine-Config §"env FOUR natures", nature b): the admin READS BACK the fully
// resolved `EffectiveAppConfig` (env floor ⊕ DB override — every field present) via `getAppSettings`, but
// EDITS the override blob `AppSettings` (every field optional; `null` = CLEAR) via `updateAppSettings`.
// This module projects the resolved config INTO the flat editable form (`projectSystemForm`) and, on save,
// DIFFS the form against its mount baseline back into an `AppSettings` PARTIAL (`diffSystemPatch`) so ONLY
// a field the admin actually changed becomes a stored override — an untouched env-mirrored field
// (`corpusAutoindex`/`logLevel`) keeps showing its environment value instead of being pinned to a DB copy
// of it (the appearance surface's "write the whole section every time" is unsafe here precisely because
// AppSettings has an env floor and appearance does not).
//
// `maxImageBytes` is projected to/from MB (the wire stays BYTES — the schema field is `.int()` bytes); the
// mapping lives here, never in the surface JSX.
//
// THE TWO-BASELINE DIFF (why `diffSystemPatch` takes `{ original, lastSaved }`, not one baseline): the
// server MERGES each patch over the stored override blob (`domain/settings/substrate/merge.ts` — an
// OMITTED key is untouched; only an explicit `null` CLEARS a top-level override so the env floor shows
// through). A single mount-baseline diff that merely OMITTED unchanged-vs-baseline fields left a reverted
// control STUCK: flip trustHtml ON (autosave stores `true`) then OFF → `current === baseline` → the field
// is omitted → the patch is `{}` → the stored `true` survives (the switch reads OFF but the deployment
// keeps trusting HTML). The fix needs BOTH references:
//   • `original` — the mount effective config = the INHERITED/default reference. A field back AT it must
//     carry a schema `null` CLEAR (revert to the env floor), never be re-pinned.
//   • `lastSaved` — the last PERSISTED form (the surface refreshes it from each `updateAppSettings` result).
//     A field is written only when it CHANGED since the last save — so an untouched env-mirrored field is
//     never pinned (the standing env-floor law the diff exists to protect), and a same-value re-send is
//     skipped.
// `vllmConcurrency` is nested with NON-nullable `.positive()` sub-keys (embed/summarize): a single-key
// change sends only that sub-key (the merge recurses, leaving the sibling's stored value untouched — no
// env-floor pin); the whole object clears (`null`) only once BOTH sub-keys are back at `original`. A
// sub-key that reverts while its sibling stays overridden cannot be individually cleared (non-nullable) —
// it holds until both revert; a documented corner, not the common single-knob path.

import type { AppSettings, EffectiveAppConfig, LogLevel } from "@orb/contracts/settings";

/** Decimal MB (the schema DEFAULT_MAX_IMAGE_BYTES = 5_000_000 is documented as "5 MB" — 1 MB = 1e6 B,
 *  matching safeFetch's own byte accounting). */
export const BYTES_PER_MB = 1_000_000;

// maxImageBytes MB bounds — a LOCAL mirror of the contract's PRIVATE `MAX_IMAGE_BYTES_FLOOR` (100_000) /
// `MAX_IMAGE_BYTES_CEIL` (100_000_000), which are not exported. Client-side UX clamp only; `appSettingsSchema`
// re-validates the byte value at the transport, so a divergence fails closed server-side, never silently.
export const MAX_IMAGE_MB_MIN = 0.1;
export const MAX_IMAGE_MB_MAX = 100;
export const MAX_IMAGE_MB_STEP = 1;

/** vLLM batch concurrency + the per-member local-compute budget are `.int().positive()` in the schema. */
export const CONCURRENCY_MIN = 1;
export const LOCAL_COMPUTE_BUDGET_MIN = 1;

/** The flat editable projection of the System knobs. Numerics are `number | null` (the Base UI NumberField's
 *  empty state is `null`); the projection always seeds them with a number, so `null` only appears when the
 *  admin clears a field. `maxImageMb` carries MB (the wire is bytes — see `diffSystemPatch`). */
export interface SystemSettingsForm {
  readonly corpusAutoindex: boolean;
  readonly logLevel: LogLevel;
  readonly forbidExternalMedia: boolean;
  readonly trustHtml: boolean;
  readonly maxImageMb: number | null;
  readonly vllmEmbedConcurrency: number | null;
  readonly vllmSummarizeConcurrency: number | null;
  readonly allowNonOwnerLocalCompute: boolean;
  readonly nonOwnerLocalComputeBudget: number | null;
  readonly allowNonOwnerMaxProSub: boolean;
}

/** Project the resolved effective config into the editable form (bytes → MB for the image cap). */
export function projectSystemForm(config: EffectiveAppConfig): SystemSettingsForm {
  return {
    corpusAutoindex: config.corpusAutoindex,
    logLevel: config.logLevel,
    forbidExternalMedia: config.forbidExternalMedia,
    trustHtml: config.trustHtml,
    maxImageMb: config.maxImageBytes / BYTES_PER_MB,
    vllmEmbedConcurrency: config.vllmConcurrency.embed,
    vllmSummarizeConcurrency: config.vllmConcurrency.summarize,
    allowNonOwnerLocalCompute: config.allowNonOwnerLocalCompute,
    nonOwnerLocalComputeBudget: config.nonOwnerLocalComputeBudget,
    allowNonOwnerMaxProSub: config.allowNonOwnerMaxProSub,
  };
}

/** The two references `diffSystemPatch` needs (see the module header): `original` = the mount effective
 *  config (the inherited/default a reverted field CLEARS back to); `lastSaved` = the last persisted form
 *  (change-detection, refreshed by the surface from each save result). */
export interface SystemSettingsBaselines {
  readonly original: SystemSettingsForm;
  readonly lastSaved: SystemSettingsForm;
}

/** The nullable-in-schema scalar fields whose PATCH key equals their FORM key (so a generic index works).
 *  `maxImageMb` (MB→bytes rename) and the nested `vllmConcurrency` are handled separately. */
const NULLABLE_SCALAR_KEYS = [
  "corpusAutoindex",
  "logLevel",
  "forbidExternalMedia",
  "trustHtml",
  "allowNonOwnerLocalCompute",
  // biome-ignore lint/security/noSecrets: an AppSettings field name (D17 governance toggle), not a secret.
  "nonOwnerLocalComputeBudget",
  // biome-ignore lint/security/noSecrets: an AppSettings field name (D17 governance toggle), not a secret.
  "allowNonOwnerMaxProSub",
] as const;
type NullableScalarKey = (typeof NULLABLE_SCALAR_KEYS)[number];

/** Set a single nullable-in-schema scalar field on the patch iff it CHANGED since the last save: a value
 *  back at `original` carries a `null` CLEAR (revert to the env floor / domain floor), otherwise the new
 *  override value. Untouched fields are never written, so an env-mirrored field is never pinned. */
function diffScalar(
  patch: Record<string, unknown>,
  key: NullableScalarKey,
  current: SystemSettingsForm,
  { original, lastSaved }: SystemSettingsBaselines,
): void {
  const value = current[key];
  if (value === lastSaved[key]) {
    return;
  }
  patch[key] = value === original[key] ? null : value;
}

/**
 * Diff the current form into an `AppSettings` override partial. Writes ONLY fields moved since the last
 * save (`lastSaved`); a field returned to the inherited value (`original`) is CLEARED with a schema `null`
 * so the server-side override genuinely releases (see the module header for the merge semantics + WHY a
 * single mount-baseline diff left reverts stuck). Env-mirrored fields the admin never touched are never
 * pinned. `vllmConcurrency`'s non-nullable sub-keys clear only when BOTH return to `original`.
 */
export function diffSystemPatch(
  baselines: SystemSettingsBaselines,
  current: SystemSettingsForm,
): AppSettings {
  const { original, lastSaved } = baselines;
  const patch: Record<string, unknown> = {};

  for (const key of NULLABLE_SCALAR_KEYS) {
    diffScalar(patch, key, current, baselines);
  }

  // maxImageMb (MB in the form; the wire is BYTES). Same clear-on-revert rule, plus MB→bytes on an
  // override value; a cleared input (`null`) also clears the override.
  if (current.maxImageMb !== lastSaved.maxImageMb) {
    patch["maxImageBytes"] =
      current.maxImageMb === null || current.maxImageMb === original.maxImageMb
        ? null
        : Math.round(current.maxImageMb * BYTES_PER_MB);
  }

  diffVllmConcurrency(patch, baselines, current);

  return patch as AppSettings;
}

/** vLLM concurrency is a nested object with NON-nullable sub-keys. Send only sub-keys changed since the
 *  last save AND still a genuine override; clear the WHOLE object (`null`) only once both are back at
 *  `original` (a lone reverted sub-key can't be nulled individually — see the module header). */
function diffVllmConcurrency(
  patch: Record<string, unknown>,
  { original, lastSaved }: SystemSettingsBaselines,
  current: SystemSettingsForm,
): void {
  const embed = current.vllmEmbedConcurrency;
  const summarize = current.vllmSummarizeConcurrency;
  const embedChanged = embed !== lastSaved.vllmEmbedConcurrency;
  const summarizeChanged = summarize !== lastSaved.vllmSummarizeConcurrency;
  if (!(embedChanged || summarizeChanged)) {
    return;
  }
  const embedAtOriginal = embed === null || embed === original.vllmEmbedConcurrency;
  const summarizeAtOriginal = summarize === null || summarize === original.vllmSummarizeConcurrency;
  if (embedAtOriginal && summarizeAtOriginal) {
    patch["vllmConcurrency"] = null;
    return;
  }
  const nested: Record<string, number> = {};
  if (embedChanged && embed !== null && embed !== original.vllmEmbedConcurrency) {
    nested["embed"] = embed;
  }
  if (summarizeChanged && summarize !== null && summarize !== original.vllmSummarizeConcurrency) {
    nested["summarize"] = summarize;
  }
  if (Object.keys(nested).length > 0) {
    patch["vllmConcurrency"] = nested;
  }
}

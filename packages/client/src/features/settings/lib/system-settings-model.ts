// The System settings pane's form model. The admin reads back the fully-resolved EffectiveAppConfig but
// edits the override blob AppSettings (fields optional; `null` = clear). This module projects the resolved
// config into a flat form (projectSystemForm) and diffs it against two baselines back into a patch
// (diffSystemPatch) so only a field the admin actually changed becomes a stored override.
//
// diffSystemPatch needs BOTH `original` (the mount effective config — a field back at this clears to
// `null`, releasing to the env floor) and `lastSaved` (the last persisted form — a field only writes if it
// changed since then). A single mount-baseline diff left reverts stuck: flip a switch on then back off ⇒
// `current === baseline` ⇒ omitted from the patch ⇒ the stored override survives untouched.

import type { AppSettings, EffectiveAppConfig, LogLevel } from "@orb/contracts/settings";

/** Decimal MB (1 MB = 1e6 B, matching safeFetch's own byte accounting). */
export const BYTES_PER_MB = 1_000_000;

// A local mirror of the contract's private byte floor/ceiling; client-side UX clamp only — the schema re-validates at the transport.
export const MAX_IMAGE_MB_MIN = 0.1;
export const MAX_IMAGE_MB_MAX = 100;
export const MAX_IMAGE_MB_STEP = 1;

export const CONCURRENCY_MIN = 1;
export const LOCAL_COMPUTE_BUDGET_MIN = 1;

/** The flat editable projection of the System knobs. `maxImageMb` carries MB (the wire is bytes). */
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
  readonly localMultiUser: boolean;
  readonly discreetLogin: boolean;
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
    localMultiUser: config.localMultiUser,
    discreetLogin: config.discreetLogin,
  };
}

/** The two references `diffSystemPatch` needs — see the module header. */
export interface SystemSettingsBaselines {
  readonly original: SystemSettingsForm;
  readonly lastSaved: SystemSettingsForm;
}

// Nullable-in-schema scalar fields whose patch key equals their form key; maxImageMb and vllmConcurrency are handled separately.
const NULLABLE_SCALAR_KEYS = [
  "corpusAutoindex",
  "logLevel",
  "forbidExternalMedia",
  "trustHtml",
  "allowNonOwnerLocalCompute",
  "nonOwnerLocalComputeBudget",
  "allowNonOwnerMaxProSub",
  "localMultiUser",
  "discreetLogin",
] as const;
type NullableScalarKey = (typeof NULLABLE_SCALAR_KEYS)[number];

/** Set a scalar field on the patch iff it changed since the last save: a value back at `original` clears via `null`, otherwise the new override. */
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

/** Diff the current form into an `AppSettings` override partial — see the module header. */
export function diffSystemPatch(baselines: SystemSettingsBaselines, current: SystemSettingsForm): AppSettings {
  const { original, lastSaved } = baselines;
  const patch: Record<string, unknown> = {};

  for (const key of NULLABLE_SCALAR_KEYS) {
    diffScalar(patch, key, current, baselines);
  }

  if (current.maxImageMb !== lastSaved.maxImageMb) {
    patch["maxImageBytes"] = current.maxImageMb === null || current.maxImageMb === original.maxImageMb ? null : Math.round(current.maxImageMb * BYTES_PER_MB);
  }

  diffVllmConcurrency(patch, baselines, current);

  return patch as AppSettings;
}

/** vLLM concurrency is nested with non-nullable sub-keys — clears as a whole object only once both are back at `original`. */
function diffVllmConcurrency(patch: Record<string, unknown>, { original, lastSaved }: SystemSettingsBaselines, current: SystemSettingsForm): void {
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

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

import type { AppSettings, EffectiveAppConfig, LogLevel } from "@orb/contracts/settings";
import { LOG_LEVELS } from "@orb/contracts/settings";
import type { SelectItems } from "@orb/ui/select";

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

/**
 * Diff the current form against its mount BASELINE into an `AppSettings` override partial — only the fields
 * the admin actually moved (see the module header for WHY the whole-form write is unsafe here). Fields that
 * cannot represent a `null` in the schema (`vllmConcurrency.{embed,summarize}` are `.positive()`, non-nullable)
 * fall back to the baseline when cleared, so a stray empty input never sends an invalid override;
 * `nonOwnerLocalComputeBudget` IS `.nullable()` (null = clear → the domain floor), so its `null` passes through.
 */
export function diffSystemPatch(
  baseline: SystemSettingsForm,
  current: SystemSettingsForm,
): AppSettings {
  const patch: Record<string, unknown> = {};
  if (current.corpusAutoindex !== baseline.corpusAutoindex) {
    patch["corpusAutoindex"] = current.corpusAutoindex;
  }
  if (current.logLevel !== baseline.logLevel) {
    patch["logLevel"] = current.logLevel;
  }
  if (current.forbidExternalMedia !== baseline.forbidExternalMedia) {
    patch["forbidExternalMedia"] = current.forbidExternalMedia;
  }
  if (current.trustHtml !== baseline.trustHtml) {
    patch["trustHtml"] = current.trustHtml;
  }
  if (current.maxImageMb !== null && current.maxImageMb !== baseline.maxImageMb) {
    patch["maxImageBytes"] = Math.round(current.maxImageMb * BYTES_PER_MB);
  }
  const embed = current.vllmEmbedConcurrency ?? baseline.vllmEmbedConcurrency;
  const summarize = current.vllmSummarizeConcurrency ?? baseline.vllmSummarizeConcurrency;
  if (embed !== baseline.vllmEmbedConcurrency || summarize !== baseline.vllmSummarizeConcurrency) {
    patch["vllmConcurrency"] = { embed, summarize };
  }
  if (current.allowNonOwnerLocalCompute !== baseline.allowNonOwnerLocalCompute) {
    patch["allowNonOwnerLocalCompute"] = current.allowNonOwnerLocalCompute;
  }
  if (current.nonOwnerLocalComputeBudget !== baseline.nonOwnerLocalComputeBudget) {
    // biome-ignore lint/security/noSecrets: an AppSettings field name (D17 governance toggle), not a secret.
    patch["nonOwnerLocalComputeBudget"] = current.nonOwnerLocalComputeBudget;
  }
  if (current.allowNonOwnerMaxProSub !== baseline.allowNonOwnerMaxProSub) {
    // biome-ignore lint/security/noSecrets: an AppSettings field name (D17 governance toggle), not a secret.
    patch["allowNonOwnerMaxProSub"] = current.allowNonOwnerMaxProSub;
  }
  return patch as AppSettings;
}

const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  fatal: "Fatal",
  error: "Error",
  warn: "Warn",
  info: "Info",
  debug: "Debug",
  trace: "Trace",
  silent: "Silent",
};

/** The log-level Select options (derived from the ONE `LOG_LEVELS` tuple — never a hand-kept mirror). */
export const LOG_LEVEL_ITEMS: SelectItems<string> = LOG_LEVELS.map((value) => ({
  value,
  label: LOG_LEVEL_LABELS[value],
}));

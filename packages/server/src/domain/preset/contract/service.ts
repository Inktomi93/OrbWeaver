// The typed API surface: PresetContext (the DI bundle) and PresetService. preset is a leaf user-scoped CRUD
// feature and gates by `ownerId === userId` — no injected guard. Its ONE cross-feature port is the chat-role
// CAPABILITY read (`resolveEffective`): the type is declared here, the runtime op is wired at the composition
// root, so preset never imports `connection` (the sideways-import ban, AGENTS §2).

import type { ResolvedConnectionView } from "@orb/contracts/inference";
import type { Principal } from "@orb/contracts/identity";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { PresetId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type {
  ClonePackagedParams,
  CreatePresetParams,
  GetPresetParams,
  ImportPresetFileParams,
  ListPresetsParams,
  ListPresetUsageParams,
  RemovePresetParams,
  ResetToDefaultParams,
  ResolveEffectiveParams,
  UpdatePresetParams,
} from "./params.ts";
import type { PresetImportOutcome } from "./portability.ts";
import type { EffectivePreset, PresetDetail, PresetSummary, PresetUsageView } from "./views.ts";

/** The injected chat-role capability read — `connection.resolveChatCapability` at the composition root. Takes
 *  the acting Principal and NOTHING else (no caller-supplied user id or role), so the injected op can only
 *  ever answer for the caller's own connection. */
export type ResolveChatCapabilityOp = (params: { readonly principal: Principal }) => Promise<ResolvedConnectionView>;

/**
 * The injected BACKWARD-BINDINGS read (#279) — "where is this preset bound from outside the library".
 *
 * Injected rather than queried here because BOTH of its facts belong to other domains: the active pick is
 * `settings`' `UserSettings.seeds.defaultPresetId`, and the GM redirect is `rpg_games.gmPresetId` joined to
 * rooms whose visibility only chat can decide (D18). preset imports none of them, so the composition root
 * assembles it (`entry/compose/preset-usage.ts`, the `room-reach` posture) and preset states the TYPE it
 * needs. The verb still owns the GATE: it resolves the preset as readable-by-this-caller first.
 */
export type ResolvePresetUsageOp = (principal: Principal, presetId: PresetId) => Promise<PresetUsageView>;

/** The DI bundle the preset verbs close over, wired at the composition root. */
export interface PresetContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newPresetId: () => PresetId;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  /** Fires `presetsChanged` with the acting owner's `userId` after every preset mutation's durable write,
   *  so a second device's list refetches. */
  readonly emitUserEvent: EmitUserEvent;
  /** The caller's OWN chat-role capability — the SAME read the editor's params panel already consumes, so the
   *  effective projection and the capability card can never disagree about the model. */
  readonly resolveChatCapability: ResolveChatCapabilityOp;
  /** The caller's backward bindings for one preset — the CONTEXT panel's "used by" block. */
  readonly resolvePresetUsage: ResolvePresetUsageOp;
}

/** The generation-config library surface. All verbs are owner-scoped: reads return the owner's rows union
 *  the shared system default; writes touch only the owner's rows. */
export interface PresetService {
  /** Write a new owned preset (audits `preset.create`); returns the full detail. */
  readonly create: (params: CreatePresetParams) => Promise<PresetDetail>;
  /** The owner's library rows PLUS the shared system default, as summaries. */
  readonly list: (params: ListPresetsParams) => Promise<PresetSummary[]>;
  /** One preset readable by this owner (their own OR the system default); throws `PresetNotFoundError`. */
  readonly get: (params: GetPresetParams) => Promise<PresetDetail>;
  /** Patch an owned preset; targeting the system default COWs into a new owned fork (NEW id
   *  returned). Throws `PresetNotFoundError` when no owned row matches. Audits the write. */
  readonly update: (params: UpdatePresetParams) => Promise<PresetDetail>;
  /** Delete an owned preset (audits `preset.remove`). Throws `PresetOperationError`
   *  (`cannot_remove_system_default`) for the system default, `PresetNotFoundError` when unowned/missing. */
  readonly remove: (params: RemovePresetParams) => Promise<void>;
  /** Replace an owned preset's config with `DEFAULT_PROMPT_CONFIG` (audits `preset.resetToDefault`); a
   *  no-op returning the row when targeting the system default (it IS the default). */
  readonly resetToDefault: (params: ResetToDefaultParams) => Promise<PresetDetail>;
  /** Clone a shipped PACKAGED template preset (`key`) into the caller's library as a NEW owned row (audits
   *  `preset.clonePackaged`); returns the fork's detail. Throws `PresetNotFoundError` when the packaged
   *  template row is absent (unseeded). The cross-feature clone-source op (rpg `createGame` → `gmPresetId`). */
  readonly clonePackaged: (params: ClonePackagedParams) => Promise<PresetDetail>;
  /** The generation funnel PROJECTED for one readable preset against the caller's own chat model (redesign
   *  §4.3): per-knob effective value + provenance, plus the stored-but-unhonored list. A read — no write, no
   *  audit. Throws `PresetNotFoundError` for a preset this caller can't read. */
  readonly resolveEffective: (params: ResolveEffectiveParams) => Promise<EffectivePreset>;
  /** Where this preset is bound from OUTSIDE the library (#279) — the caller's active-pick flag + the rooms
   *  whose rpg GM voice redirects to it. Gated like `get` (readable-by-this-caller or `PresetNotFoundError`);
   *  the rooms are membership-filtered by the injected resolver, never listed raw. A read — no audit. */
  readonly listUsage: (params: ListPresetUsageParams) => Promise<PresetUsageView>;
  /** Import ONE orb-native preset file — the thin single-preset arm over the SAME `ImportPreset` verb the
   *  whole-profile bundle uses (idempotent on `(ownerId, name)`: a same-named preset is MERGED in place).
   *  Never throws for a malformed file; the outcome carries the error. */
  readonly importFile: (params: ImportPresetFileParams) => Promise<PresetImportOutcome>;
}

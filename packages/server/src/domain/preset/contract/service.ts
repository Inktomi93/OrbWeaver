// The typed API surface (read THIS to know everything preset does). Holds:
//   • PresetContext   the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4 / no-context-returntype)
//   • PresetService   the 6-verb authoritative interface (the front door re-exports the type)
// preset is a leaf user-scoped CRUD feature: no cross-feature port, no injected guard (it gates by
// `ownerId === userId`). The context carries only db + the determinism seam + the bound audit writer.

import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { PresetId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type {
  CreatePresetParams,
  GetPresetParams,
  ListPresetsParams,
  RemovePresetParams,
  ResetToDefaultParams,
  UpdatePresetParams,
} from "./params";
import type { PresetDetail, PresetSummary } from "./views";

/**
 * The DI bundle the preset verbs close over (wired at `service.ts`/`entry`). Explicit interface (not
 * `ReturnType<typeof createPresetContext>`) per §7.4 + the `no-context-returntype` gate.
 *   - `db` — the libSQL handle (all queries route through `persistence/`).
 *   - `now` — the INJECTED clock (epoch-ms). Production passes the real clock at `entry/`; tests pass the
 *     frozen clock. No ambient `Date.now()` in a verb (determinism — `test-determinism`).
 *   - `newPresetId` — the INJECTED id minter (`mintTypeId(ID_PREFIX.preset)` in prod; seeded in tests).
 *   - `audit` — `foundation/observability`'s `logAudit` pre-bound to `db` (best-effort; never breaks the
 *     primary channel). The caller passes the timestamp from `now` (the same determinism seam).
 */
export interface PresetContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newPresetId: () => PresetId;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  /** The user-bus live-freshness emit (PD user-bus lane) — every preset mutation fires `presetsChanged`
   *  with the acting owner's `userId` AFTER its durable write, so a second device's preset list refetches.
   *  Wired to transport's `publishUserEvent` at the entry root; fire-and-forget (LIVE-ONLY). */
  readonly emitUserEvent: EmitUserEvent;
}

/**
 * The generation-config library surface. All verbs are owner-scoped by the
 * `userId` carried in their params (resolved from the request `Principal`): reads return the owner's rows
 * UNION the shared system default; writes touch only the owner's rows (the system default is reached via
 * COW on update and is un-removable). Six verbs:
 *   create · list · get · update (COW on the system default) · remove · resetToDefault.
 */
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
}

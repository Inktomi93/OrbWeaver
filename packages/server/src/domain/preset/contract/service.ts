// The typed API surface: PresetContext (the DI bundle) and PresetService (the 6-verb interface). preset is a
// leaf user-scoped CRUD feature: no cross-feature port, no injected guard — it gates by `ownerId === userId`.

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

/** The DI bundle the preset verbs close over, wired at the composition root. */
export interface PresetContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newPresetId: () => PresetId;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  /** Fires `presetsChanged` with the acting owner's `userId` after every preset mutation's durable write,
   *  so a second device's list refetches. */
  readonly emitUserEvent: EmitUserEvent;
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
}

// domain/settings/contract/service — the typed API surface (read THIS to know everything settings does).
// Holds the explicit `SettingsContext` DI bundle (NOT a `ReturnType<>` of the builder — §7.4 /
// `no-context-returntype`) and the `SettingsService` interface (the front door re-exports the type).
//
// Cross-feature deps arrive INJECTED (settings sideways-imports no sibling at runtime): the admin guard
// ops (`requireAdmin`/`requireOwner`) are TYPE-ONLY imports of admin's contract seam — the runtime ops are
// wired at the entry composition root (`domain-no-cross-feature` permits the type-only edge; admin's
// `guard.ts` impl is never imported). `audit` is `foundation/observability`'s `logAudit` pre-bound to db.

import type { EffectiveAppConfig, UserSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import type { AuditEntry } from "#foundation/observability";
// Type-only cross-feature edge (sanctioned — `domain-no-cross-feature` exempts type-only): the guard op
// SHAPES admin owns; the runtime ops are injected at the root. Admin's `guard.ts` impl is NOT imported.
import type { RequireAdmin, RequireOwner } from "../../admin/contract/guard";
import type {
  GetAppSettingsParams,
  GetUserSettingsParams,
  UpdateAppSettingsParams,
  UpdateUserSettingsParams,
  UpdateUserSettingsSectionParams,
} from "./params";
import type { GlobalSettingView, UserSettingsView } from "./views";

/**
 * The DI bundle every verb closes over, wired at the composition root (`service.ts` / `context.ts`).
 * Explicit interface per §7.4 + the `no-context-returntype` gate.
 *   - `db` — the libSQL handle (all queries route through `persistence/`).
 *   - `now` — the INJECTED clock (epoch-ms). No ambient wall-clock in a verb/query (determinism).
 *   - `audit` — `foundation/observability`'s `logAudit` pre-bound to `db` (best-effort; never breaks the
 *     primary channel). The caller supplies the timestamp from `now` (the same determinism seam).
 *   - `requireAdmin` / `requireOwner` — the INJECTED guard ops (admin domain). `requireAdmin` gates BOTH
 *     AppSettings verbs (owner ∪ admin); `requireOwner` additionally gates an AppSettings PATCH that
 *     touches a D17 owner-box governance field (owner-only — the box-governance split).
 *   - `serializeUserWrite` — the per-user write serializer (one instance shared by BOTH user-settings
 *     write verbs → it lives here, not in a verb). ASSUMES(single-replica).
 */
export interface SettingsContext {
  readonly db: Db;
  readonly now: () => number;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly requireAdmin: RequireAdmin;
  readonly requireOwner: RequireOwner;
  readonly serializeUserWrite: <T>(ownerId: UserId, run: () => Promise<T>) => Promise<T>;
  /** The floor-merge read side, bound from the `effective-config/` subsystem at the composition root
   *  (context.ts is a composition surface — the one place allowed to reach the subsystem).
   *  `getEffectiveConfig` is the SYNC cache read; `reloadEffectiveConfig` rebuilds the cache (called by
   *  `updateAppSettings` after a write, and by entry boot). */
  readonly getEffectiveConfig: () => EffectiveAppConfig;
  readonly reloadEffectiveConfig: () => Promise<EffectiveAppConfig>;
}

/**
 * What the entry composition root supplies to stand up the domain (`createSettingsService` builds the
 * `SettingsContext` from this — the serializer + the effective-config bindings are assembled internally).
 * The cross-feature/foundation ops arrive INJECTED: `audit` is `logAudit` pre-bound to db;
 * `requireAdmin`/`requireOwner` are admin's guard ops; `now` is the determinism clock.
 */
export interface SettingsServiceDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly requireAdmin: RequireAdmin;
  readonly requireOwner: RequireOwner;
}

/**
 * The settings API surface. UserSettings verbs scope by `principal.userId`;
 * AppSettings verbs gate on the injected guard; the raw KV pair is admin-gated at the router. The
 * floor-merge read side (`getEffectiveConfig` SYNC / `reloadEffectiveConfig`) is surfaced here so hot
 * paths inject the sync getter and the entry boot warms the cache.
 */
export interface SettingsService {
  /** Read this user's typed/defaulted UserSettings. A never-touched account reads the parsed defaults
   *  synthesized from `{}` with NO write (`updatedAt: 0`). Scoped to `principal.userId`. */
  readonly getUserSettings: (params: GetUserSettingsParams) => Promise<UserSettingsView>;
  /** Whole-blob replace (first-touch-seeds the row, stamps the service-owned `schemaVersion`). Serialized
   *  per user; the post-write view is read INSIDE the serializer. */
  readonly updateUserSettings: (params: UpdateUserSettingsParams) => Promise<UserSettingsView>;
  /** Deep-merge ONE namespace + re-validate the whole blob. Serialized per user (read-merge-write atomic
   *  w.r.t. other same-user writes). */
  readonly updateUserSettingsSection: (
    params: UpdateUserSettingsSectionParams,
  ) => Promise<UserSettingsView>;
  /** The lenient typed-blob loader chat + workloads inject cross-feature (raw `userId` — the triggering
   *  user resolved upstream; not a gated user-facing verb). Returns the parsed `UserSettings`. */
  readonly loadUserSettings: (userId: UserId) => Promise<UserSettings>;

  /** Read one raw global-KV row; `null` if absent. Admin-gated at the router. */
  readonly getGlobalSetting: (key: string) => Promise<GlobalSettingView | null>;
  /** Upsert one raw global-KV row. Admin-gated at the router. Throws `DomainOperationError(reserved_key)`
   *  for `APP_SETTINGS_KEY` (use `updateAppSettings`). */
  readonly setGlobalSetting: (key: string, value: JsonValue) => Promise<GlobalSettingView>;

  /** Admin-only (injected `requireAdmin`). The resolved runtime config (env floor ⊕ stored override). */
  readonly getAppSettings: (params: GetAppSettingsParams) => Promise<EffectiveAppConfig>;
  /** Admin-only (`requireAdmin`); a PATCH touching a D17 governance field additionally requires
   *  `requireOwner`. Read-merge-writes the override blob through the process-wide chain, then reloads the
   *  cache (so `getEffectiveConfig` + `logger.level` reflect the write before returning). */
  readonly updateAppSettings: (params: UpdateAppSettingsParams) => Promise<EffectiveAppConfig>;

  /** SYNC hot-path read of the in-memory resolved cache (engine/embedder/runners). Before the first
   *  reload it is the env-only floor (the safe default). ASSUMES(single-replica). */
  readonly getEffectiveConfig: () => EffectiveAppConfig;
  /** Rebuild the cache from the stored override (boot + after every admin write); rebinds `logger.level`. */
  readonly reloadEffectiveConfig: () => Promise<EffectiveAppConfig>;
}

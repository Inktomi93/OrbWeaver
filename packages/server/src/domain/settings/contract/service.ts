// The typed API surface: the `SettingsContext` DI bundle and the `SettingsService` interface. Cross-feature
// deps arrive injected — admin's guard ops are type-only imports; the runtime ops wire at the entry root.

import type { EffectiveAppConfig, UserSettings } from "@orb/contracts/settings";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { ThemeId, UserId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import type { AuditEntry } from "#foundation/observability";
import type { RequireAdmin, RequireOwner } from "../../admin/contract/guard";
import type {
  CreateThemeParams,
  DuplicateThemeParams,
  GetAppSettingsParams,
  GetThemeParams,
  GetUserSettingsParams,
  ListThemesParams,
  RemoveThemeParams,
  UpdateAppSettingsParams,
  UpdateThemeParams,
  UpdateUserSettingsParams,
  UpdateUserSettingsSectionParams,
} from "./params";
import type { GlobalSettingView, ThemeView, UserSettingsView } from "./views";

/** The DI bundle every verb closes over, wired at the composition root. */
export interface SettingsContext {
  readonly db: Db;
  readonly now: () => number;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly requireAdmin: RequireAdmin;
  readonly requireOwner: RequireOwner;
  readonly serializeUserWrite: <T>(ownerId: UserId, run: () => Promise<T>) => Promise<T>;
  readonly newThemeId: () => ThemeId;
  /** The floor-merge read side, bound from the `effective-config/` subsystem at the composition root.
   *  `getEffectiveConfig` is the sync cache read; `reloadEffectiveConfig` rebuilds it. */
  readonly getEffectiveConfig: () => EffectiveAppConfig;
  readonly reloadEffectiveConfig: () => Promise<EffectiveAppConfig>;
  /** User-bus live-freshness emit: user-settings writes fire `settingsChanged`, theme verbs fire
   *  `themesChanged`, after the durable write. AppSettings/GlobalSettings are global/admin — no emit. */
  readonly emitUserEvent: EmitUserEvent;
}

/** What the entry composition root supplies to stand up the domain. */
export interface SettingsServiceDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly requireAdmin: RequireAdmin;
  readonly requireOwner: RequireOwner;
  readonly newThemeId: () => ThemeId;
  readonly emitUserEvent: EmitUserEvent;
}

/** The settings API surface. UserSettings verbs scope by `principal.userId`; AppSettings verbs gate on the
 *  injected guard; the raw KV pair is admin-gated at the router. */
export interface SettingsService {
  /** Read this user's typed/defaulted UserSettings. A never-touched account reads parsed defaults with no
   *  write (`updatedAt: 0`). */
  readonly getUserSettings: (params: GetUserSettingsParams) => Promise<UserSettingsView>;
  /** Whole-blob replace (first-touch seeds the row). Serialized per user. */
  readonly updateUserSettings: (params: UpdateUserSettingsParams) => Promise<UserSettingsView>;
  /** Deep-merge one namespace + re-validate the whole blob. Serialized per user. */
  readonly updateUserSettingsSection: (params: UpdateUserSettingsSectionParams) => Promise<UserSettingsView>;
  /** The lenient typed-blob loader for cross-feature callers (raw `userId`, not a gated user-facing verb). */
  readonly loadUserSettings: (userId: UserId) => Promise<UserSettings>;

  /** Read one raw global-KV row; `null` if absent. Admin-gated at the router. */
  readonly getGlobalSetting: (key: string) => Promise<GlobalSettingView | null>;
  /** Upsert one raw global-KV row. Throws `DomainOperationError(reserved_key)` for `APP_SETTINGS_KEY`. */
  readonly setGlobalSetting: (key: string, value: JsonValue) => Promise<GlobalSettingView>;

  /** Admin-only. The resolved runtime config (env floor ⊕ stored override). */
  readonly getAppSettings: (params: GetAppSettingsParams) => Promise<EffectiveAppConfig>;
  /** Admin-only; a PATCH touching an owner-box governance field additionally requires `requireOwner`.
   *  Read-merge-writes the override, then reloads the cache. */
  readonly updateAppSettings: (params: UpdateAppSettingsParams) => Promise<EffectiveAppConfig>;

  /** Sync hot-path read of the in-memory resolved cache. Before the first reload it is the env-only floor. */
  readonly getEffectiveConfig: () => EffectiveAppConfig;
  /** Rebuild the cache from the stored override (boot + after every admin write). */
  readonly reloadEffectiveConfig: () => Promise<EffectiveAppConfig>;

  /** The caller's own themes plus every seed palette, as views. */
  readonly listThemes: (params: ListThemesParams) => Promise<ThemeView[]>;
  /** One theme readable by this owner (their own OR any seed); throws `ThemeNotFoundError`. */
  readonly getTheme: (params: GetThemeParams) => Promise<ThemeView>;
  /** Write a new OWNED theme from scratch. Runs `themeOverrideSchema.parse` + the css-validator at the
   *  write boundary; a taken `(ownerId, name)` throws `DomainConflictError`. */
  readonly createTheme: (params: CreateThemeParams) => Promise<ThemeView>;
  /** Copy-to-customize: source = any readable row (own or seed) → a NEW owned row (fresh id, deep-copied
   *  `override`/`css`, name de-duped by numeric suffix under the unique index). Throws
   *  `ThemeNotFoundError` when the source isn't readable. */
  readonly duplicateTheme: (params: DuplicateThemeParams) => Promise<ThemeView>;
  /** Patch an OWNED theme (never a seed — `fetchOwned` can't match a NULL owner, so this 404s on a seed
   *  id). Runs the same write-boundary validation as `createTheme`. Throws `ThemeNotFoundError`. */
  readonly updateTheme: (params: UpdateThemeParams) => Promise<ThemeView>;
  /** Delete an OWNED theme (never a seed). Throws `ThemeNotFoundError` when unowned/missing/a seed. */
  readonly removeTheme: (params: RemoveThemeParams) => Promise<void>;
}

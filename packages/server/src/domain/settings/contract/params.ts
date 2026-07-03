// domain/settings/contract/params — every verb's *Params, declared ONCE (§7.4). Under the Principal model
// (spine identity-auth-permission §1) the gated verbs carry the acting `Principal` they gate on — there is
// no loose `{ userId; callerRole? }` (the neo fast/slow-path duality COLLAPSES: the principal already
// carries its fresh-per-request `role`, so the guard needs no db SELECT and no caller-supplied role to
// distrust). UserSettings verbs scope by `principal.userId` (a user reads/writes ONLY its own row — the PK
// is `userId`; settings NEVER reads/joins `users`). `getGlobalSetting`/`setGlobalSetting` take the raw KV
// pair (they are admin-gated at the ROUTER, not the verb).

import type { Principal } from "@orb/contracts/identity";
import type { AppSettings, UserSettings, UserSettingsSection } from "@orb/contracts/settings";

/** Whole-blob replace input. The persisted `schemaVersion` COLUMN is service-owned (pinned to the current
 *  code constant; it is what reads thread as `storedVersion`, beating any in-blob value — a client can't
 *  spoof past a lift). The `config` is validated against `userSettingsSchema` at the transport boundary. */
export interface UpdateUserSettingsInput {
  readonly config: UserSettings;
}

/** Section-patch input. `patch` is a deep-partial of the named namespace — deep-merged into the stored
 *  section (nested objects recurse; arrays/primitives REPLACE), then the WHOLE config re-validates through
 *  the lenient `parseUserSettings` (the self-heal seam). Lets one settings surface write its block without
 *  the whole-blob replace. */
export interface UpdateUserSettingsSectionInput {
  readonly section: UserSettingsSection;
  readonly patch: Record<string, unknown>;
}

export interface UserSettingsActorParams {
  readonly principal: Principal;
}

export interface GetUserSettingsParams extends UserSettingsActorParams {}

export interface UpdateUserSettingsParams extends UserSettingsActorParams {
  readonly input: UpdateUserSettingsInput;
}

export interface UpdateUserSettingsSectionParams extends UserSettingsActorParams {
  readonly input: UpdateUserSettingsSectionInput;
}

export interface AppSettingsActorParams {
  readonly principal: Principal;
}

export interface GetAppSettingsParams extends AppSettingsActorParams {}

export interface UpdateAppSettingsParams extends AppSettingsActorParams {
  /** The partial override blob. `requireAdmin` always; touching a D17 governance field additionally
   *  requires `requireOwner` (the verb's admin-vs-owner split). */
  readonly partial: AppSettings;
}

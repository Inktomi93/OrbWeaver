// domain/settings/contract/params — every verb's *Params, declared once. Gated verbs carry the acting
// Principal they gate on (no loose { userId; callerRole? }). UserSettings verbs scope by
// principal.userId — settings never reads/joins users. getGlobalSetting/setGlobalSetting take the raw
// KV pair; they're admin-gated at the router, not the verb.

import type { Principal } from "@orb/contracts/identity";
import type { AppSettings, UserSettingsSection } from "@orb/contracts/settings";
import type { CreateThemeInput, UpdateThemeInput } from "@orb/contracts/theme";
import type { ThemeId } from "@orb/kit/ids";

/** patch is a deep-partial of the named namespace, deep-merged into the stored section (arrays/primitives
 *  replace), then the whole config re-validates through the lenient parseUserSettings. */
export interface UpdateUserSettingsSectionInput {
  readonly section: UserSettingsSection;
  readonly patch: Record<string, unknown>;
}

interface UserSettingsActorParams {
  readonly principal: Principal;
}

export interface GetUserSettingsParams extends UserSettingsActorParams {}

export interface UpdateUserSettingsSectionParams extends UserSettingsActorParams {
  readonly input: UpdateUserSettingsSectionInput;
}

/** `addExternalBackground` (side-eye F-P0-2) — materialize a user-pasted external image URL into an owned CAS
 *  asset and return a ready `BackgroundLibraryEntry`. A DISCRETE action (never the keystroke autosave path):
 *  the URL is fetched+magic-verified+stored server-side, so it can never persist a paintable external URL. */
export interface AddExternalBackgroundParams extends UserSettingsActorParams {
  readonly url: string;
}

interface AppSettingsActorParams {
  readonly principal: Principal;
}

export interface GetAppSettingsParams extends AppSettingsActorParams {}

export interface UpdateAppSettingsParams extends AppSettingsActorParams {
  /** requireAdmin always; touching a D17 governance field additionally requires requireOwner. */
  readonly partial: AppSettings;
}

// Themes library — owner-only. Reads resolve owned ∪ seeds; writes go through fetchOwned(caller), so a
// seed row is un-mutable by construction.

interface ThemeActorParams {
  readonly principal: Principal;
}

export interface ListThemesParams extends ThemeActorParams {}

export interface GetThemeParams extends ThemeActorParams {
  readonly id: ThemeId;
}

export interface CreateThemeParams extends ThemeActorParams {
  readonly input: CreateThemeInput;
}

export interface DuplicateThemeParams extends ThemeActorParams {
  readonly id: ThemeId;
  /** Optional caller-supplied name; defaults to "<source> copy" (de-duped by numeric suffix). */
  readonly name?: string;
}

export interface UpdateThemeParams extends ThemeActorParams {
  readonly id: ThemeId;
  readonly input: UpdateThemeInput;
}

export interface RemoveThemeParams extends ThemeActorParams {
  readonly id: ThemeId;
}

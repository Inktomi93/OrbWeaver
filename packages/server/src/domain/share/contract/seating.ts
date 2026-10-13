import type { Principal } from "@orb/contracts/identity";
import type { AppSettings, AppSettingsView, EffectiveAppConfig } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";

export const SEATING_KEYS = ["localMultiUser", "discreetLogin"] as const satisfies readonly (keyof AppSettings & keyof EffectiveAppConfig)[];
type SeatingKey = (typeof SEATING_KEYS)[number];

export interface EnableShareSeatingDeps {
  readonly seating: () => Pick<EffectiveAppConfig, SeatingKey>;
  readonly getAppSettingsWithOverrides: (params: { readonly principal: Principal }) => Promise<Pick<AppSettingsView, "overrides">>;
  readonly updateAppSettings: (params: { readonly principal: Principal; readonly partial: AppSettings }) => Promise<void>;
  readonly getOwnerUserId: () => Promise<UserId | undefined>;
  readonly resolvePrincipal: (userId: UserId) => Promise<Principal>;
}

// The share's seating op: before a relay starts, the owner turns on multi-human seating and discreet login where
// either is off, and hands back the step that restores each changed setting's own stored override. Both are owner-box
// settings, so every write runs as the owner row's own Principal; a missing owner is a broken invariant.

import type { Principal } from "@orb/contracts/identity";
import type { AppSettings, EffectiveAppConfig } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import type { SessionsService } from "#domain/sessions";
import type { ShareServiceDeps } from "#domain/share";

const SEATING_KEYS = ["localMultiUser", "discreetLogin"] as const satisfies readonly (keyof AppSettings & keyof EffectiveAppConfig)[];
type SeatingKey = (typeof SEATING_KEYS)[number];

const NOTHING_TO_RESTORE = (): Promise<void> => Promise.resolve();

/** The `enableSeating` op the share service runs on every start. Writes nothing when both settings are on. */
export function createEnableShareSeating(deps: {
  readonly seating: () => Pick<EffectiveAppConfig, SeatingKey>;
  /** The stored overrides alone: a key absent here falls back to the deployment default. */
  readonly overrides: (principal: Principal) => Promise<Pick<AppSettings, SeatingKey>>;
  readonly updateAppSettings: (params: { readonly principal: Principal; readonly partial: AppSettings }) => Promise<unknown>;
  readonly sessions: Pick<SessionsService, "getOwnerUserId">;
  readonly resolvePrincipal: (userId: UserId) => Promise<Principal>;
}): ShareServiceDeps["enableSeating"] {
  return async () => {
    const effective = deps.seating();
    const off = SEATING_KEYS.filter((key) => !effective[key]);
    if (off.length === 0) {
      return NOTHING_TO_RESTORE;
    }
    const ownerId = await deps.sessions.getOwnerUserId();
    if (ownerId === undefined) {
      throw new Error("share: a start passed its preconditions with no owner row");
    }
    const principal = await deps.resolvePrincipal(ownerId);
    const stored = await deps.overrides(principal);
    // `null` clears an override, so a setting that only had the deployment default goes back to it.
    const restore: AppSettings = Object.fromEntries(off.map((key) => [key, stored[key] ?? null]));
    await deps.updateAppSettings({ principal, partial: { localMultiUser: true, discreetLogin: true } });
    return async () => {
      await deps.updateAppSettings({ principal, partial: restore });
    };
  };
}

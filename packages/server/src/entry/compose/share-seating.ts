// The share's seating op: before a relay starts, the owner turns on multi-human seating and discreet login where
// either is off. Both are owner-box settings, so the write runs as the owner row's own Principal; a start only
// reaches this under `local` with a claimed owner, so a missing owner is a broken invariant, not a user state.

import type { Principal } from "@orb/contracts/identity";
import type { AppSettings, EffectiveAppConfig } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import type { SessionsService } from "#domain/sessions";
import type { ShareServiceDeps } from "#domain/share";

/** The `enableSeating` op the share service runs on every start. Writes nothing when both settings are on. */
export function createEnableShareSeating(deps: {
  readonly seating: () => Pick<EffectiveAppConfig, "localMultiUser" | "discreetLogin">;
  readonly updateAppSettings: (params: { readonly principal: Principal; readonly partial: AppSettings }) => Promise<unknown>;
  readonly sessions: Pick<SessionsService, "getOwnerUserId">;
  readonly resolvePrincipal: (userId: UserId) => Promise<Principal>;
}): ShareServiceDeps["enableSeating"] {
  return async () => {
    const { localMultiUser, discreetLogin } = deps.seating();
    if (localMultiUser && discreetLogin) {
      return;
    }
    const ownerId = await deps.sessions.getOwnerUserId();
    if (ownerId === undefined) {
      throw new Error("share: a start passed its preconditions with no owner row");
    }
    await deps.updateAppSettings({ principal: await deps.resolvePrincipal(ownerId), partial: { localMultiUser: true, discreetLogin: true } });
  };
}

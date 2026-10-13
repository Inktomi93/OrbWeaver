// A failed relay restores only the settings this start changed, using their stored overrides and the owner row's Principal.
import type { AppSettings } from "@orb/contracts/settings";
import type { EnableShareSeatingDeps } from "../contract/seating.ts";
import { SEATING_KEYS } from "../contract/seating.ts";
import type { ShareServiceDeps } from "../contract/service.ts";

const NOTHING_TO_RESTORE = (): Promise<void> => Promise.resolve();

export function createEnableShareSeating(deps: EnableShareSeatingDeps): ShareServiceDeps["enableSeating"] {
  return async () => {
    const effective = deps.seating();
    const off = SEATING_KEYS.filter((key) => !effective[key]);
    if (off.length === 0) {
      return NOTHING_TO_RESTORE;
    }
    const ownerId = await deps.getOwnerUserId();
    if (ownerId === undefined) {
      throw new Error("share: a start passed its preconditions with no owner row");
    }
    const principal = await deps.resolvePrincipal(ownerId);
    const { overrides: stored } = await deps.getAppSettingsWithOverrides({ principal });
    const restore: AppSettings = Object.fromEntries(off.map((key) => [key, stored[key] ?? null]));
    await deps.updateAppSettings({ principal, partial: { localMultiUser: true, discreetLogin: true } });
    return async () => {
      await deps.updateAppSettings({ principal, partial: restore });
    };
  };
}

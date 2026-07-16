// verb: updateUserSettingsSection — deep-merge ONE namespace + re-validate the whole blob (the write path
// every settings surface should use). Scoped to `params.principal.userId`. Read-merge-write under the
// per-user serializer so a concurrent patch of a SIBLING section can't clobber this one (atomic w.r.t.
// other same-user writes). Re-validation runs through the lenient `parseUserSettings` (inside
// readUserSettings/writeUserConfig) — a malformed patch self-heals through the parser instead of nuking.

import type { UserSettings } from "@orb/contracts/settings";
import { isPlainObject } from "@orb/kit/guards";
import type { SettingsContext, SettingsService } from "../contract/service";
import { readUserSettings, writeUserConfig } from "../persistence/queries";
import { deepMergePlain } from "../substrate/merge";

export function createUpdateUserSettingsSection(ctx: SettingsContext): SettingsService["updateUserSettingsSection"] {
  return (params) => {
    const ownerId = params.principal.userId;
    const { section, patch } = params.input;
    return ctx.serializeUserWrite(ownerId, async () => {
      const current = (await readUserSettings(ctx.db, ownerId)).config;
      const existing = current[section];
      const mergedSection = deepMergePlain(isPlainObject(existing) ? existing : {}, patch) as UserSettings[typeof section];
      const at = ctx.now();
      await writeUserConfig(ctx.db, ownerId, { ...current, [section]: mergedSection }, at);
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: "settings.updateUserSettings",
          entityType: "settings",
          entityId: ownerId,
          // The changed section + the patch's top-level keys only — never the whole config blob.
          metadata: { section, keys: Object.keys(patch) },
        },
        at,
      );
      ctx.emitUserEvent(ownerId, { type: "settingsChanged" });
      return readUserSettings(ctx.db, ownerId);
    });
  };
}

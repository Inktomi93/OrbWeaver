// verb: updateUserSettingsSection — deep-merge ONE namespace + re-validate the whole blob (the write path
// every settings surface should use). Scoped to `params.principal.userId`. Read-merge-write under the
// per-user serializer so a concurrent patch of a SIBLING section can't clobber this one (atomic w.r.t.
// other same-user writes). Re-validation runs through the lenient `parseUserSettings` (inside
// readUserSettings/writeUserConfig) — a malformed patch self-heals through the parser instead of nuking, except
// an id pointer: a malformed one is refused up front (`USER_SETTINGS_POINTER_WRITES`) rather than stored as null.

import type { UserSettings } from "@orb/contracts/settings";
import { USER_SETTINGS_POINTER_WRITES } from "@orb/contracts/settings";
import { DomainOperationError } from "@orb/kit/errors";
import { isPlainObject } from "@orb/kit/guards";
import { SETTINGS_OP_CODES } from "../contract/errors.ts";
import type { SettingsContext, SettingsService } from "../contract/service.ts";
import { readUserSettings, writeUserConfig } from "../persistence/queries.ts";
import { deepMergePlain } from "../substrate/merge.ts";

export function createUpdateUserSettingsSection(ctx: SettingsContext): SettingsService["updateUserSettingsSection"] {
  return (params) => {
    const ownerId = params.principal.userId;
    const { section, patch } = params.input;
    if (USER_SETTINGS_POINTER_WRITES[section]?.safeParse(patch).success === false) {
      throw new DomainOperationError(SETTINGS_OP_CODES.malformedPointer, `The ${section} settings name an id that is not valid, so nothing was saved.`);
    }
    return ctx.serializeUserWrite(ownerId, async () => {
      const current = (await readUserSettings(ctx.db, ownerId)).config;
      const existing = current[section];
      const mergedSection = deepMergePlain(isPlainObject(existing) ? existing : {}, patch) as UserSettings[typeof section];
      const at = ctx.now();
      const nextConfig = { ...current, [section]: mergedSection };
      await writeUserConfig(ctx.db, ownerId, nextConfig, at);
      // Derive verb identity from the section discriminant so N callers sharing one wire procedure
      // never form N identical audit lines — the section IS the verb identity.
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: `settings.update.${section}`,
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

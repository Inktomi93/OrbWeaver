// verb: adoptImportedDefaultPersona — a profile import's default persona becomes the crown only where the
// owner has not crowned one: an existing `seeds.defaultPersonaId` is a choice, and an import never overrides it.
// Principal-less injected op for the import composition, like `createApplyImportedAppearance`.

import { databaseForOwner } from "@orb/db/wiring-owner";
import type { PersonaId, UserId } from "@orb/kit/ids";
import type { SettingsAssemblyContext, SettingsContext } from "../contract/service.ts";
import { readUserSettings, writeUserConfig } from "../persistence/queries.ts";

const DEFAULT_PERSONA_IMPORT = "settings.importDefaultPersona";
const SETTINGS_ENTITY = "settings";

/** Returns whether the crown moved. */
export function createAdoptImportedDefaultPersona(input: SettingsAssemblyContext): (ownerId: UserId, personaId: PersonaId) => Promise<boolean> {
  const ctx: SettingsContext = { ...input, db: databaseForOwner(input.db) };
  return async (ownerId, personaId) =>
    await ctx.serializeUserWrite(ownerId, async (): Promise<boolean> => {
      const current = (await readUserSettings(ctx.db, ownerId)).config;
      if (current.seeds.defaultPersonaId !== null) {
        return false;
      }
      const at = ctx.now();
      await writeUserConfig(ctx.db, ownerId, { ...current, seeds: { ...current.seeds, defaultPersonaId: personaId } }, at);
      await ctx.audit({ actorUserId: ownerId, action: DEFAULT_PERSONA_IMPORT, entityType: SETTINGS_ENTITY, entityId: ownerId, metadata: { personaId } }, at);
      ctx.emitUserEvent(ownerId, { type: "settingsChanged" });
      return true;
    });
}

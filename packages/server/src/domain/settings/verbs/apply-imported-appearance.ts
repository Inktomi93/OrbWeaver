// verb: applyImportedAppearance — land a FOREIGN profile's `appearance` plane (today: the SillyTavern profile
// importer) in ONE serialized write. A principal-less factory, not a `SettingsService` member: it is an
// injected op for the import composition, exactly like `createImportTheme`/`createImportUserSettings`.
//
// WHY IT IS NOT `updateUserSettingsSection`. `backgroundLibrary` is an ARRAY, and the section merge REPLACES
// arrays (`substrate/merge.ts` — "arrays + primitives replace, no array-concat"). Appending therefore needs a
// read-modify-write, and doing that from the CALLER would race any sibling `appearance` patch: the read and
// the write would straddle `serializeUserWrite` instead of sitting inside it. This verb runs both planes
// INSIDE the per-user serializer, so a concurrent patch of a sibling key can neither be clobbered nor clobber
// the append.
//
// APPEND, never replace, DEDUPED BY `assetId`: the CAS is content-addressed, so re-importing the same profile
// resolves the same asset ids and adds nothing — the whole-profile import stays idempotent (the same line the
// preset/world waves draw with `created`/`replaced`). An entry already present keeps its existing `entryId`
// and name, so a user who renamed an imported background does not have the rename undone by a re-run.
//
// FIRST-WRITER-WINS on the SCALAR patch: a scalar key already set on the stored blob to a NON-DEFAULT value is
// left alone and reported unpatched. An ST profile snapshot is one box's preferences; a whole-folder import
// may carry SEVERAL profile dirs, and silently letting the last dir's `fontScale` win would make the outcome
// depend on readdir order. The parsed blob always has a value for every key (the schema defaults), so
// "already set" is measured against the schema DEFAULT, not against absence.

import type { UserSettings } from "@orb/contracts/settings";
import { parseUserSettings } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import type { ImportedAppearance, ImportedAppearanceOutcome } from "../contract/portability.ts";
import type { SettingsContext } from "../contract/service.ts";
import { readUserSettings, writeUserConfig } from "../persistence/queries.ts";

const APPEARANCE = "appearance";
const APPEARANCE_IMPORT = "settings.importAppearance";
const SETTINGS_ENTITY = "settings";

/** The schema's own defaults — the reference "untouched" blob the first-writer-wins rule compares against. */
const DEFAULT_APPEARANCE: UserSettings["appearance"] = parseUserSettings({}).appearance;

/** The subset of `patch` this write should apply: a key whose stored value still equals the schema default
 *  (i.e. the user has never chosen it, and no earlier profile dir in this run has either). */
function unclaimedKeys(current: UserSettings["appearance"], patch: Record<string, unknown>): string[] {
  const claimable: string[] = [];
  for (const key of Object.keys(patch)) {
    const stored = (current as Record<string, unknown>)[key];
    const fallback = (DEFAULT_APPEARANCE as Record<string, unknown>)[key];
    if (JSON.stringify(stored) === JSON.stringify(fallback)) {
      claimable.push(key);
    }
  }
  return claimable;
}

/** Append the incoming library entries that name an asset the library does not already carry. */
function appendedLibrary(
  current: UserSettings["appearance"]["backgroundLibrary"],
  incoming: ImportedAppearance["backgroundLibrary"],
): UserSettings["appearance"]["backgroundLibrary"] {
  const known = new Set(current.map((entry) => entry.assetId));
  const additions = incoming.filter((entry) => {
    if (known.has(entry.assetId)) {
      return false;
    }
    known.add(entry.assetId);
    return true;
  });
  return additions.length === 0 ? current : [...current, ...additions];
}

/** Land one profile's `appearance` plane. Returns what actually changed (never throws for an empty input). */
export function createApplyImportedAppearance(ctx: SettingsContext): (ownerId: UserId, imported: ImportedAppearance) => Promise<ImportedAppearanceOutcome> {
  return async (ownerId: UserId, imported: ImportedAppearance): Promise<ImportedAppearanceOutcome> => {
    return await ctx.serializeUserWrite(ownerId, async (): Promise<ImportedAppearanceOutcome> => {
      const current = (await readUserSettings(ctx.db, ownerId)).config;
      const patchedKeys = unclaimedKeys(current.appearance, imported.patch);
      const backgroundLibrary = appendedLibrary(current.appearance.backgroundLibrary, imported.backgroundLibrary);
      const backgroundsAdded = backgroundLibrary.length - current.appearance.backgroundLibrary.length;
      if (patchedKeys.length === 0 && backgroundsAdded === 0) {
        return { backgroundsAdded: 0, patchedKeys: [] };
      }

      const claimed: Record<string, unknown> = {};
      for (const key of patchedKeys) {
        claimed[key] = imported.patch[key];
      }
      // The stored blob is validated on the READ side (`readUserSettings` → the lenient `parseUserSettings`),
      // which is the `updateUserSettingsSection` posture — so an ST value outside an orb field's bounds (an
      // out-of-range `font_scale`) heals to that field's default on the next read rather than ever rendering.
      const at = ctx.now();
      const nextAppearance = { ...current.appearance, ...claimed, backgroundLibrary };
      await writeUserConfig(ctx.db, ownerId, { ...current, [APPEARANCE]: nextAppearance } as UserSettings, at);
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: APPEARANCE_IMPORT,
          entityType: SETTINGS_ENTITY,
          entityId: ownerId,
          // The changed keys + the append count only — never the whole config blob.
          metadata: { keys: patchedKeys, backgroundsAdded },
        },
        at,
      );
      ctx.emitUserEvent(ownerId, { type: "settingsChanged" });
      return { backgroundsAdded, patchedKeys };
    });
  };
}

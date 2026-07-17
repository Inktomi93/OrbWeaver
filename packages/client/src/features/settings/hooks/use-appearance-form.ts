// The appearance-settings autosave form, mounted through the D78 session boundary (`AppearanceForm`) at
// module scope. The boundary OWNS the entity key (a fixed constant here), so there is no manual `key` to
// place wrong (autosave-form-doctrine.md §1/§8, D78 L4). The save fn closes over the live tRPC client, so
// the surface supplies it at call time. No draft mirror: appearance is server-synced and autosaves within
// the debounce window. The full AppearanceSettings is the form's value type so unshown knobs round-trip
// their server values unchanged.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { createAutosaveEntityBoundary } from "#forms";

/** The singleton entity id — appearance is one row per user, so a fixed key. */
export const APPEARANCE_ENTITY_ID = "appearance";

export const AppearanceForm = createAutosaveEntityBoundary<AppearanceSettings>({
  defaultValues: DEFAULT_APPEARANCE_SETTINGS,
});

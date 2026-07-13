// The appearance-settings autosave form, built on createAutosaveEntityForm at module scope. The save fn
// closes over the live tRPC client, so the surface supplies it at call time. No draft mirror: appearance
// is server-synced and autosaves within the debounce window. The full AppearanceSettings is the form's
// value type so unshown knobs round-trip their server values unchanged.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { createAutosaveEntityForm } from "#forms";

/** The singleton entity id — appearance is one row per user, so a fixed key. */
export const APPEARANCE_ENTITY_ID = "appearance";

export const useAppearanceForm = createAutosaveEntityForm<AppearanceSettings>({
  defaultValues: DEFAULT_APPEARANCE_SETTINGS,
});

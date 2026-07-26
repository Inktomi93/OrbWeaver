// The databank settings-section autosave form (Phase B ④), mounted through the D78 session boundary at
// module scope — the boundary OWNS the (constant) entity key (autosave-form-doctrine.md §1/§8, D78 L4).
// `defaultValues` is a type-level fallback: the surface renders inside a QueryBoundary after getUserSettings
// resolves, so the projected server values always fully override these seeds.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { createAutosaveEntityForm } from "#forms";
import type { DatabankSettingsForm } from "../lib/databank-settings-model";
import { projectDatabankForm } from "../lib/databank-settings-model";

/** The singleton entity id — the databank prefs are one row per user, so a fixed key. */
export const DATABANK_SETTINGS_ENTITY_ID = "databank-settings";

export const DatabankSettingsAutosaveForm = createAutosaveEntityForm<DatabankSettingsForm>({
  defaultValues: projectDatabankForm(DEFAULT_USER_SETTINGS.databank),
});

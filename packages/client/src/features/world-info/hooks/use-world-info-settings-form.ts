// The world-info settings-section autosave form, mounted through the D78 session boundary at module scope —
// the boundary OWNS the (constant) entity key (D78 L4). `defaultValues` is
// a type-level fallback: the surface renders inside a QueryBoundary after getUserSettings resolves, so the
// server values always fully override these seeds.

import type { UserSettings } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { createAutosaveEntityForm } from "#forms/editor";

/** The singleton entity id — the world-info prefs are one row per user, so a fixed key. */
export const WORLD_INFO_SETTINGS_ENTITY_ID = "world-info-settings";

// The form value IS the stored section shape — derived in place (no re-spelled alias).
export const WorldInfoSettingsAutosaveForm = createAutosaveEntityForm<UserSettings["worldInfo"]>({
  defaultValues: DEFAULT_USER_SETTINGS.worldInfo,
});

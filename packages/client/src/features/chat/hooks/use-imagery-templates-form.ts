// The imagery-templates settings-section autosave form (Phase B ⑫), mounted through the D78 session boundary
// at module scope — the boundary OWNS the (constant) entity key (autosave-form-doctrine.md §1/§8). The surface
// renders inside a QueryBoundary after getUserSettings resolves, so the projected server values fully override
// the type-level `defaultValues` seed.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { createAutosaveEntityForm } from "#forms";
import type { ImageryTemplatesForm } from "../lib/imagery-templates-model";
import { projectImageryTemplatesForm } from "../lib/imagery-templates-model";

/** The singleton entity id — the imagery prompt overrides are one row per user, so a fixed key. */
export const IMAGERY_TEMPLATES_ENTITY_ID = "imagery-templates-settings";

export const ImageryTemplatesAutosaveForm = createAutosaveEntityForm<ImageryTemplatesForm>({
  defaultValues: projectImageryTemplatesForm(DEFAULT_USER_SETTINGS.imagery),
});

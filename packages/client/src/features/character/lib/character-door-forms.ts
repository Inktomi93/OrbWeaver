import { Plus, Upload } from "@orb/ui/icons";
import type { OverflowMenuItem } from "#lib";
import { characterDoors } from "./character-door-requests.ts";
import { CHARACTER_IMPORT_NAME, CHARACTER_NEW_NAME } from "./character-names.ts";

/** The import door as a menu command: it asks the mounted door to open its dialog. */
export const CHARACTER_IMPORT_FORM: OverflowMenuItem = {
  id: "character-import",
  label: CHARACTER_IMPORT_NAME,
  icon: Upload,
  onSelect: (): void => characterDoors.request("import"),
};

/** The create door as a menu command: it asks the mounted door to open its dialog. */
export const CHARACTER_NEW_FORM: OverflowMenuItem = {
  id: "character-create",
  label: CHARACTER_NEW_NAME,
  icon: Plus,
  onSelect: (): void => characterDoors.request("create"),
};

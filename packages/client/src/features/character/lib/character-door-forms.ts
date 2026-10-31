import { Plus, Upload } from "@orb/ui/icons";
import type { OverflowMenuForm } from "#lib";
import { characterDoors } from "./character-door-requests.ts";
import { CHARACTER_IMPORT_NAME, CHARACTER_NEW_NAME } from "./character-names.ts";

/** The Characters create doors as overflow menu forms: each asks the mounted door cluster to open its dialog. */
export const CHARACTER_DOOR_FORMS: readonly [OverflowMenuForm, OverflowMenuForm] = [
  { id: "character-import", label: CHARACTER_IMPORT_NAME, icon: Upload, onSelect: (): void => characterDoors.request("import") },
  { id: "character-create", label: CHARACTER_NEW_NAME, icon: Plus, onSelect: (): void => characterDoors.request("create") },
];

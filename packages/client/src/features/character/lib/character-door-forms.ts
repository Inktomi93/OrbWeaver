import { Plus, Upload } from "@orb/ui/icons";
import type { OverflowMenuForm } from "#lib";
import { characterDoors } from "./character-door-requests.ts";

const IMPORT_DOOR_LABEL = "Import a character card";
const CREATE_DOOR_LABEL = "New character";

/** The Characters create doors as overflow menu forms: each asks the mounted door cluster to open its dialog. */
export const CHARACTER_DOOR_FORMS: readonly [OverflowMenuForm, OverflowMenuForm] = [
  { id: "character-import", label: IMPORT_DOOR_LABEL, icon: Upload, onSelect: (): void => characterDoors.request("import") },
  { id: "character-create", label: CREATE_DOOR_LABEL, icon: Plus, onSelect: (): void => characterDoors.request("create") },
];

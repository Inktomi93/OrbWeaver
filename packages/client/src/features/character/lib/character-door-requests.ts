// The Characters create doors as requests: the mounted door cluster owns its two dialogs and listens here, so the
// overflow menu of a row that moved the cluster out of reach opens the same dialogs the inline buttons do.

import { createOpenRequestChannel } from "#lib";

export type CharacterDoor = "import" | "create";

export const characterDoors = createOpenRequestChannel<CharacterDoor>();

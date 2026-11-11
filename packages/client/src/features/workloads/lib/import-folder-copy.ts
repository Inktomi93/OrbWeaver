// What the library import section says when a picked folder is the wrong one. A zero-import leaf, so a spec's node side reads
// the sentence without loading the component graph.

import { ST_SETTINGS_FILE } from "@orb/contracts/import";

/** Said once, inline, when the picked folder is not a SillyTavern user folder: what to pick instead. */
export const IMPORT_FOLDER_WRONG_FOLDER = `That folder doesn't look like a SillyTavern user folder. Pick the one that holds characters, chats and ${ST_SETTINGS_FILE}, usually data/default-user inside your SillyTavern folder.`;

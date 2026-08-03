// domain/rpg/verbs/game — the game verb group barrel (createGame + updateConfig + detachDanglingPointer +
// the two HOST model-call rounds: resyncFromStory over the story, populateFromCharacter over the card).

export { createCreateGame } from "./create-game.ts";
export { createDetachDanglingPointer } from "./detach-dangling-pointer.ts";
export { createPopulateFromCharacter } from "./populate-from-character.ts";
export { createResyncFromStory } from "./resync-from-story.ts";
export { createUpdateConfig } from "./update-config.ts";

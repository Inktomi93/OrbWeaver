// domain/rpg/verbs/game — the game verb group barrel (createGame + updateConfig + detachDanglingPointer +
// the two HOST model-call rounds: resyncFromStory over the story, populateFromCharacter over the card).

export { createCreateGame } from "./create-game";
export { createDetachDanglingPointer } from "./detach-dangling-pointer";
export { createPopulateFromCharacter } from "./populate-from-character";
export { createResyncFromStory } from "./resync-from-story";
export { createUpdateConfig } from "./update-config";

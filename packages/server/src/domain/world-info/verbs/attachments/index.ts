// verbs/attachments — the scope-attachment verb group barrel. One verb per file (verb-naming gate), three
// scopes: character (role-carrying + the primary belt), global, persona. The CHAT scope is FLAG[PD-30]
// (contract/service.ts header): chats are membership-scoped (D18) and need the `can({kind:'chat',roster})`
// resource arm + the chat bus, neither built. The composition root imports the factories from here.

export { createAttachGlobal } from "./attach-global";
export { createAttachToCharacter } from "./attach-to-character";
export { createAttachToPersona } from "./attach-to-persona";
export { createDetachFromCharacter } from "./detach-from-character";
export { createDetachFromPersona } from "./detach-from-persona";
export { createDetachGlobal } from "./detach-global";
export { createListForCharacter } from "./list-for-character";
export { createListForPersona } from "./list-for-persona";
export { createListGlobal } from "./list-global";

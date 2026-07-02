// verbs/attachments — the scope-attachment verb group barrel. One verb per file (verb-naming gate), FOUR
// scopes: character (role-carrying + the primary belt), global, persona, and chat (PD-30 — membership-
// scoped via the injected chat guards + the `WiBusEvent` emit; contract/service.ts header). The
// composition root imports the factories from here.

export { createAttachGlobal } from "./attach-global";
export { createAttachToCharacter } from "./attach-to-character";
export { createAttachToChat } from "./attach-to-chat";
export { createAttachToPersona } from "./attach-to-persona";
export { createDetachFromCharacter } from "./detach-from-character";
export { createDetachFromChat } from "./detach-from-chat";
export { createDetachFromPersona } from "./detach-from-persona";
export { createDetachGlobal } from "./detach-global";
export { createListForCharacter } from "./list-for-character";
export { createListForChat } from "./list-for-chat";
export { createListForPersona } from "./list-for-persona";
export { createListGlobal } from "./list-global";

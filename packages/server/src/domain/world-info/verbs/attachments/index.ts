// verbs/attachments — the scope-attachment verb group barrel. One verb per file (verb-naming gate), FOUR
// scopes: character (role-carrying + the primary belt), global, persona, and chat (PD-30 — membership-
// scoped via the injected chat guards + the `WiBusEvent` emit; contract/service.ts header). The
// composition root imports the factories from here.

export { createAttachGlobal } from "./attach-global.ts";
export { createAttachToCharacter } from "./attach-to-character.ts";
export { createAttachToChat } from "./attach-to-chat.ts";
export { createAttachToPersona } from "./attach-to-persona.ts";
export { createDetachFromCharacter } from "./detach-from-character.ts";
export { createDetachFromChat } from "./detach-from-chat.ts";
export { createDetachFromPersona } from "./detach-from-persona.ts";
export { createDetachGlobal } from "./detach-global.ts";
export { createListForCharacter } from "./list-for-character.ts";
export { createListForChat } from "./list-for-chat.ts";
export { createListForPersona } from "./list-for-persona.ts";
export { createListGlobal } from "./list-global.ts";

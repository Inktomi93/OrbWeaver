// verbs/attachments — the scope-attachment verb group barrel. One verb per file (verb-naming gate), FOUR
// scopes: global, character, preset (all owner-gated) and chat (membership-scoped via the injected chat
// guards, D18). Plus `applyScopeOrder`, the ONE order-rewrite verb across all four scopes — the operation is
// identical per scope (only the junction table differs), where attach/detach differ in their AUTHORITY.

export { createApplyScopeOrder } from "./apply-scope-order";
export { createAttachGlobal } from "./attach-global";
export { createAttachToCharacter } from "./attach-to-character";
export { createAttachToChat } from "./attach-to-chat";
export { createAttachToPreset } from "./attach-to-preset";
export { createDetachFromCharacter } from "./detach-from-character";
export { createDetachFromChat } from "./detach-from-chat";
export { createDetachFromPreset } from "./detach-from-preset";
export { createDetachGlobal } from "./detach-global";
export { createListForCharacter } from "./list-for-character";
export { createListForChat } from "./list-for-chat";
export { createListForPreset } from "./list-for-preset";
export { createListGlobal } from "./list-global";
export { createListRoomDisplayScripts } from "./list-room-display-scripts";
export { createListScriptUsage } from "./list-script-usage";

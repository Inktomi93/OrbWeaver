// verbs/attachments — the scope-attachment verb group barrel. One verb per file (verb-naming gate), FOUR
// scopes: global, character, preset (all owner-gated) and chat (membership-scoped via the injected chat
// guards, D18). Plus `applyScopeOrder`, the ONE order-rewrite verb across all four scopes — the operation is
// identical per scope (only the junction table differs), where attach/detach differ in their AUTHORITY.

export { createApplyScopeOrder } from "./apply-scope-order.ts";
export { createAttachGlobal } from "./attach-global.ts";
export { createAttachToCharacter } from "./attach-to-character.ts";
export { createAttachToChat } from "./attach-to-chat.ts";
export { createAttachToPreset } from "./attach-to-preset.ts";
export { createDetachFromCharacter } from "./detach-from-character.ts";
export { createDetachFromChat } from "./detach-from-chat.ts";
export { createDetachFromPreset } from "./detach-from-preset.ts";
export { createDetachGlobal } from "./detach-global.ts";
export { createListForCharacter } from "./list-for-character.ts";
export { createListForChat } from "./list-for-chat.ts";
export { createListForPreset } from "./list-for-preset.ts";
export { createListGlobal } from "./list-global.ts";
export { createListRoomDisplayScripts } from "./list-room-display-scripts.ts";
export { createListScriptUsage } from "./list-script-usage.ts";

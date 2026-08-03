// domain/regex — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The regex SCRIPT
// LIBRARY (D121-E): owner-authored find/replace scripts, attached at FOUR scopes (global / character /
// preset / chat) for the chat turn's host-tier resolver to union. `RegexContext` is assembled at the entry
// root (db + injected clock/id + db-bound `audit` + chat's own `requireChatHost`/`requireChatMember` guards
// + the user-bus emit) and passed in. Every non-chat surface is ownership-scoped off `principal.userId` (a
// script via `regexScripts.ownerId`, an attachment target via its own owner column); the chat scope is
// MEMBERSHIP-scoped (D18) through the injected guards.
//
// The ENGINE is not here and never will be: `@orb/kit/regex` executes, `@orb/server/kit/regex` is the
// node:vm watchdog. This domain owns the DATA the engine runs on (AGENTS §1 "engine vs data").

import type { RegexContext } from "./context";
import type { RegexService } from "./contract/service";
import {
  createApplyScopeOrder,
  createAttachGlobal,
  createAttachToCharacter,
  createAttachToChat,
  createAttachToPreset,
  createDetachFromCharacter,
  createDetachFromChat,
  createDetachFromPreset,
  createDetachGlobal,
  createListForCharacter,
  createListForChat,
  createListForPreset,
  createListGlobal,
  createListRoomDisplayScripts,
  createListScriptUsage,
} from "./verbs/attachments";
import { createCreate, createDuplicate, createGet, createList, createRemove, createUpdate } from "./verbs/scripts";

export function createRegexService(ctx: RegexContext): RegexService {
  return {
    listScripts: createList(ctx),
    getScript: createGet(ctx),
    createScript: createCreate(ctx),
    updateScript: createUpdate(ctx),
    removeScript: createRemove(ctx),
    duplicateScript: createDuplicate(ctx),
    listScriptUsage: createListScriptUsage(ctx),
    attachGlobal: createAttachGlobal(ctx),
    detachGlobal: createDetachGlobal(ctx),
    listGlobal: createListGlobal(ctx),
    attachToCharacter: createAttachToCharacter(ctx),
    detachFromCharacter: createDetachFromCharacter(ctx),
    listForCharacter: createListForCharacter(ctx),
    attachToPreset: createAttachToPreset(ctx),
    detachFromPreset: createDetachFromPreset(ctx),
    listForPreset: createListForPreset(ctx),
    attachToChat: createAttachToChat(ctx),
    detachFromChat: createDetachFromChat(ctx),
    listForChat: createListForChat(ctx),
    listRoomDisplayScripts: createListRoomDisplayScripts(ctx),
    applyScopeOrder: createApplyScopeOrder(ctx),
  };
}

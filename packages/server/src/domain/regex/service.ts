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

import type { RegexContext } from "./context.ts";
import type { RegexService } from "./contract/service.ts";
import { createExportRegexScript, createImportRegexScript } from "./persistence/portability-write.ts";
import {
  createApplyScopeOrder,
  createAttachGlobal,
  createAttachToCharacter,
  createAttachToChat,
  createAttachToPreset,
  createBulkSetGlobal,
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
} from "./verbs/attachments/index.ts";
import {
  createBulkRemove,
  createBulkSetEnabled,
  createBulkSetPlacement,
  createCreate,
  createDuplicate,
  createGet,
  createList,
  createRemove,
  createUpdate,
} from "./verbs/scripts/index.ts";

const ENC = new TextEncoder();

export function createRegexService(ctx: RegexContext): RegexService {
  // The two single-entity DOORS are the BUNDLE's own factories, principal-wrapped here and nowhere else
  // (the world-info `exportBook`/`importFile` shape): the standalone factories stay `ownerId`-keyed for the
  // portability registry, and this seam is the only place a Principal becomes an ownerId for them.
  const exportScript = createExportRegexScript(ctx);
  const importScript = createImportRegexScript(ctx);
  return {
    listScripts: createList(ctx),
    getScript: createGet(ctx),
    createScript: createCreate(ctx),
    updateScript: createUpdate(ctx),
    removeScript: createRemove(ctx),
    duplicateScript: createDuplicate(ctx),
    listScriptUsage: createListScriptUsage(ctx),
    bulkSetScriptsEnabled: createBulkSetEnabled(ctx),
    bulkSetScriptsGlobal: createBulkSetGlobal(ctx),
    bulkSetScriptsPlacement: createBulkSetPlacement(ctx),
    bulkRemoveScripts: createBulkRemove(ctx),
    exportScript: ({ principal, scriptId }) => exportScript({ ownerId: principal.userId, scriptId }),
    importScriptFile: ({ principal, fileText }) => importScript({ ownerId: principal.userId, bytes: ENC.encode(fileText) }),
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

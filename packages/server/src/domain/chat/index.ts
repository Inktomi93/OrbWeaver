// domain/chat — front door: the only legal external import; re-exports the public surface. The
// cross-boundary wire types (ChatBusEvent, GroupConfig, RoomOverrides, ParticipantView, …) live in
// @orb/contracts/chat; callers import them from there directly, not through this door.

export { createActiveTurns } from "./active-turns";
export { createChatBus } from "./bus";
export type {
  ChatContext,
  ChatServiceDeps,
  ChatToolExecFrame,
  ChatToolOps,
  ChatToolSet,
  EmitChatChanged,
  GeneratePictureOp,
  PresenceReadOp,
} from "./contract/context";
export type { ChatOpCode } from "./contract/errors";
export { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "./contract/errors";
export type { BulkImportChats, ChatImportContext } from "./contract/import";
export type { MemoryConfig, ResolveBackfillMemoryConfig } from "./contract/memory";
export {
  getGroupConfig,
  getRoomOverrides,
  getToolRecurseLimit,
  parseChatMetadata,
  TOOL_RECURSE_LIMIT_DEFAULT,
} from "./contract/metadata";
export type { TurnMessage, TurnRequest, TurnStreamChunk } from "./contract/results";
export type { ChatService } from "./contract/service";
export { requireAuthorOrHost, requireHost, requireParticipant } from "./guard";
export { generateDigests } from "./memory/build/digests";
export { generateSegments } from "./memory/build/segments";
export { loadChatMeta } from "./memory/persistence/queries";
export { createBulkImportChats } from "./persistence/import-write";
export { reclaimChatLocksOnBoot } from "./persistence/lock";
export { createChatService } from "./service";
export { backfillGroupCharacters, backfillMemory } from "./substrate/backfill";
export { setParticipantActivePersona } from "./verbs/roster";

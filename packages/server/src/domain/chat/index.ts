// domain/chat — FRONT DOOR: the only legal external import; re-exports the public surface. Three groups:
//   • createChatService — the composition root the entry seam wires + the service contract / DI bundle / deps
//     types (transport + tests reference them).
//   • the chat-OWNED collaborators the entry root must CONSTRUCT to supply `ChatServiceDeps`: the durable-first
//     chat bus (`createChatBus` → `.emit`) and the in-memory turn registry (`createActiveTurns` → `activeTurns`).
//   • the `@public` memory/persistence helpers wired by workload runners + bootstrap (NOT on the tRPC surface).
// The cross-boundary wire types (ChatBusEvent, GroupConfig, RoomOverrides, ParticipantView, …) live in
// `@orb/contracts/chat`; callers import them from there directly, NOT through this door (§7.4 — contracts is the
// cross-boundary node).

// The composition root + the chat-owned collaborators the entry root constructs for `ChatServiceDeps`
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
// The `chats.metadata` parse-seam the composition root binds onto `ChatContext.getGroupConfig`/
// `getRoomOverrides` (a thin convenience so chat verbs don't re-import the parser — see contract/context.ts).
// `parseChatMetadata` additionally backs the entry root's chat-row → `RoutableChat` provider-routing
// derivation (the `resolveConnection` dep). Surfaced here so `entry/` binds them without a deep import.
export {
  getGroupConfig,
  getRoomOverrides,
  getToolRecurseLimit,
  parseChatMetadata,
  TOOL_RECURSE_LIMIT_DEFAULT,
} from "./contract/metadata";
export type { TurnRequest, TurnStreamChunk } from "./contract/results";
export type { ChatService } from "./contract/service";
export { requireAuthorOrHost, requireHost, requireParticipant } from "./guard";
// The `@public` composition-root helpers (workload runners + bootstrap):
export { generateDigests } from "./memory/build/digests";
export { generateSegments } from "./memory/build/segments";
export { loadChatMeta } from "./memory/persistence/queries";
export { reclaimChatLocksOnBoot } from "./persistence/lock";
export { createChatService } from "./service";
// The PD-41 corpus sweeps (the workloads runner-env's memory/group-character backfill ops).
export { backfillGroupCharacters, backfillMemory } from "./substrate/backfill";
// PD-120: the chat-domain roster write persona's `setActivePersona` calls directly (persona composes
// BEFORE chat at the entry root — see `entry/compose/services.ts` — so this is a plain function, not a
// `ChatService` verb; the `requireAuthorOrHost` precedent above).
export { setParticipantActivePersona } from "./verbs/roster";

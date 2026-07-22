// domain/chat — front door: the only legal external import; re-exports the public surface. The
// cross-boundary wire types (ChatBusEvent, GroupConfig, RoomOverrides, ParticipantView, …) live in
// @orb/contracts/chat; callers import them from there directly, not through this door.

export { createActiveTurns } from "./active-turns";
export { createChatBus } from "./bus";
export type { ChatContext, ChatServiceDeps } from "./context";
// `ChatRpgGatherResult` + `ChatRpgOps` are PREBUILT[for: rpg push-2] — the injected rpg turn-ops seam +
// its structural gather result (rpg-design/05 §0). `ChatContext.rpg` binds a real value only when domain/rpg
// lands (chat.ts `input.rpg`); until then the field is null and the names have no by-name consumer, so the
// door keeps the seam reachable (the rpg-facing `GetMembership`/`PostNarratorMessage` precedent).
export type {
  ChatRpgGatherResult,
  ChatRpgOps,
  ChatToolExecFrame,
  ChatToolOps,
  ChatToolSet,
  EmitChatChanged,
  ExtractQuiet,
  ExtractQuietDeps,
  ExtractQuietParams,
  ExtractQuietResult,
  GeneratePictureOp,
  GetMembership,
  GetPendingUserText,
  PostNarratorMessage,
  PostNarratorMessageDeps,
  PresenceReadOp,
  PromptTransformRegistry,
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
export type { RequestTurnOp, TurnMessage, TurnRequest, TurnStreamChunk } from "./contract/results";
export type { ChatService } from "./contract/service";
export { requireAuthorOrHost, requireHost, requireParticipant } from "./guard";
export { generateDigests } from "./memory/build/digests";
export { generateSegments } from "./memory/build/segments";
export { loadChatMeta } from "./memory/persistence/queries";
export { resolveTier0Range } from "./memory/recall/bridge";
export { createBulkImportChats } from "./persistence/import-write";
export { reclaimChatLocksOnBoot } from "./persistence/lock";
// The expressions post-turn prose read (E3 — expressions-design/02 §3.1): the injected `readTurn` op is wired
// over this at the composition root. A pure `(db, …)` read (needs no ChatContext) so it breaks no cycle.
export { loadTurnForClassify, loadTurnOrigin } from "./persistence/queries";
// The membership primitive imagery's extractQuiet compose-gate reads (leak-free NOT_FOUND for a non-member —
// cross-tenant-sweep-enforced; the createGetMembership precedent, a pure `(db, chatId, userId)` read).
export { loadPresentRole } from "./persistence/roster";
export { createChatService } from "./service";
export { backfillGroupCharacters, backfillMemory } from "./substrate/backfill";
// The D50 PromptTransform registrar (automation-design/04 §6) — created ONCE at compose; its `apply` is wired
// as `ChatContext.promptTransforms`, its `register`/`unregister` onto automation's rule lifecycle + the plugin
// host (a later chunk). Zero registrants ⇒ byte-identical no-op. (`PromptTransformRegistry` type is homed in
// contract/context, re-exported above.)
export { createPromptTransformRegistry, PROMPT_TRANSFORM_DEADLINE_MS } from "./substrate/prompt-transforms";
// The standalone (out-of-turn) variable write (automation-design/03 §1.1) — the injected `applyVariableOps`
// op automation wires at the composition root; principal-free, teaches chat nothing automation-shaped.
export { applyStandaloneVariableOps } from "./substrate/variable-ops";
// The imagery quiet-extraction shaper (imagery-design/02 §2) — imagery consumes it as an injected op at the
// composition root; chat owns the history window + the {{char}}/{{user}} MacroContext.
export { createExtractQuiet } from "./verbs/extract-quiet";
// The rpg-facing generic chat surface (rpg-design/02 §1.1) — wired into `RpgContext.chat` at the composition
// root; each is principal-free (rpg gates game authority) and teaches chat nothing rpg-shaped.
export { createGetMembership } from "./verbs/get-membership";
export { createGetPendingUserText } from "./verbs/get-pending-user-text";
export { createPostNarratorMessage } from "./verbs/post-narrator-message";
export { setParticipantActivePersona } from "./verbs/roster";

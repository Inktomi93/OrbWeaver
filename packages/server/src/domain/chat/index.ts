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
  ForkGameArgs,
  ForkGameResult,
  GatherTurnContextArgs,
  GeneratePictureOp,
  GetMembership,
  GetPendingUserText,
  PostNarratorMessage,
  PostNarratorMessageDeps,
  PresenceReadOp,
  PromptTransformRegistry,
  ResolveCanonWindow,
  ResolveRpgCardCorpus,
  ResolveRpgRoster,
  ResolveViewerVisibility,
  RpgCardCorpus,
  RpgRosterActor,
  RpgTurnContext,
  RpgTurnTranscriptMessage,
  SetRpgPointer,
  ViewerVisibility,
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
  toolRecurseLimitSchema,
} from "./contract/metadata";
export type { ImpersonateStreamDelta, RequestTurnOp, TurnMessage, TurnRequest, TurnStreamChunk } from "./contract/results";
export type { ChatService } from "./contract/service";
export type { ChatWorkloadDeps } from "./contract/workloads";
export { requireAuthorOrHost, requireHost, requireParticipant } from "./guard";
export { generateDigests } from "./memory/build/digests";
export { generateSegments } from "./memory/build/segments";
export { loadChatMeta } from "./memory/persistence/queries";
export { resolveTier0Range } from "./memory/recall/bridge";
export { createBulkImportChats } from "./persistence/import-write";
export { reclaimChatLocksOnBoot } from "./persistence/lock";
// The expressions post-turn prose read (E3 — expressions-design/02 §3.1): the injected `readTurn` op is wired
// over this at the composition root. A pure `(db, …)` read (needs no ChatContext) so it breaks no cycle.
export { loadSeededChatDressing, loadTurnForClassify, loadTurnOrigin } from "./persistence/queries";
// The membership primitive imagery's extractQuiet compose-gate reads (leak-free NOT_FOUND for a non-member —
// cross-tenant-sweep-enforced; the createGetMembership precedent, a pure `(db, chatId, userId)` read).
export { loadPresentRole } from "./persistence/roster";
// The bundled EXAMPLE-conversation seeder (the `domain/character/seeder` sibling) — entry builds the ONE
// instance and shares it between boot and the first-authed-request hook.
export type { DemoChat, DemoChatActorSeat, DemoChatGame, DemoChatGameActor, DemoChatGameSetup, DemoChatSeat, DemoChatSeeder, DemoChatSeederDeps, SeededChatDressing } from "./seeder";
export { createDemoChatSeeder, DEMO_CHAT_NARRATOR_NAME, DEMO_CHAT_PACK_VERSION, DEMO_CHAT_TITLE_PREFIX, DEMO_CHATS } from "./seeder";
export { createChatService } from "./service";
// The ONE D16 per-bus-event visibility verdict (`substrate/auth/clamp`). Exported because the LIVE half of
// the chat ROOM stream runs OUTSIDE the domain (the per-chat fan-out is transport state, keyed by chatId
// only) yet must apply the IDENTICAL verdict the durable replay applies: one emitted event is BOTH fanned
// out live AND logged under ONE `seq`, so a laxer live arm would make a row's visibility depend on whether
// the client happened to be connected. The transport only APPLIES the verdict — it never re-derives the
// policy (the floor is handed to it by `chatEventBounds`). Same posture as the `requireHost`/
// `requireParticipant` guards this door already exports for out-of-domain enforcement.
export { isBelowHistoryFloor } from "./substrate/auth";
export { backfillGroupCharacters, backfillMemory } from "./substrate/backfill";
// The §3.6 member-strip verdict — exported for the SAME reason `isBelowHistoryFloor` is: the LIVE SSE
// fan-out (transport) must apply the identical per-subscriber strip the durable replay applies, off the
// `viewerIsHost` flag `chatEventBounds` resolves; the verdict is chat's ONE implementation everywhere.
export { scrubDeltaEventForMember, stripChatEventForMember, stripMessagesForViewer, viewerReadsHidden } from "./substrate/member-visibility";
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
// THE cross-domain viewer-visibility op (the read-visibility D-entry) — membership AND the D16 canon floor as
// ONE inseparable answer, wired at the composition root into every non-chat consumer that decides "may this
// human see this chat's CONTENT" (today: the automation plugin fan-out + the plugin membrane's chat read).
// Exported for the same reason `isBelowHistoryFloor` is: the verdict must be chat's everywhere it is applied,
// and a sibling domain re-deriving it is the defect class this op exists to make impossible.
// The rpg roster-resolution op (rpg-design/05 §4.3) — resolves present participants into rpg actor refs +
// name/avatar; wired into `RpgContext.resolveRoster` at the composition root (W1c-b). Standalone + principal-free.
export { createResolveCanonWindow } from "./verbs/resolve-canon-window";
// The BORN-STATE corpus read op (the host populate round) — one character's card prose + the room's opening
// line; wired into `RpgContext.resolveCardCorpus` at the composition root. Standalone + principal-free.
export { createResolveRpgCardCorpus } from "./verbs/resolve-rpg-card-corpus";
export { createResolveRpgRoster } from "./verbs/resolve-rpg-roster";
export { createResolveViewerVisibility } from "./verbs/resolve-viewer-visibility";
export { setParticipantActivePersona } from "./verbs/roster";
// The opaque rpg-pointer WRITE op (rpg-design/05 §3.1) — merges `metadata.rpg`; wired into `RpgContext.setPointer`
// at the composition root (W1c). Standalone + principal-free (createGame gated host; the getMembership precedent).
export { createSetRpgPointer } from "./verbs/set-rpg-pointer";
export { createChatWorkloadContributions } from "./workload-contributions";

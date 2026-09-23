// domain/chat — front door: the only legal external import; re-exports the public surface. The
// cross-boundary wire types (ChatBusEvent, GroupConfig, RoomOverrides, ParticipantView, …) live in
// @orb/contracts/chat; callers import them from there directly, not through this door.

export { createActiveTurns } from "./active-turns.ts";
export { createChatBus } from "./bus.ts";
export type { ChatContext, ChatServiceDeps } from "./context.ts";
// `ChatRpgGatherResult` + `ChatRpgOps` are PREBUILT[for: rpg push-2] — the injected rpg turn-ops seam +
// its structural gather result (rpg-design/05 §0). `ChatContext.rpg` binds a real value only when domain/rpg
// lands (chat.ts `input.rpg`); until then the field is null and the names have no by-name consumer, so the
// door keeps the seam reachable (the rpg-facing `GetMembership`/`PostNarratorMessage` precedent).
// The S2 teaching seam ships its types on this same door:
// `ChatTeachingRegistry` is what the composition root assembles onto `ChatContext.teaching`, and
// `TeachingContribution`/`TeachingContext`/`TeachingCollection`/`TeachingKnobs` are the shape every later
// contributing domain implements against.
export type {
  ChatRpgGameBirthPlan,
  ChatRpgGatherResult,
  ChatRpgOps,
  ChatTeachingRegistry,
  ChatToolExecFrame,
  ChatToolOps,
  ChatToolSet,
  ChatUserMacroDefs,
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
  HandoffCardCopy,
  HandoffHealArgs,
  MemoryStoreReceipt,
  PostNarratorMessage,
  PostNarratorMessageDeps,
  PresenceReadOp,
  PromptTransformRegistry,
  ResolveCanonWindow,
  ResolveRpgCardCorpus,
  ResolveRpgParticipants,
  ResolveViewerVisibility,
  RpgCardCorpus,
  RpgParticipantActor,
  RpgTurnContext,
  RpgTurnTranscriptMessage,
  SetRpgPointer,
  TeachingCollection,
  TeachingContext,
  TeachingContribution,
  TeachingKnobs,
  ViewerVisibility,
} from "./contract/context.ts";
export type { ChatOpCode } from "./contract/errors.ts";
export { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "./contract/errors.ts";
// The turn's identity axis (`ResolveForeignInputsOp`'s `trigger`) — the composition root dispatches over it
// to bind prompt-config `{{user}}`, so the union has to reach entry.
export type { TurnTrigger } from "./contract/foreign.ts";
export type { BulkImportChats, ChatImportContext } from "./contract/import.ts";
export type {
  MemoryConfig,
  MemoryEmbedSpace,
  MemoryRecallFilter,
  MemoryRecallRecord,
  MemoryRecallRecorder,
  ResolveBackfillMemoryConfig,
} from "./contract/memory.ts";
export {
  getGroupConfig,
  getRoomOverrides,
  getToolRecurseLimit,
  parseChatMetadata,
  TOOL_RECURSE_LIMIT_DEFAULT,
  toolRecurseLimitSchema,
} from "./contract/metadata.ts";
export type {
  ImpersonateStreamDelta,
  ReactAsCharacterOp,
  ReactAsCharacterResult,
  RequestTurnOp,
  ResolvedMediaRef,
  TurnMessage,
  TurnRequest,
  TurnStreamChunk,
} from "./contract/results.ts";
export type { ChatService } from "./contract/service.ts";
export type { ChatWorkloadDeps } from "./contract/workloads.ts";
export { requireAuthorOrHost, requireHost, requireParticipant } from "./guard.ts";
export { generateDigests } from "./memory/generate/digests.ts";
export { generateSegments } from "./memory/generate/segments.ts";
export { loadChatMeta } from "./memory/persistence/queries.ts";
export { resolveTier0Range } from "./memory/recall/bridge.ts";
// The recall flight recorder (#250) — the composition root builds ONE and wires its sink onto `ChatContext`.
export { createMemoryRecallRecorder } from "./memory/recall/recorder.ts";
export { createBulkImportChats } from "./persistence/import-write.ts";
export { reclaimChatLocksOnBoot } from "./persistence/lock.ts";
// The #1391 plugin tool wire-name rewrite over `message_variants.tool_calls` — the same boot-step shape
// (`entry/boot/migrate-plugin-tool-wire-names` runs it); chat owns it because chat owns the table.
export { migratePluginToolWireNames } from "./persistence/migrate-plugin-tool-wire-names.ts";
export { migrateSeededRoomBackgrounds } from "./persistence/migrate-seeded-backgrounds.ts";
// The #1649 handoff-offer vocabulary data migration — a boot step (`entry/boot/migrate-handoff-offer-vocab`)
// runs it; the SQL lives beside the offer's other writes.
export { migrateHandoffOfferVocab } from "./persistence/participant.ts";
// The membership primitive imagery's extractQuiet compose-gate reads (leak-free NOT_FOUND for a non-member —
// cross-tenant-sweep-enforced; the createGetMembership precedent, a pure `(db, chatId, userId)` read).
export { loadPresentRole } from "./persistence/participants-read.ts";
export { loadSeededChatDressing, loadTurnOrigin } from "./persistence/queries.ts";
export {
  createCompareAndSetImportedTokenUsage,
  createListImportedTokenUsageCandidates,
} from "./persistence/token-usage-backfill.ts";
// The bundled EXAMPLE-conversation seeder (the `domain/character/seeder` sibling) — entry builds the ONE
// instance and shares it between boot and the first-authed-request hook.
export type {
  DemoChat,
  DemoChatActorSeat,
  DemoChatGame,
  DemoChatGameActor,
  DemoChatGameSetup,
  DemoChatSeat,
  DemoChatSeeder,
  DemoChatSeederDeps,
  SeededChatDressing,
} from "./seeder/index.ts";
export { createDemoChatSeeder, DEMO_CHAT_NARRATOR_NAME, DEMO_CHAT_PACK_VERSION, DEMO_CHAT_TITLE_PREFIX, DEMO_CHATS } from "./seeder/index.ts";
export { createChatService } from "./service.ts";
// The ONE D16 per-bus-event visibility verdict (`substrate/auth/clamp`). Exported because the LIVE half of
// the chat ROOM stream runs OUTSIDE the domain (the per-chat fan-out is transport state, keyed by chatId
// only) yet must apply the IDENTICAL verdict the durable replay applies: one emitted event is BOTH fanned
// out live AND logged under ONE `seq`, so a laxer live arm would make a row's visibility depend on whether
// the client happened to be connected. The transport only APPLIES the verdict — it never re-derives the
// policy (the floor is handed to it by `chatEventBounds`). Same posture as the `requireHost`/
// `requireParticipant` guards this door already exports for out-of-domain enforcement.
export { isBelowHistoryFloor } from "./substrate/auth/index.ts";
export { backfillGroupCharacters, backfillMemory } from "./substrate/backfill.ts";
// The §3.6 member-strip verdict — exported for the SAME reason `isBelowHistoryFloor` is: the LIVE SSE
// fan-out (transport) must apply the identical per-subscriber strip the durable replay applies, off the
// `viewerIsHost` flag `chatEventBounds` resolves; the verdict is chat's ONE implementation everywhere.
export { scrubDeltaEventForMember, stripChatEventForMember, stripMessagesForViewer, viewerReadsHidden } from "./substrate/member-visibility.ts";
// The ONE participant display-name terminal (R10 + owner ruling: no raw id ever renders). Exported for the
// same reason the guards are: the regex compose seam (`entry/compose/regex.ts`) resolves the seated characters that name
// a room in the reverse roster, and it must land on the SAME word chat's own roster read does for a seat
// whose backing actor is gone — a second spelling would be a second vocabulary for one sentinel.
export { REMOVED_CHARACTER_LABEL, REMOVED_MEMBER_LABEL } from "./substrate/participant-name.ts";
// The D50 PromptTransform registrar (automation-design/04 §6) — created ONCE at compose; its `apply` is wired
// as `ChatContext.promptTransforms`, its `register`/`unregister` onto automation's rule lifecycle + the plugin
// host (a later chunk). Zero registrants ⇒ byte-identical no-op. (`PromptTransformRegistry` type is homed in
// contract/context, re-exported above.)
export { createPromptTransformRegistry, PROMPT_TRANSFORM_DEADLINE_MS } from "./substrate/prompt-transforms.ts";
// The standalone (out-of-turn) variable write (automation-design/03 §1.1) — the injected `applyVariableOps`
// op automation wires at the composition root; principal-free, teaches chat nothing automation-shaped.
export { applyStandaloneVariableOps } from "./substrate/variable-ops.ts";
// Chat's OWN S2 teaching contributions (the ratified `teaching-contribution.ts` root slot) — contributor #0,
// the rpg-gather projection. Assembled into `ChatContext.teaching` at `entry/compose` and nowhere else.
export { createChatTeachingContributions } from "./teaching-contribution.ts";
// The rpg-facing generic chat surface (rpg-design/02 §1.1) — wired into `RpgContext.chat` at the composition
// root; each is principal-free (rpg gates game authority) and teaches chat nothing rpg-shaped.
// THE husk→real claim chokepoint (R0). Exported because the narrator op is built OUTSIDE
// `createChatService` (it is an injected rpg op, not a routed verb) and needs the SAME one behavior.
export { createClaimChat } from "./verbs/claim-chat.ts";
// The imagery quiet-extraction shaper (imagery-design/02 §2) — imagery consumes it as an injected op at the
// composition root; chat owns the history window + the {{char}}/{{user}} MacroContext.
export { createExtractQuiet } from "./verbs/extract-quiet.ts";
export { createGetMembership } from "./verbs/get-membership.ts";
export { createGetPendingUserText } from "./verbs/get-pending-user-text.ts";
export { setParticipantActivePersona } from "./verbs/participants.ts";
export { createPostNarratorMessage } from "./verbs/post-narrator-message.ts";
// B7 — the `react` tool's standalone write op (deliberately NOT a ChatService member — its one consumer is
// the composition root's tool definition, `entry/compose/chat-tools.ts`; contract/params.ts states why).
export { createReactAsCharacter } from "./verbs/reactions.ts";
// THE cross-domain viewer-visibility op (the read-visibility D-entry) — membership AND the D16 canon floor as
// ONE inseparable answer, wired at the composition root into every non-chat consumer that decides "may this
// human see this chat's CONTENT" (today: the automation plugin fan-out + the plugin membrane's chat read).
// Exported for the same reason `isBelowHistoryFloor` is: the verdict must be chat's everywhere it is applied,
// and a sibling domain re-deriving it is the defect class this op exists to make impossible.
// The rpg roster-resolution op (rpg-design/05 §4.3) — resolves present participants into rpg actor refs +
// name/avatar; wired into `RpgContext.resolveParticipants` at the composition root (W1c-b). Standalone + principal-free.
export { createResolveCanonWindow } from "./verbs/resolve-canon-window.ts";
// The BORN-STATE corpus read op (the host populate round) — one character's card prose + the room's opening
// line; wired into `RpgContext.resolveCardCorpus` at the composition root. Standalone + principal-free.
export { createResolveRpgCardCorpus } from "./verbs/resolve-rpg-card-corpus.ts";
export { createResolveRpgParticipants } from "./verbs/resolve-rpg-participants.ts";
// The #1799 inbox read: which of a notifications page's chat-owned decisions are still open. Exported for
// the same reason the guards above are — the ANSWER is chat's (it lives in `chat_invites.status` and
// `chats.pending_host_user_id`), while the QUESTION belongs to a domain that must not import chat. The
// composition root joins them; notifications declares the op type it consumes and never learns a table name.
export { createResolveStandingAsks } from "./verbs/resolve-standing-asks.ts";
export { createResolveViewerVisibility } from "./verbs/resolve-viewer-visibility.ts";
// The opaque rpg-pointer WRITE op (rpg-design/05 §3.1) — merges `metadata.rpg`; wired into `RpgContext.setPointer`
// at the composition root (W1c). Standalone + principal-free (createGame gated host; the getMembership precedent).
export { createSetRpgPointer } from "./verbs/set-rpg-pointer.ts";
export { createChatWorkloadContributions } from "./workload-contributions.ts";

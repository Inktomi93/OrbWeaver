// domain/chat — front door: the only legal external import; re-exports the public surface. The
// cross-boundary wire types (ChatBusEvent, GroupConfig, RoomOverrides, ParticipantView, …) live in
// @orb/contracts/chat; callers import them from there directly, not through this door.

export { createActiveTurns } from "./active-turns.ts";
export { createTurnPersonaResolver } from "./assembly/turn-personas.ts";
export { createChatBus } from "./bus.ts";
export type { FreezeVolatileMacrosArgs, MacroRenderEnv, RenderMacrosOptions, TurnMacroContextArgs } from "./contract/assembly-macros.ts";
export type { ChatBoundBackfillOps } from "./contract/bound-backfill.ts";
// Chat owns the injected RPG turn operation and its result; RPG implements them through this type-only door.
export type {
  ChatRpgGameBirthPlan,
  ChatRpgGatherResult,
  ChatRpgOps,
  ChatServiceDeps,
  ChatUserMacroDefs,
  ClaimChatOp,
  ForkGameArgs,
  ForkGameResult,
  GatherTurnContextArgs,
  GetMembership,
  GetPendingUserText,
  PostNarratorMessage,
  PresenceReadOp,
  PromptTransformRegistry,
  ResolveCanonWindow,
  ResolveRpgCardCorpus,
  ResolveRpgParticipants,
  ResolveViewerVisibility,
  RpgCardCorpus,
  RpgTurnContext,
  RpgTurnTranscriptMessage,
  SetRpgPointer,
  TeachingCollection,
  TeachingContext,
  TeachingContribution,
} from "./contract/context.ts";

export { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "./contract/errors.ts";
export type { BeginGenerationObservation } from "./contract/generation-observation.ts";
export type { ImageryRoomAccessDeps } from "./contract/imagery-access.ts";
export type { BulkImportChats } from "./contract/import.ts";
export type { ImageRefAssets, ResolveMediaRefDeps } from "./contract/media-ref.ts";
export type { MemoryRecallRecorder } from "./contract/memory.ts";
export { getGroupConfig, getRoomOverrides, TOOL_RECURSE_LIMIT_DEFAULT, toolRecurseLimitSchema } from "./contract/metadata.ts";
export type { ReactToolHandlerDeps } from "./contract/react-tool.ts";
export type { RequestTurnOp } from "./contract/results.ts";
export type { ChatService } from "./contract/service.ts";
export type {
  SignupInviteDeps,
  SignupInviteOps,
} from "./contract/signup.ts";
export type { ChatAssemblyContext as ChatContext } from "./contract/wiring.ts";
export type { ChatWorkloadDeps } from "./contract/workloads.ts";
export { createRunChatTurnBridge } from "./engine/provider-bridge.ts";

export { requireWiredAuthorOrHost as requireAuthorOrHost, requireWiredHost as requireHost, requireWiredParticipant as requireParticipant } from "./guard.ts";
export { consolidationHash } from "./memory/generate/substrate/transcript.ts";

export { createLiveTier0Range } from "./memory/recall/live-tier-range.ts";
// The recall flight recorder (#250) — the composition root builds ONE and wires its sink onto `ChatContext`.
export { createMemoryRecallRecorder } from "./memory/recall/recorder.ts";
export { createBulkImportChats } from "./persistence/import-write.ts";
export { reclaimChatLocksOnBoot } from "./persistence/lock.ts";
// The #1391 plugin tool wire-name rewrite over `message_variants.tool_calls` — the same boot-step shape
// (`entry/boot/migrate-plugin-tool-wire-names` runs it); chat owns it because chat owns the table.
export { migratePluginToolWireNames } from "./persistence/migrate-plugin-tool-wire-names.ts";
// The #1649 handoff-offer vocabulary data migration — a boot step (`entry/boot/migrate-handoff-offer-vocab`)
// runs it; the SQL lives beside the offer's other writes.
export { migrateHandoffOfferVocab } from "./persistence/participant.ts";
// The membership primitive imagery's extractQuiet compose-gate reads (leak-free NOT_FOUND for a non-member —
// cross-tenant-sweep-enforced; the createGetMembership precedent, a pure `(db, chatId, userId)` read).
export { loadPresentRole } from "./persistence/participants-read.ts";

export { createRoomSeatReach } from "./persistence/room-reach.ts";
export {
  createCompareAndSetImportedTokenUsage,
  createListImportedTokenUsageCandidates,
} from "./persistence/token-usage-backfill.ts";
// The room's PRESENT host read: the one home of that rule. Compose wires it into every domain that needs the
// host (databank, embeddings, memory, regex, imagery) and the reaction gates call it directly.
export {
  isCharacterSeated,
  loadPluginCharacters,
  loadPluginMessages,
  loadPresentCharacterSeats,
  loadPresentHostUserId,
  migrateSeededRoomBackgrounds,
} from "./persistence/wiring-reads.ts";
export { createChatService, createVisibleExtractQuiet } from "./service.ts";
// The ONE D16 per-bus-event visibility verdict (`substrate/auth/clamp`). Exported because the LIVE half of
// the chat ROOM stream runs OUTSIDE the domain (the per-chat fan-out is transport state, keyed by chatId
// only) yet must apply the IDENTICAL verdict the durable replay applies: one emitted event is BOTH fanned
// out live AND logged under ONE `seq`, so a laxer live arm would make a row's visibility depend on whether
// the client happened to be connected. The transport only APPLIES the verdict — it never re-derives the
// policy (the floor is handed to it by `chatEventBounds`). Same posture as the `requireHost`/
// `requireParticipant` guards this door already exports for out-of-domain enforcement.
export { isBelowHistoryFloor } from "./substrate/auth/index.ts";
export { backfillGroupCharacters, backfillMemory } from "./substrate/backfill.ts";
export { estimateMemoryBackfillCalls } from "./substrate/backfill-estimate.ts";
export { createResolveChatUserMacroDefs } from "./substrate/macro-readers.ts";
// The §3.6 member-strip verdict — exported for the SAME reason `isBelowHistoryFloor` is: the LIVE SSE
// fan-out (transport) must apply the identical per-subscriber strip the durable replay applies, off the
// `viewerIsHost` flag `chatEventBounds` resolves; the verdict is chat's ONE implementation everywhere.
export { scrubDeltaEventForMember, stripChatEventForMember } from "./substrate/member-visibility.ts";
// The D50 PromptTransform registrar — created ONCE at compose; its `apply` is wired
// as `ChatContext.promptTransforms`, its `register`/`unregister` onto automation's rule lifecycle + the plugin
// host (a later chunk). Zero registrants ⇒ byte-identical no-op. (`PromptTransformRegistry` type is homed in
// contract/context, re-exported above.)
export { createPromptTransformRegistry } from "./substrate/prompt-transforms.ts";
export { createChatPublication } from "./substrate/publication.ts";
// The standalone (out-of-turn) variable write — the injected `applyVariableOps`
// op automation wires at the composition root; principal-free, teaches chat nothing automation-shaped.
export { applyStandaloneVariableOps } from "./substrate/variable-ops.ts";
// Chat's OWN S2 teaching contributions (the ratified `teaching-contribution.ts` root slot) — contributor #0,
// the rpg-gather projection. Assembled into `ChatContext.teaching` at `entry/compose` and nowhere else.
export { createChatTeachingContributions } from "./teaching-contribution.ts";
export { createChatAutomationReads } from "./verbs/automation-reads.ts";
export { createChatBoundBackfillOps } from "./verbs/bound-backfill.ts";
export { createCapturePersonaSeatsForDelete } from "./verbs/capture-persona-seats-for-delete.ts";
export { createGeneratePictureOp } from "./verbs/create-generate-picture.ts";
export { buildChatToolOps } from "./verbs/create-tool-ops.ts";
// The rpg-facing generic chat surface (docs/plans/rpg/design.md) — wired into `RpgContext.chat` at the composition
// root; each is principal-free (rpg gates game authority) and teaches chat nothing rpg-shaped.
// The `chatsChanged` member fan wired onto `ChatContext.emitChatChanged`; compose injects the user bus.
export { createEmitChatChanged } from "./verbs/emit-chat-changed.ts";

export { createGenerationObservationSink } from "./verbs/generation-observation-sink.ts";
export { createGetMembership } from "./verbs/get-membership.ts";
export { createGetPendingUserText } from "./verbs/get-pending-user-text.ts";
export { createImageryRoomAccess } from "./verbs/imagery-room-access.ts";
// The two co-participant asset reference checks assets consumes (`AssetsContext`): room membership is chat's data.
export { createLoadChatAssetRefs } from "./verbs/load-chat-asset-refs.ts";
export { createLoadCoParticipantOwner } from "./verbs/load-co-participant-owner.ts";
export { createChatMemorySearchOps } from "./verbs/memory-search.ts";
export { setParticipantActivePersona } from "./verbs/participants.ts";
export { createPluginChatAuthority } from "./verbs/plugin-authority.ts";
export { createPostNarratorMessage } from "./verbs/post-narrator-message.ts";
export { createReactToolHandler } from "./verbs/react-tool-handler.ts";
// B7 — the `react` tool's standalone write op (deliberately NOT a ChatService member — its one consumer is
// the composition root's tool definition, `entry/compose/chat-tools.ts`; contract/params.ts states why).
export { createReactAsCharacter } from "./verbs/reactions.ts";
export { createReadInheritedChatBooks } from "./verbs/read-inherited-chat-books.ts";
// THE cross-domain viewer-visibility op (the read-visibility D-entry) — membership AND the D16 canon floor as
// ONE inseparable answer, wired at the composition root into every non-chat consumer that decides "may this
// human see this chat's CONTENT" (today: the automation plugin fan-out + the plugin membrane's chat read).
// Exported for the same reason `isBelowHistoryFloor` is: the verdict must be chat's everywhere it is applied,
// and a sibling domain re-deriving it is the defect class this op exists to make impossible.
// The rpg roster-resolution op (docs/plans/rpg/design.md) — resolves present participants into rpg actor refs +
// name/avatar; wired into `RpgContext.resolveParticipants` at the composition root (W1c-b). Standalone + principal-free.
export { createResolveCanonWindow } from "./verbs/resolve-canon-window.ts";
export { createResolveMediaRef } from "./verbs/resolve-media-ref.ts";
// The D121-E room display policy regex consumes (`RegexContext.resolveRoomDisplayPolicy`): both halves are chat's data.
export { createResolveRoomDisplayPolicy } from "./verbs/resolve-room-display-policy.ts";
export { createChatRoomInputs } from "./verbs/resolve-room-inputs.ts";
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
// The ONE leak-safe reverse-room read every attachment-junction library consumes (`ResolveVisibleRoomsOp`).
export { createResolveVisibleRooms } from "./verbs/resolve-visible-rooms.ts";
export { createEmitRoomEntityChanged, createRoomEntityRefresh } from "./verbs/room-refresh.ts";
export { createChatInferenceOps } from "./verbs/runtime-inference.ts";
// The opaque rpg-pointer WRITE op (docs/plans/rpg/design.md) — merges `metadata.rpg`; wired into `RpgContext.setPointer`
// at the composition root (W1c). Standalone + principal-free (createGame gated host; the getMembership precedent).
export { createSetRpgPointer } from "./verbs/set-rpg-pointer.ts";
export { createChatWorkloadContributions } from "./workload-contributions.ts";

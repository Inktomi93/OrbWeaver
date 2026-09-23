// domain/chat/verbs/read — the chat read surface (listings, single-chat reads, dry-run prompt previews,
// resumable stream-ring reads). Pure reads: no canon mutation, no bus emit. Every chatId surface is
// membership-gated through the one `requireParticipant` chokepoint; listings are pure membership; the
// lineage/fork walks gate per-ancestor independently (a fork grants no parent membership).
//
// The dry-run previews (`previewAssembly`/`peekPrompt`/`previewSection`) build the assemble ctx + render
// through the `substrate/assembly-access` seam and return the BUILD product for inspection — no turn runs,
// nothing persists. ALL THREE gate at `requireHost` (matrix `host`): a RENDERED preview resolves the roster's
// cards at FULL fidelity, so a plain member reading one bypasses the D22 `memberCardVisibility` clamp. That
// holds per-SECTION, not just for the whole prompt — `main_prompt` renders `character.systemPrompt` (+ every
// co-speaker's), `post_history` the postHistoryInstructions, `char_description`/`scenario`/`dialogue_examples`
// the card text, and the `persona` marker another human's persona description — naming a section is not a
// cheap way around the two host-gated doors above.
// The two member-gated reads on this path build NO rendered bytes: `getActivePresetConfig` returns the bare
// `PromptConfig` (preset templates, no assemble ctx), and `previewContextFit` returns only the boundary id +
// budget numbers off a ctx it never serializes.
//
// Deps not on `ChatContext`: `loadParticipantViews` resolves the roster read-model; `resolveConnection`
// resolves the model the previews need; `resolveForeignInputs` is the foreign half of the assemble ctx.

import type {
  AssembleCharacter,
  AssembleContext,
  AssemblePersona,
  ChatInjection,
  ChatReasoningPart,
  ContextFitPreview,
  EffectiveRegexView,
  GroupConfig,
  JoinHistoryVisibility,
  MemberCardView,
  MemberCardVisibility,
  MessageView,
  ParticipantView,
} from "@orb/contracts/chat";
import { buildIdentityNameContext, CHAT_LIST_MAX_LIMIT, CHAT_MESSAGE_LIST_MAX_LIMIT, DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { GenerationCapability, SendAvailability } from "@orb/contracts/inference";
import { acceptsImageInput, acceptsVideoInput } from "@orb/contracts/inference";
import type { GuidedActionKind, PromptConfig, TemplateDefId, UserMacroSpec } from "@orb/contracts/preset";
import {
  DEFAULT_FORMAT_STRINGS,
  DEFAULT_GUIDED_ACTIONS,
  DEFAULT_NAMES_BEHAVIOR,
  DEFAULT_PROMPT_CONFIG,
  GUIDED_ACTION_KINDS,
  TEMPLATE_DEFS,
} from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import { composeProse, isPresetProseSlotId, resolveProseText } from "@orb/contracts/prose";
import { isRpgEngaged } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import type { Resolved } from "@orb/inference";
import { cachesByAnthropicMarkers, generationOf, resolveCarryReasoning } from "@orb/inference";
import { projectBodyForPreview } from "@orb/kit/content";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, MessageId, PersonaId, PresetId, UserId } from "@orb/kit/ids";
import type { MacroRegistry } from "@orb/kit/macro";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { estimateTokens } from "@orb/kit/tokens";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "../context.ts";
import type { TeachingIdentity, TeachingKnobs } from "../contract/context.ts";
import { ChatNotFoundError } from "../contract/errors.ts";
import type { ForeignInputs, HumanSeatPersona, ResolveForeignInputsOp } from "../contract/foreign.ts";
import { DEFAULT_CHAT_BEHAVIOR } from "../contract/foreign.ts";
import type { ChatMetadata } from "../contract/metadata.ts";
import type {
  ChatEventBoundsParams,
  GetActivePresetConfigParams,
  GetChatLineageParams,
  GetChatParams,
  GetMemberCardParams,
  GetShapeTraceParams,
  GetVariantWireParams,
  GuidedSteer,
  ListChatsParams,
  ListEffectiveRegexParams,
  ListForksParams,
  ListMessagesParams,
  ListMessageVariantsParams,
  ListParticipantsParams,
  PeekPromptParams,
  PreviewActionTemplatesParams,
  PreviewAssemblyParams,
  PreviewContextFitParams,
  PreviewSectionParams,
  ReplayChatEventsParams,
  ReplayStreamEventsParams,
  StreamEventBoundsParams,
} from "../contract/params.ts";
import type { PromptHistoryRegexEnv } from "../contract/regex.ts";
import type { HistoryBudgetInput, HistoryMacroNames } from "../contract/results.ts";
import type { ChatService } from "../contract/service.ts";
import type {
  ActionTemplatesPreview,
  AssembledPrompt,
  AssemblyPreview,
  ChatDetail,
  ChatEventAttach,
  ChatLineageView,
  ChatListPage,
  ChatSeatPortrait,
  ChatStreamReplayEvent,
  ChatSummary,
  MessagesPage,
  MessageVariantSummary,
  SectionPreview,
  ShapeTrace,
  StreamEventBounds,
  VariantWireView,
} from "../contract/views.ts";
import { gateLineagePerAncestor, requireHost, requireParticipant } from "../guard.ts";
import { loadChatIdentityProducer } from "../persistence/identity.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { loadParticipants, loadPresentVisibilityRows } from "../persistence/participants-read.ts";
import {
  countMemberChats,
  listMemberChats,
  loadAncestorChain,
  loadCanonHistory,
  loadCanonReasoningParts,
  loadChatEventBounds,
  loadChatEventReplay,
  loadChatLastMessages,
  loadChatMessageStats,
  loadChatRow,
  loadForkChildren,
  loadInlineReplyAssetIds,
  loadMessagesPage,
  loadMessageVariantSummaries,
  loadStreamBounds,
  loadStreamReplay,
  loadVariantWire,
} from "../persistence/queries.ts";
import { gatherAssembleContext } from "../substrate/assemble-gather.ts";
import type { fitHistory } from "../substrate/assembly-access.ts";
import {
  buildAssemblyBudget,
  buildHistoryBudget,
  buildPrompt,
  buildPromptWithSlices,
  buildShapeTrace,
  buildTurnMacroContext,
  buildTurnUserMacros,
  loadCharacterCardLore,
  previewActionText,
  previewSection,
  renderMacros,
  shapeContextForSpeaker,
  shapeTurn,
  speakerCue,
  toShapeCanon,
  voiceContextForSpeaker,
} from "../substrate/assembly-access.ts";
import { clampMemberCard, isBelowHistoryFloor, NO_HISTORY_FLOOR, resolveCardVisibility, resolveHistoryFloorSeq } from "../substrate/auth/index.ts";
import { toChatDetail } from "../substrate/chat-detail.ts";
import { projectViewForMember, scrubChatEventReplayForMember, scrubStreamReplayForMember, viewerReadsHidden } from "../substrate/member-visibility.ts";
import { hostUserIdOf } from "../substrate/participants-host.ts";
import { humanSeatPersonasOf, onlinePersonaIdsOf, presentAndEnabledHumanUserIdsOf, seatsMultipleHumans } from "../substrate/participants-humans.ts";
import { regexAllowOf, resolveRegexTiers } from "../substrate/regex-tier.ts";
import { collectTeaching, resolveTeachingKnobs } from "../substrate/teaching.ts";
import { buildWireHistory, convertsToEmptyWireRow, fitWireHistory } from "../substrate/wire-history.ts";

/** The per-chat DECEPTION-active verdict for the member reasoning-strip (§3.6): `true` ⇒ a non-host viewer loses
 *  the whole reasoning channel for this game. Resolved through the injected `ChatRpgOps.resolveReasoningHostOnly`
 *  (chat stays rpg-table-blind); `false` when rpg isn't wired / the chat is not a deception-active game — so a
 *  plain chat is byte-identical to the pre-P3 behavior. Only called on the NON-host path (the host reads verbatim). */
async function resolveReasoningHostOnly(ctx: ChatContext, chatId: ChatId): Promise<boolean> {
  return (await ctx.rpg?.resolveReasoningHostOnly(chatId)) ?? false;
}

/** The collaborators not on `ChatContext` (see the file header). */
interface ReadDeps {
  readonly loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]>;
  readonly resolveConnection: (args: { readonly funderUserId: UserId; readonly chatId: ChatId }) => Promise<Resolved<"chat">>;
  /** The deterministic pre-send serveability verdict for the chat's own resolved connection (#54). Reads the
   *  SAME chat-row routing overlay `resolveConnection` reads; fires no turn/API call. Wired at compose. */
  readonly checkSendAvailability: (args: { readonly funderUserId: UserId; readonly chatId: ChatId }) => Promise<SendAvailability>;
  /** The foreign half of the assemble ctx (preset/persona/settings). The chat-internal half is gathered
   *  by `gatherAssembleContext`. */
  readonly resolveForeignInputs: ResolveForeignInputsOp;
}

/** The read slice of `ChatService` this grouped file owns. */
type ReadVerbs = Pick<
  ChatService,
  | "listChats"
  | "listForks"
  | "getChatLineage"
  | "getChat"
  | "checkSendAvailability"
  | "getMemberCard"
  | "previewAssembly"
  | "previewActionTemplates"
  | "getActivePresetConfig"
  | "previewSection"
  | "peekPrompt"
  | "getShapeTrace"
  | "getVariantWire"
  | "previewContextFit"
  | "listEffectiveRegex"
  | "listMessages"
  | "listMessageVariants"
  | "listParticipants"
  | "replayStreamEvents"
  | "replayChatEvents"
  | "chatEventBounds"
  | "streamEventBounds"
>;

/** One parsed `chats` row as the persistence layer yields it — the input `buildSummaries` maps. Derived from
 *  the SINGLE-row read rather than from `listMemberChats`, whose rows carry the list's extra `recencyAt` sort
 *  key (#150): the fork/lineage summaries come from `loadForkChildren`/`loadAncestorChain`, which have no
 *  such key, and hanging this alias off the list read made those two callers un-typeable. */
type ChatRowView = NonNullable<Awaited<ReturnType<typeof loadChatRow>>>;

/** The resolved preview substrate: the host, the resolved seated characters/personas, the connection `model`, and the
 *  cross-domain assemble inputs. The previews + `getActivePresetConfig` share this resolution. */
interface PreviewInputs {
  /** The previewed chat — carried so the registry build can stamp the GAME group's `MacroSourceRef.id`. */
  readonly chatId: ChatId;
  readonly hostUserId: UserId;
  /** The room host whose connection the preview resolved under (§8.4-3). */
  readonly funderUserId: UserId;
  readonly model: string;
  /** The resolved model capability — the SHAPE-trace peek reads its `turns` cell (roleHandlingFloor /
   *  assistantPrefill) to shape faithfully. Undefined when the connection resolver omits it (a test double). */
  readonly capability: GenerationCapability | undefined;
  /** The connection caches by explicit block markers (`cachesByAnthropicMarkers`) — SHAPE keeps stored rows apart. */
  readonly explicitCacheMarkers: boolean;
  /** The resolved protocol axis — previewContextFit source-modes the divider boundary on it (agent-sdk → the
   *  marker coverage point; stateless → the fit boundary). */
  readonly api: Resolved<"chat">["api"];
  readonly characterIds: readonly CharacterId[];
  readonly personaIds: readonly PersonaId[];
  /** The room seats more than one present human — the SHAPE name-stamp's multi-human rule. */
  readonly multiHuman: boolean;
  /** The room's effective GroupConfig — its `output` axis is the ONE the SHAPE peek resolves, so a preview
   *  renders the SAME seated-characters/per-speaker shape the next turn will (`TurnSpeakerShape.output`), never a pinned
   *  guess. A narrator room previews its joined-seated-characters `{{char}}` + `[Character — …]` framing; per-speaker is
   *  byte-unchanged. `DEFAULT_GROUP_CONFIG` for a room carrying no group blob. */
  readonly group: GroupConfig;
  /** The room's parsed `metadata` blob — the B1 offer-choices knob's room half, so the host's Preview shows
   *  the choices teach exactly when a live turn would emit it. Off the chat row `resolvePreviewInputs`
   *  already reads; the host half rides `foreign.chatBehavior`. */
  readonly metadata: ChatMetadata;
  readonly foreign: ForeignInputs;
  /** The GAME's authored user macros (the second definition home, owner ruling #20) — resolved with the
   *  other cross-domain preview inputs so the preview registry sees the SAME effective def set a real turn
   *  builds (game shadows preset). Empty for a non-game / disengaged chat. */
  readonly gameUserMacros: readonly UserMacroSpec[];
}

/** Map a loaded chat row + its canon stats + present roster → the light `ChatSummary`
 *  list row. `participantNames` are display names only — the heavy roster is `getChat`. */
interface ChatSummaryInputs {
  readonly row: ChatRowView;
  readonly stat: { messageCount: number; lastMessageAt: number | null };
  readonly participants: readonly ParticipantView[];
  readonly viewerUserId: UserId;
  /** The already-resolved per-caller scent line (see {@link buildSummaryPreview}) — `null` = nothing this
   *  viewer may see. Resolved by the caller so the mapper stays pure (no clamp re-derivation here). */
  readonly lastMessagePreview: string | null;
}

/**
 * The list row's participant display names — every present seat (humans AND characters) MINUS the viewer's
 * own seat (side-eye NR4).
 *
 * The names are what an untitled row shows as its title ("Nate, Niko"), and the viewer is in every chat they
 * can list, so their own name is a constant prefix carrying zero information while eating the width the row
 * has for the people it is ABOUT. Suppressing it makes the row read "Niko" — which is how a human names that
 * conversation. FLOOR: only when at least one OTHER seat remains, so a solo / self chat keeps its name
 * instead of collapsing to "Untitled chat".
 */
function summaryParticipantNames(participants: readonly ParticipantView[], viewerUserId: UserId): readonly string[] {
  const others = participants.filter((p) => p.userId !== viewerUserId);
  return (others.length > 0 ? others : participants).map((p) => p.displayName);
}

/**
 * The row's own faces (#192) — the PRESENT character seats, in seat order, off the roster views this
 * projection already loaded.
 *
 * It replaces a client-side whole-library join: every surface showing a chat row fetched
 * `character.list {limit: 500}` and indexed character ids into it, which cost a library-sized
 * read to decorate six rows and silently stopped resolving faces past the page ceiling. The roster resolver
 * already reads exactly these cards (it is what `participantNames` comes from), so the join belongs here.
 *
 * A human/agent/observer seat carries no character (`characterId === null`) and is not a face this slot
 * paints — the leading slot is the room's characters, and the viewer's own avatar on their own row would be the
 * same constant-prefix noise `summaryParticipantNames` suppresses from the title.
 */
function seatPortraits(participants: readonly ParticipantView[]): ChatSeatPortrait[] {
  const portraits: ChatSeatPortrait[] = [];
  for (const participant of participants) {
    if (participant.kind !== "character" || participant.characterId === null) {
      continue;
    }
    portraits.push({ characterId: participant.characterId, name: participant.displayName, avatarHash: participant.avatarHash });
  }
  return portraits;
}

function toChatSummary({ row, stat, participants, viewerUserId, lastMessagePreview }: ChatSummaryInputs): ChatSummary {
  return {
    id: row.id,
    title: row.title,
    starred: row.starred,
    archived: row.archived,
    lastMessageAt: stat.lastMessageAt,
    messageCount: stat.messageCount,
    lastMessagePreview,
    // The ONE takeover-gate predicate over the opaque pointer (§2.1) — never a re-spelled null-check, so the
    // list marker and every client rpg gate agree (a DISENGAGED game shows no panel, so it shows no marker).
    isGame: isRpgEngaged(row.metadata.rpg),
    // #863(f) — the PAUSED bit, derived from the same opaque pointer (no rpg read, no widened `isGame`):
    // a game exists here and is switched off. The list row shows it quietly so a host can find a sleeping
    // game; every gate that asks "is this a live game" still reads `isGame` alone.
    gamePaused: row.metadata.rpg !== undefined && !isRpgEngaged(row.metadata.rpg),
    participantNames: summaryParticipantNames(participants, viewerUserId),
    participantPortraits: seatPortraits(participants),
    // Derive the caller's role from the present roster already loaded for this row — no extra read. The
    // caller is a present member on every listing path (membership-gated), so the `find` resolves; fail to
    // the least-privileged `member` on the impossible miss (never grant host by default).
    viewerRole: participants.find((p) => p.userId === viewerUserId)?.role ?? "member",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The canon stats for a chat with no messages (absent from the batched aggregate). */
const EMPTY_STATS = { messageCount: 0, lastMessageAt: null } as const;

/** `listChats` page size when the caller names none — the `character.list` pair (50/100), deliberately the
 *  same numbers so the two library reads cost the same per page. The MAX ceiling is the shared
 *  `CHAT_LIST_MAX_LIMIT` (`@orb/contracts/chat` — the transport trust boundary references the same value); the
 *  `Math.min` below is the DoS backstop for internal callers that bypass the transport. */
const CHAT_LIST_DEFAULT_LIMIT = 50;

/**
 * The per-caller SCENT line for one listed chat — the newest visible row, projected to one plain-text line.
 *
 * THE MEMBER-VISIBILITY ARM (the reason this is not just "format the last message"): the preview is decided
 * against the viewer's OWN D16 history floor, resolved from their own participant row by the ONE clamp
 * resolver (`resolveHistoryFloorSeq`) — never stamped, never shared between viewers. Because the floor is a
 * MINIMUM `messages.seq`, the newest row is the last row that can clear it: `seq < floor` ⇒ the viewer's whole
 * readable window is empty ⇒ NO preview (not "the next one down" — a `from-join` member must see nothing of
 * the pre-join transcript, and walking backward would hand them exactly that). FAIL-CLOSED on an absent
 * membership row (`undefined` ⇒ no preview), so a listing path that ever stopped gating cannot leak a body.
 * The hidden-class strip is UNCONDITIONAL (inside `projectBodyForPreview`), so the veiled case is safe for
 * every viewer including the host — a `<lie>`'s truth is never list chrome.
 */
function buildSummaryPreview(
  last: { seq: number; content: string } | undefined,
  membership: { readonly role: ParticipantRole; readonly joinSeq: number; readonly joinHistoryVisibility: JoinHistoryVisibility } | undefined,
): string | null {
  if (last === undefined || membership === undefined) {
    return null;
  }
  if (last.seq < resolveHistoryFloorSeq(membership)) {
    return null;
  }
  const preview = projectBodyForPreview(last.content);
  return preview.length > 0 ? preview : null;
}

/** Resolve a set of chat rows → `ChatSummary[]` (the canon stats, the last-message bodies, the caller's own
 *  visibility rows and the character seats each batched in ONE read — no N+1; the names per chat).
 *  Shared by listChats / listForks / getChatLineage. */
async function buildSummaries(db: Db, deps: ReadDeps, rows: readonly ChatRowView[], viewerUserId: UserId): Promise<ChatSummary[]> {
  if (rows.length === 0) {
    return [];
  }
  const chatIds = rows.map((r) => r.id);
  const stats = await loadChatMessageStats(db, chatIds);
  const lastMessages = await loadChatLastMessages(db, chatIds);
  const visibility = await loadPresentVisibilityRows(db, chatIds, viewerUserId);
  const enriched = await Promise.all(rows.map(async (row) => ({ row, names: await deps.loadParticipantViews(row.id) })));
  return enriched.map(({ row, names }) =>
    toChatSummary({
      row,
      stat: stats.get(row.id) ?? EMPTY_STATS,
      participants: names,
      viewerUserId,
      lastMessagePreview: buildSummaryPreview(lastMessages.get(row.id), visibility.get(row.id)),
    }),
  );
}

/** Resolve the {@link PreviewInputs} for a chat: the present roster → host + seated characters + personas, then the
 *  connection (`model`) + the cross-domain assemble inputs. A hostless room is unusable (leak-free
 *  NOT_FOUND). The seated characters are reordered to put `speakerCharacterId` primary when supplied.
 *
 *  A preview has no TRIGGERING human (no turn is running), so `{{user}}` for the prompt-config sections binds
 *  to the HOST's own active persona (the `human` trigger) — the preview already resolves everything else under
 *  the host (`runAsUserId`, the connection, the preset). A host with NO active persona takes the `none` arm ⇒
 *  the chat ANCHOR. Both arms are deterministic and host-scoped; neither can surface another member's persona
 *  on the host's own instrument.
 *
 *  It also runs the turn's GM-PRESET REDIRECT (see the block at the `resolveForeignInputs` call), so every
 *  surface built on these inputs — `previewAssembly`, `peekPrompt`, `getShapeTrace`, `previewContextFit`,
 *  `previewSection`, `previewActionTemplates`, `getActivePresetConfig` — answers about the preset the TURN
 *  assembles on a game chat — the same preset-redirect hop as the turn, so a preview never renders a preset
 *  the turn wouldn't. */
async function resolvePreviewInputs(
  ctx: ChatContext,
  deps: ReadDeps,
  chatId: ChatId,
  opts: {
    readonly anchorPersonaId: PersonaId | null;
    readonly speakerCharacterId?: CharacterId | null | undefined;
    /** D8 / §7.1 — assemble as if THIS preset were the chat's active one (the preset editor's bound readout
     *  inspects a preset the room has not adopted). Rides the LANDED `ResolveForeignInputsOp.presetOverride`
     *  seam (minted for the rpg GM-voice redirect): compose resolves it owned-or-system under the HOST and
     *  falls back to the host's own default on a stale/unowned id — the lenient-id rule, so an override can
     *  never read a preset outside the host's library. Absent ⇒ the GM-preset redirect, else the host default.
     *
     *  EXPLICIT OUTRANKS THE REDIRECT: this is a host pointing at a candidate preset and asking what it would
     *  render here. Letting a game chat's `gmPresetId` win would answer a question nobody asked, on the one
     *  surface whose entire job is inspecting a preset the room has NOT adopted. */
    readonly presetOverride?: PresetId | undefined;
  },
): Promise<PreviewInputs> {
  const { anchorPersonaId, speakerCharacterId } = opts;
  const participants = await loadParticipants(ctx.db, chatId);
  const hostUserId = hostUserIdOf(participants);
  if (hostUserId === null) {
    throw new ChatNotFoundError(chatId);
  }
  // The room's effective output axis (narrator vs per-speaker) — read exactly as `getGroupConfigForChat` does
  // so the SHAPE peek renders the shape the next turn will send, not a pinned `per-speaker` guess.
  const chatRow = await loadChatRow(ctx.db, chatId);
  const group = chatRow?.metadata.group ?? DEFAULT_GROUP_CONFIG;
  const participantCharacterIds = participants.flatMap((r) => {
    const actor = classifyParticipant(r);
    return actor?.kind === "character" ? [actor.characterId] : [];
  });
  const characterIds =
    speakerCharacterId !== null && speakerCharacterId !== undefined && participantCharacterIds.includes(speakerCharacterId)
      ? [speakerCharacterId, ...participantCharacterIds.filter((id) => id !== speakerCharacterId)]
      : participantCharacterIds;
  // #1401 — the SAME derivation the live turn runs (`verbs/turn.ts::loadRoom`), through the one substrate
  // lens. This used to take every present human's active persona with no filter at all, so a preview
  // assembled the persona-scope world-info of members who were not in the room — an honesty instrument
  // reporting a prompt the next real turn would not send. Presence is the axis here (not the enabled
  // consent gate `previewPresentHumanUserIds` applies below); the two answer different questions.
  const personaIds = await onlinePersonaIdsOf(ctx, participants);
  const hostPersonaId =
    participants.find((r) => {
      const actor = classifyParticipant(r);
      return actor?.kind === "human" && actor.userId === hostUserId;
    })?.activePersonaId ?? null;
  const connection = await deps.resolveConnection({ funderUserId: hostUserId, chatId });
  // THE GM-PRESET REDIRECT — the SAME early hop the turn runs (`verbs/turn.ts`: `resolvePresetOverride` before
  // the foreign read). A game chat assembles its `gmPresetId`, not the host's default preset; without this hop
  // every preview surface on a game chat would render the host's DEFAULT preset's templates
  // while the turn ships the GM preset's — the sections, the guided prompts, the format strings, the framings,
  // and the eleven rpg teaches. A preview is an HONESTY INSTRUMENT; a
  // preview that resolves a different preset than the turn is not a partial answer, it is a wrong one.
  //
  // PRECEDENCE mirrors the turn's, with one addition the turn has no analogue for: an EXPLICIT `presetOverride`
  // is the preset editor asking "what would THIS preset render in this room", so it outranks the redirect —
  // otherwise a host inspecting a candidate preset on a game chat would be shown the GM preset instead of the
  // one they clicked. Absent ⇒ the redirect ⇒ (no game / no gmPresetId) the host's own default, unchanged.
  const explicitPreset = opts.presetOverride;
  const gmPreset = explicitPreset !== undefined || ctx.rpg === null ? null : await ctx.rpg.resolvePresetOverride(chatId);
  const presetOverride = explicitPreset ?? gmPreset ?? undefined;
  // A preview is an HONESTY INSTRUMENT (see the file doc above) — it must not overstate what a live turn would
  // actually resolve, so the enabled axis narrows this exactly like `verbs/turn.ts`'s `loadRoom` (2026-08-15).
  const previewPresentHumanUserIds = await presentAndEnabledHumanUserIdsOf(ctx, participants);
  const foreign = await deps.resolveForeignInputs({
    chatId,
    runAsUserId: hostUserId,
    model: connection.model,
    anchorPersonaId,
    presentHumanUserIds: previewPresentHumanUserIds,
    humanSeats: humanSeatPersonasOf(participants, previewPresentHumanUserIds),
    // A preview shows the next canon turn, which binds `{{user}}` to the anchor human whoever sends it, so the
    // trigger does not change what it renders.
    trigger: hostPersonaId !== null ? { kind: "human", userId: hostUserId, personaId: hostPersonaId } : { kind: "none" },
    voice: "anchor",
    ...(presetOverride !== undefined ? { presetOverride } : {}),
  });
  const gameUserMacros = ctx.rpg === null ? [] : await ctx.rpg.resolveUserMacros(chatId);
  return {
    chatId,
    hostUserId,
    funderUserId: hostUserId,
    model: connection.model,
    capability: generationOf(connection),
    explicitCacheMarkers: cachesByAnthropicMarkers(connection, generationOf(connection)),
    api: connection.api,
    characterIds,
    personaIds,
    multiHuman: seatsMultipleHumans(previewPresentHumanUserIds),
    group,
    // The SAME row `group` came off — an absent row is a metadata-less room (⇒ every knob inherits).
    metadata: chatRow?.metadata ?? {},
    foreign,
    gameUserMacros,
  };
}

/** The per-preview user-macro RENDER registry (WAVE MU) — resolves the preset's user macros with a STABLE
 *  prng (`() => 0`), so a random-pick previews its FIRST-pool value and a re-poll never varies (the
 *  "preview never varies per poll" precedent — `gatherAssembleContext`'s absent-prng arm). Draws are
 *  discarded (a preview persists nothing). `null` ⇒ no user macros ⇒ the process singleton (byte-identical). */
function buildPreviewRegistry(inputs: PreviewInputs): MacroRegistry | null {
  const built = buildTurnUserMacros({
    preset: { id: inputs.foreign.presetId ?? "default", defs: inputs.foreign.promptConfig.userMacros },
    // The GAME's defs (shadowing the preset's on a name clash) — a preview of a game chat must render the
    // macro the TURN would render, not the one the game overrode.
    ...(inputs.gameUserMacros.length > 0 ? { game: { id: inputs.chatId, defs: inputs.gameUserMacros } } : {}),
    values: {},
    prng: () => 0,
  });
  return built?.registry ?? null;
}

/** The PREVIEW's gather half — the rpg macro/CEL feed (rpg-design/05 §1) plus the S2 teaching collection
 *  (whose contributor #0 carries a game's depth-0 state-block reminder), staged exactly as the turn path
 *  stages them so the host's honesty instrument shows what the model actually reads (without this the whole
 *  state block is INVISIBLE there, and a later teaching contributor would be invisible the same way).
 *  Read-only + turnless: no pending user text, `respondsToLatestUserTurn: false` (no dice-feed eligibility),
 *  nothing staged, nothing persisted. Non-game + nothing teaching ⇒ `{}` ⇒ a byte-identical build. */
async function previewGatherFields(
  ctx: ChatContext,
  args: {
    readonly chatId: ChatId;
    /** The room's frozen host (D19) — the identity the collection resolves under, exactly as a turn does. */
    readonly hostUserId: UserId;
    /** The READER — whose chat connection the rpg delivery verdict reads (§8.4-3). */
    readonly funderUserId: UserId;
    /** PROSE-1 — the previewed preset's teach/heading overrides, threaded for the same reason the whole gather
     *  is: the preview must show the bytes the model actually receives, and a host who re-authored a teach on
     *  this preset would otherwise read the shipped default on their own honesty instrument. */
    readonly prose: ProseOverrides;
    /** The B1 teaching knobs, resolved from the room's metadata over the host's per-user default — the preview
     *  runs the SAME resolution a turn runs, or the honesty instrument would under-report the choices teach. */
    readonly knobs: TeachingKnobs;
    /** The names a host prose OVERRIDE's `{{user}}`/`{{char}}` bind to — the same pair threaded to the rpg
     *  gather, so a teach resolved here is byte-identical to the one resolved there. */
    readonly identity: TeachingIdentity;
  },
): Promise<{
  /** The fields spread into `gatherAssembleContext` (the BUILD half). */
  readonly fields: {
    rpgMacros?: Readonly<Record<string, string>>;
    teachingInjections?: readonly ChatInjection[];
    rpgCelBindings?: Readonly<Record<string, unknown>>;
  };
  /** The M2 keep-last-X card window this room's game contributes (#1540) — NOT an assemble-ctx field: it is
   *  the WIRE knob the CONVERT step reads, and the preview's fit must price the same stubs the turn's does.
   *  ABSENT ≠ ZERO (`verbs/turn.ts::buildTurnContext` states the rule): only a game's gather contributes it,
   *  so a non-game chat previews with NO window, exactly as its turn converts with none. */
  readonly cardKeepLastX: number | undefined;
}> {
  const rpg =
    ctx.rpg === null
      ? null
      : await ctx.rpg.gatherTurnContext({
          chatId: args.chatId,
          funderUserId: args.funderUserId,
          pendingUserText: undefined,
          respondsToLatestUserTurn: false,
          steerIdentity: args.identity,
          prose: args.prose,
        });
  // The preview runs the SAME S2 collection a turn runs (`buildTurnContext`), for the same reason it runs the
  // gather at all: the host's honesty instrument must show every injection the model actually receives, not
  // just the ones chat happens to read itself. Empty collection ⇒ the field is omitted ⇒ byte-identical.
  const teaching = await collectTeaching(ctx.teaching, {
    chatId: args.chatId,
    runAsUserId: args.hostUserId,
    knobs: args.knobs,
    prose: args.prose,
    identity: args.identity,
    rpgGather: rpg,
  });
  return {
    fields: {
      ...(rpg === null ? {} : { rpgMacros: rpg.macros, ...(rpg.celBindings !== undefined ? { rpgCelBindings: rpg.celBindings } : {}) }),
      ...(teaching.injections.length > 0 ? { teachingInjections: teaching.injections } : {}),
    },
    cardKeepLastX: rpg?.cardKeepLastX,
  };
}

/** Build the assemble ctx for a preview from the resolved {@link PreviewInputs}. No persist, no turn. An
 *  optional `guided` steer mirrors a real turn's steered assembly. Threads the preview user-macro registry
 *  (WAVE MU) so a previewed prompt resolves user macros exactly as a real turn would (stable-prng posture) AND
 *  the game turn's rpg gather (see {@link previewRpgFields}) so a game chat previews its real state block.
 *
 *  The gathered ctx is then SHAPED for the primary speaker exactly as a turn's round is
 *  (`shapeContextForSpeaker`, `cardScope: "merged"` — the same assumption `shapeNextTurn` already makes for
 *  the wire history): without it the preview rendered ONLY the primary character's card, while the real turn
 *  merges every present roster member's — so a multi-character room's preview under-reported both its prompt
 *  and its context cost. Solo / hand-built ctxs return unchanged (the shape is a no-op there).
 *
 *  RETURNS THE GAME'S WIRE KNOB ALONGSIDE THE CTX (#1540): `cardKeepLastX` comes off the SAME gather the
 *  ctx does, and the CONVERT step every fit-consuming preview now runs needs it. It is not an assemble-ctx
 *  field (the ctx is the BUILD plane, this is the WIRE plane), so it rides out as its own value rather than
 *  being smuggled onto a shape it does not belong to. */
async function buildPreviewContext(
  ctx: ChatContext,
  inputs: PreviewInputs,
  chatId: ChatId,
  opts: { readonly deps: ReadDeps; readonly registry: MacroRegistry | null; readonly guided?: GuidedSteer | undefined },
): Promise<{ assembleContext: Awaited<ReturnType<typeof gatherAssembleContext>>; cardKeepLastX: number | undefined }> {
  const participants = await opts.deps.loadParticipantViews(chatId);
  // The host `steeringNote`'s identity binding, resolved CHAT-SIDE exactly as the turn path does: `{{user}}` =
  // the active persona; `{{char}}` = the Ruling-B joined present characters (a preview has no triggering speaker).
  const gather = await previewGatherFields(ctx, {
    chatId,
    hostUserId: inputs.hostUserId,
    funderUserId: inputs.funderUserId,
    identity: {
      user: inputs.foreign.personas.active?.name,
      char: participants
        .filter((p) => classifyParticipant(p)?.kind === "character")
        .map((p) => p.displayName)
        .join(", "),
    },
    prose: composeProse({ preset: inputs.foreign.promptConfig.prose }),
    // The SAME precedence a turn resolves (room value over the frozen host's per-user default) — a preview
    // that resolved a different posture would be an honesty instrument telling a different story.
    knobs: resolveTeachingKnobs(inputs.metadata, inputs.foreign.chatBehavior ?? DEFAULT_CHAT_BEHAVIOR),
  });
  const gathered = await gatherAssembleContext(
    ctx,
    {
      chatId,
      runAsUserId: inputs.hostUserId,
      model: inputs.model,
      characterIds: inputs.characterIds,
      personaIds: inputs.personaIds,
      // A preview is assembled AS the host, so the host is who `speakers.user` speaks for — SHAPE's
      // null-stamp guard needs that identity or the preview would floor the host's own unstamped rows
      // while the real turn borrows for them.
      triggerUserId: inputs.hostUserId,
      multiHuman: inputs.multiHuman,
      ...gather.fields,
      ...(opts.guided !== undefined ? { guided: opts.guided } : {}),
      // The preview render registry (WAVE MU) — absent ⇒ the pure build's singleton fallback (byte-identical).
      ...(opts.registry !== null ? { macroRegistry: opts.registry } : {}),
    },
    inputs.foreign,
  );
  const primary = gathered.speakerRefs?.[0];
  // The room's OWN output axis — the same one `shapeNextTurn` threads below and a real turn reads off
  // `TurnSpeakerShape.output`: a NARRATOR room previews its all-seated-characters shape (joined `{{char}}` + `[Character — …]`
  // framing), a per-speaker room renders the primary speaker's turn byte-identically to before. A preview has
  // no arbitrated round, so `cardScope` stays pinned `merged` (narrator is always merged; per-speaker's
  // scoped fold is a per-round selection a shapeless peek can't make) — only the output axis is now honest.
  return {
    assembleContext: primary === undefined ? gathered : shapeContextForSpeaker(gathered, { ref: primary, output: inputs.group.output, cardScope: "merged" }),
    cardKeepLastX: gather.cardKeepLastX,
  };
}

/** `listChats` — ONE KEYSET PAGE of the caller's chats (pure membership, host or member), newest
 *  CONVERSATION first, optionally projected to one character's seats.
 *
 *  THE ORDER IS THE DISPLAYED CLOCK (#150): `listMemberChats` sorts on `coalesce(newest message, updatedAt)`
 *  — the same value each row carries as `lastMessageAt ?? updatedAt` — so `items[0]` is the room you last
 *  spoke in, which is what every consumer means by "most recent": the home hero + its masthead sentence, the
 *  chats pane, and the agent bridge's `latest` sentinel. It used to sort on the raw row stamp, which a turn
 *  does not write and a metadata touch does.
 *
 *  The page size is CLAMPED, never trusted (`character.list`'s precedent): every row here costs
 *  `buildSummaries` five bulk reads plus a per-chat participant resolve, so an unclamped `limit` is a
 *  self-service load amplifier. `nextCursor` is minted only from a FULL page — a short page means the
 *  keyset has run out, and minting one anyway would hand the client a cursor that always returns nothing.
 *
 *  `totalCount` is a second, separate `COUNT` over the same scope rather than a derivation from `items`: the
 *  chats band and the character card both PRINT this number, and "how many rows this page happened to
 *  carry" is not that number. */
function createListChats(ctx: ChatContext, deps: ReadDeps): ChatService["listChats"] {
  return async ({ principal, includeArchived, characterId, search, beforeRecencyAt, limit, cursor }: ListChatsParams): Promise<ChatListPage> => {
    // Normalized ONCE, here: the predicate is a `lower(...) like` so the needle has to arrive lowercased,
    // and a whitespace-only query is the UNSEARCHED list, never a search for a space.
    const needle = search?.trim().toLowerCase() ?? "";
    const filter = {
      ...(includeArchived !== undefined ? { includeArchived } : {}),
      ...(characterId !== undefined ? { characterId } : {}),
      ...(needle === "" ? {} : { search: needle }),
      ...(beforeRecencyAt !== undefined ? { beforeRecencyAt } : {}),
    };
    const pageSize = Math.min(Math.max(limit ?? CHAT_LIST_DEFAULT_LIMIT, 1), CHAT_LIST_MAX_LIMIT);
    const rows = await listMemberChats(ctx.db, principal.userId, {
      ...filter,
      limit: pageSize,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    const totalCount = await countMemberChats(ctx.db, principal.userId, filter);
    const items = await buildSummaries(ctx.db, deps, rows, principal.userId);
    const last = rows.at(-1);
    // The cursor is the SORT key, never the row stamp: `recencyAt` is what `listMemberChats` ordered on.
    const nextCursor = rows.length === pageSize && last !== undefined ? { recencyAt: last.recencyAt, id: last.id } : null;
    return { items, nextCursor, totalCount };
  };
}

/** `listForks` — the fork children of a chat the caller is also a member of (a fork grants no parent
 *  membership, and vice versa; gated per child independently). */
function createListForks(ctx: ChatContext, deps: ReadDeps): ChatService["listForks"] {
  return async ({ principal, chatId }: ListForksParams): Promise<ChatSummary[]> => {
    await requireParticipant(ctx, principal, chatId);
    const children = await loadForkChildren(ctx.db, chatId);
    const visible = new Set(
      await gateLineagePerAncestor(
        ctx,
        principal,
        children.map((c) => c.id),
      ),
    );
    return await buildSummaries(
      ctx.db,
      deps,
      children.filter((c) => visible.has(c.id)),
      principal.userId,
    );
  };
}

/** `getChatLineage` — the fork ancestry chain, oldest-root first, membership-gated per ancestor
 *  independently (a hidden/not-a-member ancestor is omitted — the chain may be sparse). */
function createGetChatLineage(ctx: ChatContext, deps: ReadDeps): ChatService["getChatLineage"] {
  return async ({ principal, chatId }: GetChatLineageParams): Promise<ChatLineageView> => {
    await requireParticipant(ctx, principal, chatId);
    const chain = await loadAncestorChain(ctx.db, chatId); // self → … → root
    const visible = new Set(
      await gateLineagePerAncestor(
        ctx,
        principal,
        chain.map((r) => r.id),
      ),
    );
    const summaries = await buildSummaries(
      ctx.db,
      deps,
      chain.filter((r) => visible.has(r.id)),
      principal.userId,
    );
    // `buildSummaries` preserves the self→root input order; the view is oldest-root first.
    return { chain: summaries.reverse() };
  };
}

/** `getChat` — one chat resolved (row + present roster + effective room behavior). NOT_FOUND when missing
 *  or the caller is not a participant (leak-free). */
function createGetChat(ctx: ChatContext, deps: ReadDeps): ChatService["getChat"] {
  return async ({ principal, chatId }: GetChatParams): Promise<ChatDetail> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const participants = await deps.loadParticipantViews(chatId);
    const identities = await loadChatIdentityProducer(ctx.db, { participants });
    return toChatDetail({
      chat: membership.chat,
      participants,
      identities,
      viewerUserId: principal.userId,
      viewerHistoryFloorSeq: membership.historyFloorSeq,
    });
  };
}

/** The honest-refusal pre-send gate (#54): the deterministic serveability verdict for the room HOST's chat
 *  connection — the one every turn in this room runs on. Member-gated (any participant may read it — the composer disables SEND on it). A
 *  hostless room is a leak-free NOT_FOUND (as `resolvePreviewInputs`). Fires no turn/API call. */
function createCheckSendAvailability(ctx: ChatContext, deps: ReadDeps): ChatService["checkSendAvailability"] {
  return async ({ principal, chatId }: GetChatParams): Promise<SendAvailability> => {
    await requireParticipant(ctx, principal, chatId);
    const participants = await loadParticipants(ctx.db, chatId);
    const hostUserId = hostUserIdOf(participants);
    if (hostUserId === null) {
      throw new ChatNotFoundError(chatId);
    }
    return deps.checkSendAvailability({ funderUserId: hostUserId, chatId });
  };
}

/** The host-configured member-card level for a chat (D22): `chatMetadata.group.memberCardVisibility`, or the
 *  `DEFAULT_GROUP_CONFIG` floor (`sheet`) when the room carries no group blob. Read straight off the already-
 *  loaded membership row — no extra read. */
function configuredCardVisibility(chat: { readonly metadata: ChatMetadata }): MemberCardVisibility {
  return chat.metadata.group?.memberCardVisibility ?? DEFAULT_GROUP_CONFIG.memberCardVisibility;
}

/** Build the MINIMAL render context for the D22 card DISPLAY. The `AssembleCharacter` is built from the
 *  ALREADY-CLAMPED view, NEVER the full card — this is the clamp-bypass defense:
 *  `macroOptionsFor` binds this character's fields onto card-field MACROS (`{{charsysinfo}}` ← systemPrompt,
 *  `{{charposthistory}}` ← postHistoryInstructions, `{{description}}`/`{{personality}}`/`{{scenario}}`/
 *  `{{exampleMessages}}`), and those macros resolve UNCONDITIONALLY. If the render context carried the full
 *  card, a SURVIVING sheet-tier field like `description = "A rogue. {{charsysinfo}}"` would re-expand the exact
 *  systemPrompt bytes the clamp nulled — a below-`full` member reading a full-only field through a macro. By
 *  binding from the clamped view, every above-level field is already null here, so its macro renders EMPTY:
 *  the render context obeys the SAME level clamp as the fields, and no macro can re-introduce a clamped secret.
 *
 *  Bindings: `{{char}}` = the card name (the always-present floor); `{{user}}`/`{{persona}}` = the chat ANCHOR
 *  persona (the source the assemble binds for card-derived sections — `renderMemberField`/`char_description`
 *  use `ctx.pinnedPersona`). Deliberately NOT the full turn gather (`buildPreviewContext`): a card read renders
 *  card text against the anchor, it does not assemble a prompt, so it must not depend on a resolvable
 *  connection / memory recall / variable fold. `macroOptionsFor` reads only `character`/`pinnedPersona` off
 *  this — every other field is optional-safe. */
function cardRenderContext(clamped: MemberCardView, anchor: AssemblePersona | null): AssembleContext {
  const character: AssembleCharacter = {
    name: clamped.name,
    // A clamped-away field is null ⇒ its macro renders EMPTY (never the underlying secret). `description` is
    // `string` on AssembleCharacter, so a null (below `sheet`) collapses to "".
    description: clamped.description ?? "",
    personality: clamped.personality,
    scenario: clamped.scenario,
    exampleMessages: clamped.exampleMessages,
    // The FULL-only internals: null below `full` ⇒ `{{charsysinfo}}`/`{{charposthistory}}` render EMPTY.
    systemPrompt: clamped.systemPrompt,
    postHistoryInstructions: clamped.postHistoryInstructions,
    depthPrompt: null,
  };
  return {
    character,
    characters: [character],
    speaker: { kind: "single", character },
    pinnedPersona: anchor,
    activePersona: anchor,
    // Required on the ctx type, but the macro option mapper never reads it (card fields render off
    // `character`/`pinnedPersona` only) — the system default satisfies the type without a preset read.
    promptConfig: DEFAULT_PROMPT_CONFIG,
    recentMessages: [],
    variableValues: {},
  };
}

/** Render a surviving card field's display macros against the anchor context — `null` passes through
 *  unchanged (a clamped-away field), a non-null string resolves `{{char}}`/`{{user}}`/… so the wire never
 *  carries literal braces. This is a READ-ONLY DISPLAY, so macros RENDER (the owner's rule: raw only in
 *  type-as-you-type editors, and a member card is not an editor). */
function renderCardField(value: string | null, renderCtx: AssembleContext): string | null {
  return value === null ? value : renderMacros(value, renderCtx, renderCtx.pinnedPersona);
}

/** `getMemberCard` — read ONE roster character's card, field-clamped to the room's `memberCardVisibility`
 *  (D22 — Part III §11). The gate is TWO belts:
 *   1. `requireParticipant` (matrix `member-card`) — a non-participant (or a stranger's chatId) collapses to a
 *      leak-free `ChatNotFoundError` BEFORE any card bytes are loaded (the cross-tenant sweep's PROBED verdict).
 *   2. the `characterId` MUST be a PRESENT character seat of THIS chat — a not-in-roster / foreign id is the
 *      SAME leak-free NOT_FOUND (you cannot read an arbitrary character's card through a chat you happen to be
 *      in). Checked against the roster's present character seats, never against the character table directly.
 *
 *  The room host always resolves to `full` (`resolveCardVisibility`); every other present member sees the
 *  host-configured level. `clampMemberCard` NULLS every field above the effective level SERVER-SIDE (the
 *  prompt-steering internals — `systemPrompt`/`postHistoryInstructions` — and the character's rendered `lore`
 *  never cross the wire below `full`/`sheet+lore`). The surviving TEXT fields then render display macros
 *  against the ANCHOR persona (the same source the assemble resolves card fields against). CRITICALLY, the
 *  macro render context is built from the CLAMPED view (`cardRenderContext(clamped, …)`), NOT the full card:
 *  card-field macros (`{{charsysinfo}}`/`{{charposthistory}}`/`{{description}}`/…) resolve unconditionally, so
 *  a full-card render context would let a surviving sheet-tier field re-expand a nulled full-only field. Binding
 *  from the clamped view makes every above-level macro render EMPTY — the "never below `full`" promise is
 *  ENFORCED by the render seam, not merely asserted. `lore` (world-info contents) and `tags` are already stored
 *  resolved — no macro pass. */
function createGetMemberCard(ctx: ChatContext, deps: ReadDeps): ChatService["getMemberCard"] {
  return async ({ principal, chatId, characterId }: GetMemberCardParams): Promise<MemberCardView> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    // Belt 2 + the host owner: resolve the room's present roster ONCE — the host (card owner for every load
    // below) and the present character seats (the roster-scope gate). A hostless room is unusable (leak-free).
    const participants = await loadParticipants(ctx.db, chatId);
    const hostUserId = hostUserIdOf(participants);
    const seated = participants.some((r) => {
      const actor = classifyParticipant(r);
      return actor?.kind === "character" && actor.characterId === characterId;
    });
    if (hostUserId === null || !seated) {
      throw new ChatNotFoundError(chatId);
    }
    // Load the card under the HOST's ownership (the seat's card belongs to the host, D18) — the caller-supplied
    // bits `clampMemberCard` needs. A gone/mid-delete card is a leak-free NOT_FOUND (nothing to project).
    const card = await ctx.getCard({ ownerId: hostUserId, characterId });
    if (card === null) {
      throw new ChatNotFoundError(chatId);
    }
    const visibility = resolveCardVisibility(membership.role, configuredCardVisibility(membership.chat));
    // Same enabled-axis narrowing as `resolvePreviewInputs` above — a member card render is also an honesty
    // instrument about who the room would actually resolve a persona for.
    const memberCardPresentHumanUserIds = await presentAndEnabledHumanUserIdsOf(ctx, participants);
    const [tags, lore, avatarHash, anchorPersona] = await Promise.all([
      ctx.resolveCharacterTags({ ownerId: hostUserId, characterId }),
      loadCharacterCardLore(ctx.db, { characterId, ownerId: hostUserId }),
      ctx.resolveAssetHash(card.avatarAssetId),
      resolveAnchorPersona(deps, {
        chatId,
        hostUserId,
        anchorPersonaId: membership.chat.anchorPersonaId,
        presentHumanUserIds: memberCardPresentHumanUserIds,
        humanSeats: humanSeatPersonasOf(participants, memberCardPresentHumanUserIds),
      }),
    ]);
    // PURE projection — fields above the effective level become null HERE, server-side (never sent over the
    // wire). `clampMemberCard` fabricates nothing: it gates the caller-resolved `tags`/`lore`/`avatarHash`.
    const clamped = clampMemberCard({ characterId, card, tags, lore, avatarHash, visibility });
    // Render display macros on the SURVIVING text fields against the anchor persona (a null field was clamped
    // away and passes through). Greetings render per-entry. `lore`/`tags` are stored resolved (no macro pass).
    // The render context is built from the CLAMPED view, NOT the full card (the clamp-bypass defense):
    // an above-level card-field macro (`{{charsysinfo}}`/`{{charposthistory}}`/…) inside a surviving field can
    // ONLY resolve to the clamped (empty) value, so no macro can smuggle a nulled secret back onto the wire.
    const renderCtx = cardRenderContext(clamped, anchorPersona);
    return {
      ...clamped,
      description: renderCardField(clamped.description, renderCtx),
      personality: renderCardField(clamped.personality, renderCtx),
      scenario: renderCardField(clamped.scenario, renderCtx),
      greetings: clamped.greetings === null ? null : clamped.greetings.map((g) => renderMacros(g, renderCtx, renderCtx.pinnedPersona)),
      exampleMessages: renderCardField(clamped.exampleMessages, renderCtx),
      creatorNotes: renderCardField(clamped.creatorNotes, renderCtx),
      systemPrompt: renderCardField(clamped.systemPrompt, renderCtx),
      postHistoryInstructions: renderCardField(clamped.postHistoryInstructions, renderCtx),
    };
  };
}

/** Resolve the chat ANCHOR persona to its `{name, description}` the way the assemble does — through the FOREIGN
 *  persona read (`ResolveForeignInputsOp`, the ONE sanctioned persona-resolution path chat holds). `model:""`
 *  is a stub: a card DISPLAY resolves personas, not a connection-specific preset, so the foreign resolver's
 *  model arg (which only tunes preset selection) is irrelevant here — no `resolveConnection` hop is needed.
 *  The roster is threaded in (not re-read) because the resolver's persona read is CONSENT-GATED on the room's
 *  present humans: without it a member-owned anchor would render as the kit floor on every card display. */
async function resolveAnchorPersona(
  deps: ReadDeps,
  args: {
    readonly chatId: ChatId;
    readonly hostUserId: UserId;
    readonly anchorPersonaId: PersonaId | null;
    readonly presentHumanUserIds: readonly UserId[];
    readonly humanSeats: readonly HumanSeatPersona[];
  },
): Promise<AssemblePersona | null> {
  const foreign = await deps.resolveForeignInputs({
    chatId: args.chatId,
    runAsUserId: args.hostUserId,
    model: "",
    anchorPersonaId: args.anchorPersonaId,
    presentHumanUserIds: args.presentHumanUserIds,
    humanSeats: args.humanSeats,
    // A card DISPLAY has no triggering human at all. Only `personas.anchor` is read here.
    trigger: { kind: "none" },
    voice: "anchor",
  });
  return foreign.personas.anchor;
}

// An unclamped `limit` is a DoS surface (an unbounded SQL `.limit()`), not an authz hole. The ceiling is the
// shared `CHAT_MESSAGE_LIST_MAX_LIMIT` (`@orb/contracts/chat`); the `Math.min` is the backstop for internal
// callers that bypass the transport `.max()` trust boundary.
const DEFAULT_LIMIT = 50;

/** `listMessages` — a paged canon read (each slot joined to its selected variant), chronological, + the
 *  page's identity producer (`MessagesPage.identities`, D137). The `excludedFromPrompt` flag rides each `MessageView`.
 *
 *  D16 join-history clamp: the window's floor is the CALLER's `historyFloorSeq` (stamped by the chokepoint) —
 *  a `from-join` member never receives a row below their own `joinSeq`. Pagination stays honest: a
 *  `beforeSeq` cursor at/below the floor simply matches nothing, so the caller gets an EMPTY page (the
 *  same terminal signal an exhausted backward walk gives), never a fabricated one. */
function createListMessages(ctx: ChatContext, deps: ReadDeps): ChatService["listMessages"] {
  return async ({ principal, chatId, beforeSeq, limit }: ListMessagesParams): Promise<MessagesPage> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const pageSize = Math.min(limit ?? DEFAULT_LIMIT, CHAT_MESSAGE_LIST_MAX_LIMIT);
    const page = await loadMessagesPage(ctx.db, chatId, { beforeSeq, limit: pageSize, floorSeq: membership.historyFloorSeq });
    // `loadMessagesPage` returns newest-first (the backward window); reverse for chronological display.
    // The §3.6 MEMBER-STRIP trust boundary: hidden-class spans never reach a NON-HOST viewer's payload
    // (a client-only hide would leak the truth bytes in the wire). The host reads unstripped — the reveal
    // eye / standing-lie inventory are host-plane reads over the full body. P3: on a DECEPTION-active game the
    // member also loses the reasoning channel (resolved once per read via the injected rpg op — `false` for a
    // non-game / non-deception chat, so no regression). The host bit is the PROJECTION class's
    // `viewerReadsHidden` (D110 — the DATA-PROJECTION class): a byte-selection verdict is homed ONCE, so this
    // page's strip can never drift from the bus replay's or the turn return's.
    const chronological = page.reverse();
    const readsHidden = viewerReadsHidden(membership);
    const reasoningHostOnly = readsHidden ? false : await resolveReasoningHostOnly(ctx, chatId);
    const messages = readsHidden ? chronological : chronological.map((v) => projectViewForMember(v, reasoningHostOnly));
    const participants = await deps.loadParticipantViews(chatId);
    const identities = await loadChatIdentityProducer(ctx.db, { participants, messages });
    return { messages, identities };
  };
}

/** `listMessageVariants` — the full sibling-variant set for one slot, ordered by idx, no content. A
 *  foreign-chat/unknown `messageId` collapses to a leak-free NOT_FOUND.
 *
 *  D16: the set is FLOORED at the caller's own `historyFloorSeq` (#1399). No content crosses here, but the
 *  ids and the swipe COUNT are exactly the identifiers the floored `listMessages` withholds — an unfloored
 *  read let a `from-join` member name any pre-join slot and learn its shape. The floor rides the persistence
 *  WHERE (`loadMessageVariantSummaries`) rather than a check here, so a below-floor slot is byte-identical to
 *  an absent one on this path and the next caller of that query inherits the belt. */
function createListMessageVariants(ctx: ChatContext): ChatService["listMessageVariants"] {
  return async ({ principal, chatId, messageId }: ListMessageVariantsParams): Promise<MessageVariantSummary[]> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const rows = await loadMessageVariantSummaries(ctx.db, chatId, messageId, membership.historyFloorSeq);
    if (rows.length === 0) {
      throw new ChatNotFoundError(chatId);
    }
    return rows;
  };
}

/** `listParticipants` — the resolved present roster (`ParticipantView[]`). */
function createListParticipants(ctx: ChatContext, deps: ReadDeps): ChatService["listParticipants"] {
  return async ({ principal, chatId }: ListParticipantsParams): Promise<ParticipantView[]> => {
    await requireParticipant(ctx, principal, chatId);
    return [...(await deps.loadParticipantViews(chatId))];
  };
}

/** SHAPE the NEXT turn's wire history off the current canon — the one preamble `previewAssembly`,
 *  `getShapeTrace` and `previewContextFit` share (no user input, no group nudge, primary speaker / merged):
 *  the same `toShapeCanon` → `shapeTurn` the pipeline runs, minus the per-speaker round machinery. Returns
 *  the loaded canon beside the shaped result (the fit's boundary resolution needs both). */
/** `listEffectiveRegex` — WHAT REGEX RUNS IN THIS ROOM, in run order, by tier (#1742,
 *  `docs/design/mocks/regex-section/DESIGN.md` §6). The room's Regex section is its only consumer.
 *
 *  HOST-ONLY under D19, and the gate is the shape of the answer, not a policy bolted onto it: the union
 *  resolves under the host's frozen `runAsUserId`, so three of its four tiers ARE the host's library
 *  (global / their preset / the seated cards they own). A member has no parameter on any of them and must
 *  not learn what the host owns — they read the room's own tier through `regex.listForChat` (member-gated,
 *  room-public) instead.
 *
 *  IT RESOLVES THROUGH `resolvePreviewInputs`, deliberately: the section is an HONESTY INSTRUMENT in exactly
 *  the sense the previews are. The tier list must name the preset the TURN would assemble (including the rpg
 *  GM redirect) and the characters the TURN would seat, or a host bisecting a weird room would be switching
 *  levers on a set the next reply does not use. Sharing the preamble is what makes that structural.
 *
 *  The pure resolver answers both halves at once (`substrate/regex-tier::resolveRegexTiers`) — the same
 *  function the turn's union comes out of — so the section and the wire can never disagree about run order. */
function createListEffectiveRegex(ctx: ChatContext, deps: ReadDeps): ChatService["listEffectiveRegex"] {
  return async ({ principal, chatId }: ListEffectiveRegexParams): Promise<EffectiveRegexView> => {
    const { chat } = await requireHost(ctx, principal, chatId);
    const inputs = await resolvePreviewInputs(ctx, deps, chatId, { anchorPersonaId: chat.anchorPersonaId });
    return resolveRegexTiers(
      {
        ...(await ctx.resolveRegexSources({
          ownerId: inputs.hostUserId,
          presetId: inputs.foreign.presetId ?? null,
          characterIds: inputs.characterIds,
          chatId,
        })),
        allow: regexAllowOf(inputs.metadata),
      },
      // THE PRESET TIER'S NAME (#1754) comes off the SAME resolution the sources' `presetId` does, which is
      // the preview preamble's — the GM redirect included. Naming it here rather than client-side is the
      // whole point: the section's only other route to a preset name is the viewer's own active preset,
      // which on a game chat is not the preset this room assembles.
      { preset: inputs.foreign.presetName ?? null },
    );
  };
}

/** The EPHEMERAL `PROMPT_HISTORY` leg's env for a PREVIEW build — the same seams a real turn supplies
 *  (`engine/pipeline::promptHistoryEnv`), so what the host reads in `previewAssembly`/`getShapeTrace`/
 *  `previewContextFit` is what the wire would carry. A preview that skipped the leg would show the host a
 *  history the model will never see, which is precisely the lie these reads exist to prevent. `null` when
 *  the host tier resolved no scripts (byte-identical, zero cost). */
function previewPromptHistoryEnv(ctx: ChatContext, assembleContext: AssembleContext, inputs: PreviewInputs): PromptHistoryRegexEnv | null {
  const scripts = assembleContext.hostTierRegexScripts ?? [];
  if (scripts.length === 0) {
    return null;
  }
  return {
    scripts,
    macroCtx: buildTurnMacroContext({ assembleCtx: assembleContext, model: inputs.model, chatId: inputs.chatId }),
    applyReplace: ctx.applyRegexReplace,
    onScriptFailure: (err, script) =>
      getLog().warn(
        { err, placement: "PROMPT_HISTORY", findRegex: script.findRegex },
        "chat: prompt-history regex script failed in a preview build (D53 watchdog)",
      ),
  };
}

/** Who speaks in a preview: the primary, as {@link buildPreviewContext} shaped the layout for it. */
function previewVoice(layout: AssembleContext, output: PreviewInputs["group"]["output"]): AssembleContext {
  const primary = layout.speakerRefs?.[0];
  return primary === undefined ? layout : voiceContextForSpeaker(layout, { ref: primary, output, cardScope: "merged" });
}

async function shapeNextTurn(
  ctx: ChatContext,
  args: {
    readonly chatId: ChatId;
    readonly inputs: PreviewInputs;
    readonly assembleContext: Awaited<ReturnType<typeof gatherAssembleContext>>;
    readonly assembled: AssembledPrompt;
  },
): Promise<{ canon: readonly MessageView[]; shaped: ReturnType<typeof shapeTurn> }> {
  const { chatId, inputs, assembleContext, assembled } = args;
  // The per-chat macro name producer over the full canon — resolves each history row's own macro stamps
  // (client-display parity), exactly as the engine builds it for a real turn.
  // @orb-waive chat-viewer-plane-canon-reads(loadCanonHistory): the fit preview returns NUMBERS + one boundary id, never canon bytes: the canon is token-counted and discarded. The fit budget is deliberately room-wide (one shared window), and the boundary id is the ratified id plane.
  const canon = await loadCanonHistory(ctx.db, chatId);
  const historyMacroNames: HistoryMacroNames = buildIdentityNameContext(await loadChatIdentityProducer(ctx.db, { messages: canon }));
  const inChatInjections: ChatInjection[] = [...(assembleContext.chatInjections ?? []).filter((i) => i.position === "in_chat"), ...assembled.afterHistory];
  const turns = inputs.capability?.turns;
  const shaped = shapeTurn({
    canon: assembled.sendHistory ? toShapeCanon(canon, assembleContext, historyMacroNames, previewPromptHistoryEnv(ctx, assembleContext, inputs)) : [],
    appendUserTurn: null,
    injections: inChatInjections,
    // The room's own output axis (see `buildPreviewContext`) — a narrator preview shapes its history as the
    // narrator turn will. `cardScope`/`scopedTargetId` stay pinned (merged / no fold): narrator is always merged,
    // and a shapeless peek makes no per-speaker scoped selection, so per-speaker rooms stay byte-identical.
    output: inputs.group.output,
    cardScope: "merged",
    scopedTargetId: null,
    namesBehavior: assembleContext.promptConfig.namesBehavior ?? DEFAULT_NAMES_BEHAVIOR,
    speakers: { user: assembleContext.activePersona?.name ?? DEFAULT_PERSONA_NAME, assistant: assembleContext.character.name },
    multiHuman: assembleContext.multiHuman === true,
    // The preview voices the primary's turn, with the cue a turn carries when its system block names no speaker.
    groupNudge: speakerCue(assembleContext, previewVoice(assembleContext, inputs.group.output)),
    assistantPrefill: turns?.assistantPrefill === true,
    convertsToEmptyWireRow,
    // The same two system-row facts the turn reads. The preview must show the SAME delivery the wire carries —
    // this read is what a host debugs the prompt with, so a divergence would make the trace lie about the role
    // sequence and the fold reasons.
    midConversationSystem: turns?.midConversationSystem === true,
    historySystemRows: turns?.historySystemRows === true,
    roleHandling: assembleContext.promptConfig.params.advanced?.roleHandling,
    roleHandlingFloor: turns?.roleHandlingFloor,
    explicitCacheMarkers: inputs.explicitCacheMarkers,
    squashSystemMessages: assembleContext.promptConfig.params.advanced?.squashSystemMessages,
    prose: assembleContext.prose,
  });
  return { canon, shaped };
}

/** Run the SAME CONVERT → FIT pair the engine's turn pipeline runs over an already-shaped history: the budget
 *  is the model window soft-capped by the preset's `maxContextTokens`, reserving the materialized output
 *  budget + the assembled system tokens. One home for the preview reads that need a boundary/ceiling.
 *
 *  CONVERT PRECEDES FIT HERE TOO (#1540 — the read-side half of #1434). The fitter prices WIRE TEXT, and the
 *  conversion is lossy on purpose: a stored `:::card` body collapses to `[card: Title]`, a choices block
 *  drops entirely, a display-only image becomes a short marker. Pricing the RAW shaped rows — which is what
 *  this did — charged the preview for multi-KB bodies the provider never receives, so on a card-heavy or
 *  choices-heavy chat `previewContextFit` reported rows as out of context that the very next turn keeps, and
 *  the transcript divider drew its line in the wrong place. Both halves now come from the ONE
 *  `substrate/wire-history` module the pipeline calls, so the preview's fit input IS the turn's fit input.
 *
 *  ASYNC because the conversion resolves user-attachment media (`resolveImageUrl`) — the same per-row cost
 *  the turn pays, and zero I/O on a history with no attachment. */
async function fitShapedHistory(args: {
  readonly assembleContext: Awaited<ReturnType<typeof gatherAssembleContext>>;
  readonly assembled: AssembledPrompt;
  readonly capability: GenerationCapability | undefined;
  readonly shaped: ReturnType<typeof shapeTurn>;
  /** The CONVERT env — the previews' twin of the turn's (`runTurnPipeline`), resolved under the HOST because
   *  every preview already is (`resolvePreviewInputs`: connection, preset, `{{user}}`). */
  readonly convert: {
    /** The room's frozen host — the owner scope the attachment resolve runs under. */
    readonly hostUserId: UserId;
    readonly chatId: ChatId;
    /** The rpg gather's keep-last-X card window; `undefined` on a non-game chat ⇒ no window (ABSENT ≠ ZERO). */
    readonly cardKeepLastX: number | undefined;
    /** The loaded canon — read only for the assistant-authored set the attachment rule needs. */
    readonly canon: readonly MessageView[];
  };
  readonly ctx: ChatContext;
}): Promise<{ fitted: ReturnType<typeof fitHistory>; budget: ReturnType<typeof buildHistoryBudget> }> {
  const params = args.assembleContext.promptConfig.params;
  const systemTokens = estimateTokens([args.assembled.static, args.assembled.dynamic].join("\n\n"));
  const budget = buildHistoryBudget({
    windowTokens: args.capability?.context.window ?? Number.POSITIVE_INFINITY,
    maxContextTokens: params.maxContextTokens,
    maxOutputTokens: params.maxOutputTokens,
    systemTokens,
  });
  const converted = await buildWireHistory(
    {
      visionOk: args.capability !== undefined && acceptsImageInput(args.capability),
      videoOk: args.capability !== undefined && acceptsVideoInput(args.capability),
      resolveImageUrl: (ref) => args.ctx.resolveImageUrl({ ownerId: args.convert.hostUserId, chatId: args.convert.chatId, ref }),
      cardKeepLastX: args.convert.cardKeepLastX,
      canon: args.convert.canon,
      // §8.8: the preview prices the SAME rows the next turn sends, so it resolves the carry rung the way
      // the turn will (`resolveCarryReasoning`, the one policy home) and reads the replay material only on
      // the `conversation` rung. A capability-less preview (no resolved connection) cannot know the rung and
      // takes the `off` floor rather than a guess that over-prices the window. Warnings are the TURN's to
      // raise, so the sink is a throwaway here.
      reasoningByMessage:
        args.capability !== undefined && resolveCarryReasoning(params, args.capability, []) === "conversation"
          ? await loadCanonReasoningParts(args.ctx.db, args.convert.chatId)
          : new Map<MessageId, readonly ChatReasoningPart[]>(),
      // §6.7: the SAME fence input the turn passes, from the SAME query — a preview that priced an
      // assistant-row picture differently from the turn would put the transcript divider in the wrong place
      // on exactly the chats this feature creates. LAZY: untouched on a history with no model-emitted image.
      loadInlineReplyAssetIds: () => loadInlineReplyAssetIds(args.ctx.db, args.convert.chatId),
    },
    args.shaped.history,
  );
  return { fitted: fitWireHistory(converted, budget, args.shaped.newChatMarker).fitted, budget };
}

/** Is the fit's ceiling a GUESS rather than the connected model's real window? True only when the capability's
 *  window is itself marked estimated (`context.windowEstimated` — an OR catalog that couldn't be fetched, a
 *  BYO endpoint with no declared window) AND that guessed window is what actually BINDS: a preset
 *  `maxContextTokens` at or below it is the user's own declared cap, which is real truth and wins the `min()`,
 *  so the ceiling is honest even though the model's window isn't known. */
function ceilingIsEstimated(capability: GenerationCapability | undefined, maxContextTokens: number | undefined): boolean {
  if (capability?.context.windowEstimated !== true) {
    return false;
  }
  return maxContextTokens === undefined || maxContextTokens > capability.context.window;
}

/** The `history` row of the budget breakdown, derived from the FIT result. Counts ONLY the id-bearing kept
 *  rows — the canon turns. The id-less rows in the fitted history are the spliced injections, which are each
 *  accounted under their OWN source (steering / world-info / game-state), so the six rows stay disjoint and
 *  `Σ tokens` never double-counts an injection. (A squash that merged an injection INTO an adjacent canon row
 *  leaves those bytes on both sides of that split — the local estimate is advisory, never billing truth.)
 *
 *  `rows` is the same set, one entry per kept turn — the history PIVOT's materialized rows in the preset
 *  editor's bound readout (D121-G). Labelled by the wire row's own SPEAKER NAME where it carries one (the
 *  `completion` names behavior stamps it), else its role: the row's identity is what ST's panel shows, and
 *  the role is the fact every wire carries. Content-free — cost only. */
function historyBudgetRow(fitted: ReturnType<typeof fitHistory>): HistoryBudgetInput {
  const canonRows = fitted.history.filter((row) => row.messageId !== undefined);
  return {
    usedTokens: canonRows.reduce((sum, row) => sum + estimateTokens(row.content), 0),
    keptCount: canonRows.length,
    droppedCount: fitted.droppedCount,
    rows: canonRows.map((row) => ({ label: row.name ?? row.role, tokens: estimateTokens(row.content) })),
  };
}

/** `previewAssembly` — the BUILD product + the debug trace + the per-source CONTEXT BUDGET for a hypothetical
 *  turn. HOST/ADMIN (`requireHost`, matrix `previewAssembly: "host"`): the assembled prompt merges every roster
 *  member's card at FULL fidelity — exposing it to a plain member would bypass the D22 `memberCardVisibility`
 *  clamp (a member reading another member's private card fields). A `guided` steer is routed through the same
 *  gather→build a real turn uses.
 *
 *  The BUDGET is the Preview tab's stacked bar (D-4): the BUILD walk's slices grouped by `AssemblySource`, plus
 *  the `history` row from the SAME shape→fit the next real turn runs — so the panel's numbers and the wire's
 *  numbers are the same numbers, which is the entire point of a host honesty instrument. It ALSO carries the
 *  same bytes partitioned by PROMPT SECTION (`budget.sections`, D121-G) — the preset editor's bound Prompt
 *  readout prices its rack rows off that projection while this tab reads `sources`: one read, two projections.
 *
 *  THE OVERRIDE (`presetOverride`): the preset editor inspects a preset the room has NOT adopted, so the read
 *  assembles this room as if that preset were active — the same `ResolveForeignInputsOp.presetOverride` seam
 *  `previewActionTemplates` rides, with the same safety (compose resolves it owned-or-system UNDER THE HOST and
 *  degrades to the host's own default on a stale/unowned id). Absent ⇒ byte-identical to every prior preview. */
function createPreviewAssembly(ctx: ChatContext, deps: ReadDeps): ChatService["previewAssembly"] {
  return async ({ principal, chatId, speakerCharacterId, guided, presetOverride }: PreviewAssemblyParams): Promise<AssemblyPreview> => {
    const membership = await requireHost(ctx, principal, chatId);
    const inputs = await resolvePreviewInputs(ctx, deps, chatId, {
      anchorPersonaId: membership.chat.anchorPersonaId,
      speakerCharacterId,
      ...(presetOverride === undefined ? {} : { presetOverride }),
    });
    const registry = buildPreviewRegistry(inputs);
    const { assembleContext, cardKeepLastX } = await buildPreviewContext(ctx, inputs, chatId, { deps, registry, guided });
    const { prompt, slices } = buildPromptWithSlices(inputs.foreign.promptConfig, assembleContext, registry ?? undefined);
    const { canon, shaped } = await shapeNextTurn(ctx, { chatId, inputs, assembleContext, assembled: prompt });
    const { fitted } = await fitShapedHistory({
      assembleContext,
      assembled: prompt,
      capability: inputs.capability,
      shaped,
      convert: { hostUserId: inputs.hostUserId, chatId, cardKeepLastX, canon },
      ctx,
    });
    const budget = buildAssemblyBudget({
      slices,
      // The RACK the readout draws — the RESOLVED config (the override's, when one was passed), never the
      // caller's idea of it: the section ids the costs key on must be the ids this build actually walked.
      sections: inputs.foreign.promptConfig.sections,
      history: historyBudgetRow(fitted),
      // `null` ⇒ no trustworthy ceiling (no window + no soft cap) ⇒ `0`, the wire's "unbounded" (the bar then
      // renders proportions with no ratio) — never a fabricated number.
      ceilingTokens: fitted.ceilingTokens ?? 0,
      ceilingEstimated: ceilingIsEstimated(inputs.capability, assembleContext.promptConfig.params.maxContextTokens),
    });
    // Route through the host-audience redaction seam (chat-crew-design/04 §2, CREW-6). The verdict is DERIVED
    // from the membership `requireHost` already loaded (no second read) — provably `true` today, but if this
    // gate is ever relaxed to `requireParticipant` the elision inherits automatically (the structural belt: a
    // host-ring `audience:"host"` injection can never leak through a snapshot-serving projection).
    return { prompt, trace: prompt.trace, budget };
  };
}

/** `peekPrompt` — the assembled prompt for the NEXT real turn (no generation). The BUILD product only.
 *  HOST/ADMIN (`requireHost`, matrix `peekPrompt: "host"`): the full next-turn prompt reveals merged member
 *  cards at FULL — host/admin only, same D22 rationale as `previewAssembly`. */
function createPeekPrompt(ctx: ChatContext, deps: ReadDeps): ChatService["peekPrompt"] {
  return async ({ principal, chatId, speakerCharacterId }: PeekPromptParams): Promise<AssembledPrompt> => {
    const membership = await requireHost(ctx, principal, chatId);
    const inputs = await resolvePreviewInputs(ctx, deps, chatId, {
      anchorPersonaId: membership.chat.anchorPersonaId,
      speakerCharacterId,
    });
    const registry = buildPreviewRegistry(inputs);
    const { assembleContext } = await buildPreviewContext(ctx, inputs, chatId, { deps, registry });
    // Route peekPrompt through the ONE host-audience helper (chat-crew-design/04 §2, CREW-6) with the verdict
    // DERIVED from the loaded membership (no second read; provably host today, leak-free if the gate relaxes).
    return buildPrompt(inputs.foreign.promptConfig, assembleContext, registry ?? undefined);
  };
}

/** `getShapeTrace` — the content-free SHAPE trace for the next-turn shaping of the current canon (PD-132).
 *  HOST/ADMIN (`requireHost`): the SHAPE-phase debug surface, gate-classified `host` in the auth matrix.
 *  Re-runs SHAPE on demand (the same `buildPrompt` → `toShapeCanon` → `shapeTurn` a real turn's peek uses),
 *  then projects the stage snapshots + the resolved breakpoint offset onto the content-free `ShapeTrace` —
 *  no content bytes by construction, nothing persists (mirrors `peekPrompt`'s dry-run frame). */
function createGetShapeTrace(ctx: ChatContext, deps: ReadDeps): ChatService["getShapeTrace"] {
  return async ({ principal, chatId, speakerCharacterId }: GetShapeTraceParams): Promise<ShapeTrace> => {
    const membership = await requireHost(ctx, principal, chatId);
    const inputs = await resolvePreviewInputs(ctx, deps, chatId, {
      anchorPersonaId: membership.chat.anchorPersonaId,
      speakerCharacterId,
    });
    const registry = buildPreviewRegistry(inputs);
    const { assembleContext } = await buildPreviewContext(ctx, inputs, chatId, { deps, registry });
    const assembled = buildPrompt(inputs.foreign.promptConfig, assembleContext, registry ?? undefined);
    // SHAPE the next-turn peek — the trace describes how the CURRENT canon shapes for the next turn.
    const { shaped } = await shapeNextTurn(ctx, { chatId, inputs, assembleContext, assembled });
    return buildShapeTrace(shaped.stages, shaped.cacheBreakpointFromEnd, shaped.breakpointDecision);
  };
}

/**
 * `getVariantWire` — the per-variant WIRE RECORD: what ONE PAST generation actually sent, read straight off
 * `message_variants` (`promptSnapshot`/`params`/`macroDraws`). The RETROSPECTIVE member of the preview family:
 * `peekPrompt` renders the next turn, this replays a committed one. Nothing re-renders and nothing persists —
 * a pure read of bytes the engine already stamped, so the answer is byte-faithful to what the model saw
 * (a re-render against today's preset/roster would be a different prompt wearing a past turn's name).
 *
 * HOST/ADMIN (`requireHost`, matrix `getVariantWire: "host"`) — the SAME D22/§3.6/D16 rationale that gates
 * `previewAssembly`/`peekPrompt`/`previewSection`, applied to a STORED prompt: the snapshot carries the
 * roster's cards at FULL fidelity, the hidden-class spans the member strip removes (the wire projection rides
 * them verbatim), and the whole assembled history — including slots below a clamped member's D16 floor.
 * Reading a PAST prompt must not be the cheap way around the three host-gated doors (the same hole
 * `previewSection` is closed for).
 *
 * TENANCY: `loadVariantWire` scopes the variant through its `messages.chatId` join, so a variant belonging to
 * ANOTHER chat is unreachable even for a caller who legitimately hosts the chatId they passed — it collapses
 * to the same leak-free {@link ChatNotFoundError} an unknown id gives (never "wrong chat", which would confirm
 * the variant exists). PROBED in the cross-tenant sweep.
 */
function createGetVariantWire(ctx: ChatContext): ChatService["getVariantWire"] {
  return async ({ principal, chatId, variantId }: GetVariantWireParams): Promise<VariantWireView> => {
    await requireHost(ctx, principal, chatId);
    const wire = await loadVariantWire(ctx.db, chatId, variantId);
    if (wire === undefined) {
      throw new ChatNotFoundError(chatId);
    }
    return wire;
  };
}

/** `previewContextFit` — the PRESENT-TENSE fit budget for the current canon against the host's effective
 *  preset + resolved capability (PD-#7). MEMBER-gated (`requireParticipant`): unlike `getShapeTrace` it
 *  returns no per-stage row counts (no merged-card leak) — only the boundary id + budget numbers the
 *  transcript divider renders. Reuses the SAME `resolvePreviewInputs` → `buildPrompt` → `toShapeCanon` →
 *  `shapeTurn` preamble the SHAPE trace uses, then runs the SAME `fitHistory` over the SAME budget
 *  (`buildHistoryBudget` off `promptConfig.params`, `systemTokens` = the same estimator sum the engine
 *  pipeline computes) — so `boundaryMessageId` equals the `contextBoundaryMessageId` the next real turn
 *  stamps on canon. Nothing persists. */
/** Resolve the `ContextFitPreview` — now UNIFORM across the API axis, because covered turns are EXCLUDED from the
 *  shaped history at the domain assembly seam (toShapeCanon), so the fit runs over the POST-MARKER window on every
 *  source. The divider's edge is TRUE to the wire on both paths:
 *   • a summary covers the span → the boundary is the earliest row still in the prompt above the coverage point:
 *     the deeper of (the first row past coveragePoint) and (the fit boundary, when a tiny window trims further).
 *     The marker stands in for everything at/below it, so the memory fact shows.
 *   • no summary → the plain fit boundary (byte-identical to the `contextBoundaryMessageId` the next turn stamps).
 *  The summary is member-safe (built from prompt-eligible rows only), so `requireParticipant` is the correct gate. */
function resolveContextFitPreview(env: {
  readonly fitted: ReturnType<typeof fitHistory>;
  readonly budget: ReturnType<typeof buildHistoryBudget>;
  readonly canon: readonly MessageView[];
  readonly compactSummary: string | null;
  readonly coveragePoint: number;
  /** The connected model's window was a guess, so the divider's "N of M used" must say so (same verdict the
   *  Preview tab's budget carries — one rule, both surfaces). */
  readonly ceilingEstimated: boolean;
}): ContextFitPreview {
  const { fitted, canon, compactSummary, coveragePoint } = env;
  const hasSummary = compactSummary !== null && compactSummary.length > 0;
  const common = {
    usedTokens: fitted.usedTokens,
    ceilingTokens: fitted.ceilingTokens ?? 0,
    ceilingEstimated: env.ceilingEstimated,
    reserveOutputTokens: env.budget.reserveOutputTokens,
    droppedCount: fitted.droppedCount,
  };
  if (!hasSummary) {
    return { ...common, boundaryMessageId: fitted.earliestKeptMessageId, compactSummary: null };
  }
  // A covering marker exists: the boundary is the earliest row STILL in the prompt above the coverage point.
  // The fit boundary (when a small window trimmed post-marker rows) is deeper and wins; otherwise the first row
  // just above the coverage point (the agent-sdk / full-window norm, where the fit dropped nothing).
  const firstAboveCoverage = canon.find((m) => m.seq > coveragePoint)?.id ?? null;
  const boundaryMessageId = fitted.earliestKeptMessageId ?? firstAboveCoverage;
  return { ...common, boundaryMessageId, compactSummary: boundaryMessageId !== null ? compactSummary : null };
}

function createPreviewContextFit(ctx: ChatContext, deps: ReadDeps): ChatService["previewContextFit"] {
  return async ({ principal, chatId, speakerCharacterId }: PreviewContextFitParams): Promise<ContextFitPreview> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const inputs = await resolvePreviewInputs(ctx, deps, chatId, {
      anchorPersonaId: membership.chat.anchorPersonaId,
      speakerCharacterId,
    });
    const registry = buildPreviewRegistry(inputs);
    const { assembleContext, cardKeepLastX } = await buildPreviewContext(ctx, inputs, chatId, { deps, registry });
    const assembled = buildPrompt(inputs.foreign.promptConfig, assembleContext, registry ?? undefined);
    const { canon, shaped } = await shapeNextTurn(ctx, { chatId, inputs, assembleContext, assembled });
    // CONVERT → FIT — the same pair, in the same order, over the same rows the engine's turn pipeline runs
    // (one home: `fitShapedHistory` → `substrate/wire-history`).
    const { fitted, budget } = await fitShapedHistory({
      assembleContext,
      assembled,
      capability: inputs.capability,
      shaped,
      convert: { hostUserId: inputs.hostUserId, chatId, cardKeepLastX, canon },
      ctx,
    });
    const chatRow = await loadChatRow(ctx.db, chatId);
    // D16: the checkpoint summary distills canon from seq 1, so a clamped caller never receives it — the
    // same verdict `toChatDetail` applies to the `ChatDetail` copy of these two fields. The fit NUMBERS stay
    // room-wide (they describe the next turn's budget, which is the host's prompt, not transcript content).
    const checkpointVisible = membership.historyFloorSeq <= NO_HISTORY_FLOOR;
    return resolveContextFitPreview({
      fitted,
      budget,
      canon,
      compactSummary: checkpointVisible ? (chatRow?.compactSummary ?? null) : null,
      coveragePoint: checkpointVisible ? (chatRow?.compactedAtSeq ?? 0) : 0,
      ceilingEstimated: ceilingIsEstimated(inputs.capability, assembleContext.promptConfig.params.maxContextTokens),
    });
  };
}

/** `getActivePresetConfig` — the resolved `PromptConfig` the chat assembles against. No assemble ctx is
 *  built (only the config is needed). */
function createGetActivePresetConfig(ctx: ChatContext, deps: ReadDeps): ChatService["getActivePresetConfig"] {
  return async ({ principal, chatId }: GetActivePresetConfigParams): Promise<PromptConfig> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const inputs = await resolvePreviewInputs(ctx, deps, chatId, {
      anchorPersonaId: membership.chat.anchorPersonaId,
    });
    return inputs.foreign.promptConfig;
  };
}

/** `previewSection` — render ONE preset section against the live assemble ctx (the COMPOSER/editor preview).
 *  HOST/ADMIN (`requireHost`, matrix `previewSection: "host"`): a rendered section carries the roster's cards
 *  at FULL (`main_prompt` ← systemPrompt, `char_description` ← the card text, `persona` ← another human's
 *  persona), so a member reading one bypasses the D22 clamp exactly as `previewAssembly`/`peekPrompt` would —
 *  see the file header. A member-facing section preview must project through the D22 tier first; it has no
 *  consumer today (the client's Preview tab is host-only, and this verb is not on the tRPC router at all).
 *  An unknown `sectionId` is a leak-free NOT_FOUND (the section, not the chat). */
function createPreviewSection(ctx: ChatContext, deps: ReadDeps): ChatService["previewSection"] {
  return async ({ principal, chatId, sectionId, speakerCharacterId }: PreviewSectionParams): Promise<SectionPreview> => {
    const membership = await requireHost(ctx, principal, chatId);
    const inputs = await resolvePreviewInputs(ctx, deps, chatId, {
      anchorPersonaId: membership.chat.anchorPersonaId,
      speakerCharacterId,
    });
    const section = inputs.foreign.promptConfig.sections.find((s) => s.id === sectionId);
    if (section === undefined) {
      throw new DomainNotFoundError("prompt_section", sectionId);
    }
    const registry = buildPreviewRegistry(inputs);
    const { assembleContext } = await buildPreviewContext(ctx, inputs, chatId, { deps, registry });
    return previewSection(section, assembleContext, inputs.foreign.promptConfig, registry ?? undefined);
  };
}

/** WHICH stored field a `TEMPLATE_DEFS` row edits, resolved to its EFFECTIVE bytes. The registry's id is
 *  `GuidedActionKind | FormatStringKey | ProseSlotId` and nothing else disambiguates them, so the split
 *  rides `GUIDED_ACTION_KINDS` + `isPresetProseSlotId` — the same derivations the client's row model uses,
 *  never a second list of names. Blank/absent falls back to the shipped default on every arm, which is the
 *  storage semantic everywhere in this schema ("empty means the default rides"). */
function isGuidedActionKind(id: TemplateDefId): id is GuidedActionKind {
  return (GUIDED_ACTION_KINDS as readonly string[]).includes(id);
}

function actionTemplateText(config: PromptConfig, id: TemplateDefId): string {
  if (isGuidedActionKind(id)) {
    return (config.guidedActions?.[id] ?? DEFAULT_GUIDED_ACTIONS[id]).prompt;
  }
  // The framing rows: stored in `promptConfig.prose`, resolved through the ONE PROSE-1 resolver
  // so the readout can never disagree with what `assembly` actually ships.
  if (isPresetProseSlotId(id)) {
    return resolveProseText(id, config.prose);
  }
  const stored = config.formatStrings?.[id] ?? "";
  return stored.trim() === "" ? DEFAULT_FORMAT_STRINGS[id] : stored;
}

/** `previewActionTemplates` (D8 / preset-surface-redesign §7.1) — every ACTION template of ONE preset,
 *  resolved against THIS chat, for the preset editor's BOUND readout.
 *
 *  HOST/ADMIN (`requireHost`, matrix `previewActionTemplates: "host"`): a rendered template resolves the
 *  roster's cards at FULL through its macros (`{{charsysinfo}}`/`{{description}}`/`{{persona}}`), the exact
 *  D22 bypass `previewSection` was re-gated for — the preview family is a host instrument.
 *
 *  THE OVERRIDE (`presetId`): the editor inspects a preset the chat has NOT adopted, so the read assembles
 *  this room as if that preset were active. It rides the landed `ResolveForeignInputsOp.presetOverride` seam
 *  rather than a new one, which also supplies the safety: compose resolves the id owned-or-system UNDER THE
 *  HOST and degrades to the host's own default on a stale/unowned id, so no override can read outside the
 *  host's library.
 *
 *  PLURAL BY DESIGN: the resolution is ~a dozen string renders over ONE already-built ctx, so answering for
 *  the whole registry makes the readout's row selection a pure client pick — one query per (chat, preset),
 *  one freshness row, no per-row round trip. Nothing persists (the `previewSection` dry-run frame). */
function createPreviewActionTemplates(ctx: ChatContext, deps: ReadDeps): ChatService["previewActionTemplates"] {
  return async ({ principal, chatId, presetId }: PreviewActionTemplatesParams): Promise<ActionTemplatesPreview> => {
    const membership = await requireHost(ctx, principal, chatId);
    const inputs = await resolvePreviewInputs(ctx, deps, chatId, {
      anchorPersonaId: membership.chat.anchorPersonaId,
      presetOverride: presetId,
    });
    const registry = buildPreviewRegistry(inputs);
    const { assembleContext } = await buildPreviewContext(ctx, inputs, chatId, { deps, registry });
    const config = inputs.foreign.promptConfig;
    return {
      // The bindings this render actually USED — read off the same resolved ctx, so the readout's gloss can
      // NAME the resolution ("`{{user}}` → Nate") instead of claiming one happened.
      identity: { user: assembleContext.activePersona?.name ?? DEFAULT_PERSONA_NAME, char: assembleContext.character.name },
      templates: TEMPLATE_DEFS.map((def) => ({
        id: def.id,
        resolved: previewActionText(assembleContext, actionTemplateText(config, def.id), {
          model: inputs.model,
          chatId,
          ...(registry !== null ? { registry } : {}),
        }),
      })),
    };
  };
}

/** `replayStreamEvents` — resume the resumable SSE token log from a cursor (late-subscriber ramp-up).
 *  D16-clamped: a stream row is raw transcript text, so a `from-join` caller only gets rows anchored to a
 *  slot at/above their `historyFloorSeq` (see `loadStreamReplay`). §3.6 member-scrub: the replayed `text`
 *  deltas carry the model's raw output (hidden spans included), so a NON-HOST caller's rows run through the
 *  per-slot stream scrubber — the durable twin of the live delta scrubber the transport applies. */
function createReplayStreamEvents(ctx: ChatContext): ChatService["replayStreamEvents"] {
  return async ({ principal, chatId, afterSeq }: ReplayStreamEventsParams): Promise<ChatStreamReplayEvent[]> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const rows = await loadStreamReplay(ctx.db, chatId, afterSeq, membership.historyFloorSeq);
    // P3 (§3.6): on a deception game a member's replayed REASONING token rows are dropped (host-only reasoning),
    // the durable twin of the live reasoning-delta drop. Resolved once here; `false` (no drop) for a host / a
    // non-deception chat. The host bit is the PROJECTION class's `viewerReadsHidden` — the same lens
    // `scrubStreamReplayForMember` applies one line below, so the two can never answer differently.
    const reasoningHostOnly = viewerReadsHidden(membership) ? false : await resolveReasoningHostOnly(ctx, chatId);
    return scrubStreamReplayForMember(rows, membership, reasoningHostOnly);
  };
}

/** `streamEventBounds` — the retained stream-log replay-cursor bounds (min/max seq; null/null when empty). */
function createStreamEventBounds(ctx: ChatContext): ChatService["streamEventBounds"] {
  return async ({ principal, chatId }: StreamEventBoundsParams): Promise<StreamEventBounds> => {
    await requireParticipant(ctx, principal, chatId);
    return await loadStreamBounds(ctx.db, chatId);
  };
}

/** `replayChatEvents` — resume the durable chat-bus log from a cursor (the log is append-only, so a
 *  resume is never truncated). Member-gated; the events are room-public by the bus payload allowlist.
 *
 *  D16 join-history clamp: "room-public" is scoped by the CALLER's floor, because the log carries canon
 *  CONTENT (`MessageView` payloads + raw `delta` text) — an unclamped resume from `lastEventId:"0"` replayed
 *  the whole pre-join transcript. The verdict is per-EVENT (`substrate/auth::isBelowHistoryFloor`), not a
 *  cursor clamp: `chat_events.seq` and `messages.seq` are different axes, and a POST-join edit of a PRE-join
 *  row rides a high event seq with a low view seq — a cursor floor alone would pass it straight through.
 *  A `delta` is decided the same per-row way (on the `slotSeq` its emit site stamped), NOT withheld wholesale:
 *  a replayed mid-turn token stream for a POST-join slot reaches a clamped member; one for a PRE-join slot (a
 *  host swiping an old row) does not. The LIVE half applies this identical verdict at the transport.
 *  Withheld rows leave a `seq` gap, which is correct: the cursor stays the durable `seq` the caller last saw,
 *  so a resume never re-offers a withheld row and never stalls. */
function createReplayChatEvents(ctx: ChatContext): ChatService["replayChatEvents"] {
  return async ({ principal, chatId, afterSeq }: ReplayChatEventsParams) => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const rows = await loadChatEventReplay(ctx.db, chatId, afterSeq);
    // The host verdict here SELECTS BYTES (verbatim replay vs the §3.6 member projection) — the DATA-PROJECTION
    // class, homed ONCE at `member-visibility::viewerReadsHidden` (D110 — chosen over the enforcement arm
    // precisely because a lens that may later diverge from operation
    // authority — a co-GM who commands the room but must not read deception truth — needs its own home).
    // Deliberately NOT `auth::permitsHost`: that is the ENFORCEMENT arm (it gates whether an operation may
    // proceed, e.g. the fork gate), and routing a byte-selection through it would thread a Principal + `can()`
    // into a pure projection for zero behavior change.
    const readsHidden = viewerReadsHidden(membership);
    // The D16 join-history floor drops pre-join rows FIRST (per-EVENT, on the payload's own anchor), for host
    // and member alike (a promoted host is floored at 0). The §3.6 member projection then runs STATEFULLY over
    // the survivors: `scrubChatEventReplayForMember` removes hidden-class `<lie>` spans from every replayed
    // `view` payload AND — the durable twin of the live transport's `resolveLiveYield` — scrubs raw `delta`
    // rows per-slot (a resume from `lastEventId:"0"` re-drains the mid-turn token stream, so an unscrubbed
    // durable replay would leak the model's hidden TEXT bytes the live path scrubs). On a deception game the
    // member also loses the whole reasoning channel: reasoning deltas + `reasoningStreamDone` dropped,
    // `view.reasoning` nulled. Host reads verbatim (identity).
    const floored = rows
      .filter(({ payload }) => !isBelowHistoryFloor(payload, membership.historyFloorSeq))
      .map(({ seq, payload }) => ({ seq, event: payload }));
    if (readsHidden) {
      return floored;
    }
    const reasoningHostOnly = await resolveReasoningHostOnly(ctx, chatId);
    return scrubChatEventReplayForMember(floored, membership, reasoningHostOnly);
  };
}

/** `chatEventBounds` — the durable bus-log cursor bounds + the caller's own D16 read floor. Also the SSE
 *  attach / per-yield membership gate: the chat room's pump calls this before each live yield so a
 *  kicked member's stream stops within the kick tx.
 *
 *  D16: it hands back `historyFloorSeq` because the LIVE fan-out needs the same floor the durable replay
 *  applies — the transport tails an in-process bus keyed by chatId ONLY, so without it a post-join emit
 *  carrying a PRE-join `MessageView` (the host editing/re-voicing an old row) reached a clamped member live
 *  even though the identical durable row was withheld on resume. Piggybacking the floor on the probe the
 *  generator already runs keeps that ONE member-gated read per yield (no extra I/O) and keeps the policy
 *  per-CALLER — the floor is resolved from the SUBSCRIBER's own participant row at the chokepoint, never
 *  from anything the client sends. */
function createChatEventBounds(ctx: ChatContext): ChatService["chatEventBounds"] {
  return async ({ principal, chatId }: ChatEventBoundsParams): Promise<ChatEventAttach> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    // `viewerIsHost` piggybacks on the same member-gated probe as the D16 floor (one read per yield): the
    // LIVE fan-out applies the §3.6 member-strip off it, exactly as the durable replay does per caller. P3:
    // `reasoningHostOnly` (the deception-active verdict) rides the same probe so the live fan-out withholds
    // the reasoning channel for a member of a deception game — resolved server-side, never client-supplied. A
    // host never has reasoning stripped, so the resolve is skipped on the host path (one fewer read per yield).
    // ONE bit, two consumers, one home: `viewerIsHost` is a PAYLOAD FIELD the transport threads as DATA (its
    // only consumer is the live fan-out's §3.6 strip — `ChatEventAttach.viewerIsHost`), and the local
    // `reasoningHostOnly` gate is the same byte-selection verdict. Both are the DATA-PROJECTION class, so both
    // read `member-visibility::viewerReadsHidden` — the identical lens `chat-detail.ts` composes for the
    // `ChatDetail.viewerIsHost` field and the durable replay applies to the rows (D110; the F1 ruling).
    const readsHidden = viewerReadsHidden(membership);
    const reasoningHostOnly = readsHidden ? false : await resolveReasoningHostOnly(ctx, chatId);
    return { ...(await loadChatEventBounds(ctx.db, chatId)), historyFloorSeq: membership.historyFloorSeq, viewerIsHost: readsHidden, reasoningHostOnly };
  };
}

/** The read-surface verb bundle. Pure reads (membership-gated; no mutation, no bus emit). `deps` carries
 *  the roster resolver + the connection/assemble resolvers the dry-run previews need. */

export function createRead(ctx: ChatContext, deps: ReadDeps): ReadVerbs {
  return {
    listChats: createListChats(ctx, deps),
    listForks: createListForks(ctx, deps),
    getChatLineage: createGetChatLineage(ctx, deps),
    getChat: createGetChat(ctx, deps),
    checkSendAvailability: createCheckSendAvailability(ctx, deps),
    getMemberCard: createGetMemberCard(ctx, deps),
    previewAssembly: createPreviewAssembly(ctx, deps),
    getActivePresetConfig: createGetActivePresetConfig(ctx, deps),
    previewSection: createPreviewSection(ctx, deps),
    previewActionTemplates: createPreviewActionTemplates(ctx, deps),
    peekPrompt: createPeekPrompt(ctx, deps),
    getShapeTrace: createGetShapeTrace(ctx, deps),
    getVariantWire: createGetVariantWire(ctx),
    previewContextFit: createPreviewContextFit(ctx, deps),
    listEffectiveRegex: createListEffectiveRegex(ctx, deps),
    listMessages: createListMessages(ctx, deps),
    listMessageVariants: createListMessageVariants(ctx),
    listParticipants: createListParticipants(ctx, deps),

    replayStreamEvents: createReplayStreamEvents(ctx),
    streamEventBounds: createStreamEventBounds(ctx),
    replayChatEvents: createReplayChatEvents(ctx),
    chatEventBounds: createChatEventBounds(ctx),
  };
}

// domain/chat/verbs/read — the chat read surface (listings, single-chat reads, dry-run prompt previews,
// resumable stream-ring reads). Pure reads: no canon mutation, no bus emit. Every chatId surface is
// membership-gated through the one `requireParticipant` chokepoint; listings are pure membership; the
// lineage/fork walks gate per-ancestor independently (a fork grants no parent membership).
//
// The dry-run previews (`previewAssembly`/`peekPrompt`/`previewSection`/`getActivePresetConfig`) build the
// assemble ctx + render through the `substrate/assembly-access` seam and return the BUILD product for
// inspection — no turn runs, nothing persists. The two FULL-PROMPT previews (`previewAssembly`/`peekPrompt`)
// gate at `requireHost` (matrix `host`): the assembled prompt merges every member's card at FULL, so a plain
// member reading it would bypass the D22 `memberCardVisibility` clamp — `previewSection`/`getActivePresetConfig`
// stay `member` (a single rendered section / the bare `PromptConfig` — no merged-card leak).
//
// Deps not on `ChatContext`: `loadParticipantViews` resolves the roster read-model; `resolveConnection`
// resolves the model the previews need; `resolveForeignInputs` is the foreign half of the assemble ctx.

import type { CharacterCard } from "@orb/contracts/character";
import type {
  AssembleCharacter,
  AssembleContext,
  AssemblePersona,
  ChatInjection,
  ChatMacroNameProducer,
  ContextFitPreview,
  MemberCardView,
  MemberCardVisibility,
  MessageView,
  ParticipantView,
} from "@orb/contracts/chat";
import { buildCharacterNameMap, buildPersonaNameMap, DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { MacroRegistry } from "@orb/kit/macro";
import { estimateTokens } from "@orb/kit/tokens";
import type { ChatContext } from "../context";
import { ChatNotFoundError } from "../contract/errors";
import type { ForeignInputs, ResolveForeignInputsOp } from "../contract/foreign";
import type { ChatMetadata } from "../contract/metadata";
import type {
  ChatEventBoundsParams,
  GetActivePresetConfigParams,
  GetChatLineageParams,
  GetChatParams,
  GetMemberCardParams,
  GetShapeTraceParams,
  GuidedSteer,
  ListChatsParams,
  ListForksParams,
  ListMessagesParams,
  ListMessageVariantsParams,
  ListParticipantsParams,
  PeekPromptParams,
  PreviewAssemblyParams,
  PreviewContextFitParams,
  PreviewSectionParams,
  ReplayChatEventsParams,
  ReplayStreamEventsParams,
  StreamEventBoundsParams,
} from "../contract/params";
import type { HistoryMacroNames } from "../contract/results";
import type { ChatService } from "../contract/service";
import type {
  AssembledPrompt,
  AssemblyPreview,
  ChatDetail,
  ChatEventAttach,
  ChatLineageView,
  ChatStreamReplayEvent,
  ChatSummary,
  MessagesPage,
  MessageVariantSummary,
  SectionPreview,
  ShapeTrace,
  StreamEventBounds,
} from "../contract/views";
import { gateLineagePerAncestor, requireHost, requireParticipant } from "../guard";
import { loadChatMacroNameProducer } from "../persistence/macro-names";
import {
  listMemberChats,
  loadAncestorChain,
  loadCanonHistory,
  loadChatEventBounds,
  loadChatEventReplay,
  loadChatMessageStats,
  loadChatParticipantCharacterIds,
  loadChatRow,
  loadForkChildren,
  loadMessagesPage,
  loadMessageVariantSummaries,
  loadStreamBounds,
  loadStreamReplay,
} from "../persistence/queries";
import { loadRoster } from "../persistence/roster";
import { loadCharacterAvatarProducer, loadPersonaAvatarProducer } from "../persistence/roster-avatars";
import { gatherAssembleContext } from "../substrate/assemble-gather";
import {
  buildHistoryBudget,
  buildPrompt,
  buildShapeTrace,
  buildTurnUserMacros,
  fitHistory,
  loadCharacterCardLore,
  previewSection,
  renderMacros,
  shapeTurn,
  toShapeCanon,
} from "../substrate/assembly-access";
import { clampMemberCard, isBelowHistoryFloor, NO_HISTORY_FLOOR, resolveCardVisibility } from "../substrate/auth";

import { toChatDetail } from "../substrate/chat-detail";
import { projectViewForMember, scrubChatEventReplayForMember, scrubStreamReplayForMember } from "../substrate/member-visibility";

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
  readonly resolveConnection: (args: { readonly runAsUserId: UserId; readonly chatId: ChatId }) => Promise<ResolvedConnection>;
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
  | "getMemberCard"
  | "previewAssembly"
  | "getActivePresetConfig"
  | "previewSection"
  | "peekPrompt"
  | "getShapeTrace"
  | "previewContextFit"
  | "listMessages"
  | "listMessageVariants"
  | "listParticipants"
  | "replayStreamEvents"
  | "replayChatEvents"
  | "chatEventBounds"
  | "streamEventBounds"
>;

type ChatRowView = Awaited<ReturnType<typeof listMemberChats>>[number];

/** The resolved preview substrate: the host, the resolved cast/personas, the connection `model`, and the
 *  cross-domain assemble inputs. The previews + `getActivePresetConfig` share this resolution. */
interface PreviewInputs {
  readonly hostUserId: UserId;
  readonly model: string;
  /** The resolved model capability — the SHAPE-trace peek reads its `turns` cell (roleHandlingFloor /
   *  assistantPrefill) to shape faithfully. Undefined when the connection resolver omits it (a test double). */
  readonly capability: ModelCapability | undefined;
  /** The resolved protocol axis — previewContextFit source-modes the divider boundary on it (agent-sdk → the
   *  marker coverage point; stateless → the fit boundary). */
  readonly api: ResolvedConnection["api"];
  readonly castCharacterIds: readonly CharacterId[];
  readonly personaIds: readonly PersonaId[];
  readonly foreign: ForeignInputs;
}

/** Map a loaded chat row + its canon stats + present roster + character-seat ids → the light `ChatSummary`
 *  list row. `participantNames` are display names only — the heavy roster is `getChat`. */
interface ChatSummaryInputs {
  readonly row: ChatRowView;
  readonly stat: { messageCount: number; lastMessageAt: number | null };
  readonly participants: readonly ParticipantView[];
  readonly participantCharacterIds: readonly CharacterId[];
  readonly viewerUserId: UserId;
}

function toChatSummary({ row, stat, participants, participantCharacterIds, viewerUserId }: ChatSummaryInputs): ChatSummary {
  return {
    id: row.id,
    title: row.title,
    star: row.star,
    archived: row.archived,
    parentChatId: row.parentChatId,
    lastMessageAt: stat.lastMessageAt,
    messageCount: stat.messageCount,
    participantNames: participants.map((p) => p.displayName),
    participantCharacterIds,
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

/** Resolve a set of chat rows → `ChatSummary[]` (the canon stats batched in one read; the names per chat).
 *  Shared by listChats / listForks / getChatLineage. */
async function buildSummaries(db: Db, deps: ReadDeps, rows: readonly ChatRowView[], viewerUserId: UserId): Promise<ChatSummary[]> {
  if (rows.length === 0) {
    return [];
  }
  const chatIds = rows.map((r) => r.id);
  const stats = await loadChatMessageStats(db, chatIds);
  const characterIdsByChat = await loadChatParticipantCharacterIds(db, chatIds);
  const enriched = await Promise.all(rows.map(async (row) => ({ row, names: await deps.loadParticipantViews(row.id) })));
  return enriched.map(({ row, names }) =>
    toChatSummary({
      row,
      stat: stats.get(row.id) ?? EMPTY_STATS,
      participants: names,
      participantCharacterIds: characterIdsByChat.get(row.id) ?? [],
      viewerUserId,
    }),
  );
}

/** Resolve the {@link PreviewInputs} for a chat: the present roster → host + cast + personas, then the
 *  connection (`model`) + the cross-domain assemble inputs. A hostless room is unusable (leak-free
 *  NOT_FOUND). The cast is reordered to put `speakerCharacterId` primary when supplied. */
async function resolvePreviewInputs(
  ctx: ChatContext,
  deps: ReadDeps,
  chatId: ChatId,
  opts: {
    readonly anchorPersonaId: PersonaId | null;
    readonly speakerCharacterId?: CharacterId | null | undefined;
  },
): Promise<PreviewInputs> {
  const { anchorPersonaId, speakerCharacterId } = opts;
  const roster = await loadRoster(ctx.db, chatId);
  const hostUserId = roster.find((r) => r.role === "host" && r.userId !== null)?.userId ?? null;
  if (hostUserId === null) {
    throw new ChatNotFoundError(chatId);
  }
  const castIds = roster.flatMap((r) => (r.kind === "character" && r.characterId !== null ? [r.characterId] : []));
  const castCharacterIds =
    speakerCharacterId !== null && speakerCharacterId !== undefined && castIds.includes(speakerCharacterId)
      ? [speakerCharacterId, ...castIds.filter((id) => id !== speakerCharacterId)]
      : castIds;
  const personaIds = roster.flatMap((r) => (r.kind === "human" && r.activePersonaId !== null ? [r.activePersonaId] : []));
  const connection = await deps.resolveConnection({ runAsUserId: hostUserId, chatId });
  const foreign = await deps.resolveForeignInputs({
    chatId,
    runAsUserId: hostUserId,
    model: connection.model,
    anchorPersonaId,
    personaIds,
  });
  return { hostUserId, model: connection.model, capability: connection.capability, api: connection.api, castCharacterIds, personaIds, foreign };
}

/** The per-preview user-macro RENDER registry (WAVE MU) — resolves the preset's user macros with a STABLE
 *  prng (`() => 0`), so a random-pick previews its FIRST-pool value and a re-poll never varies (the
 *  "preview never varies per poll" precedent — `gatherAssembleContext`'s absent-prng arm). Draws are
 *  discarded (a preview persists nothing). `null` ⇒ no user macros ⇒ the process singleton (byte-identical). */
function buildPreviewRegistry(inputs: PreviewInputs): MacroRegistry | null {
  const built = buildTurnUserMacros({
    defs: inputs.foreign.promptConfig.userMacros,
    sourceId: inputs.foreign.presetId ?? "default",
    values: {},
    prng: () => 0,
  });
  return built?.registry ?? null;
}

/** Build the assemble ctx for a preview from the resolved {@link PreviewInputs}. No persist, no turn. An
 *  optional `guided` steer mirrors a real turn's steered assembly. Threads the preview user-macro registry
 *  (WAVE MU) so a previewed prompt resolves user macros exactly as a real turn would (stable-prng posture). */
async function buildPreviewContext(
  ctx: ChatContext,
  inputs: PreviewInputs,
  chatId: ChatId,
  opts: { readonly registry: MacroRegistry | null; readonly guided?: GuidedSteer | undefined } = { registry: null },
): ReturnType<typeof gatherAssembleContext> {
  return await gatherAssembleContext(
    ctx,
    {
      chatId,
      runAsUserId: inputs.hostUserId,
      model: inputs.model,
      castCharacterIds: inputs.castCharacterIds,
      personaIds: inputs.personaIds,
      ...(opts.guided !== undefined ? { guided: opts.guided } : {}),
      // The preview render registry (WAVE MU) — absent ⇒ the pure build's singleton fallback (byte-identical).
      ...(opts.registry !== null ? { macroRegistry: opts.registry } : {}),
    },
    inputs.foreign,
  );
}

/** `listChats` — the caller's chats (pure membership, host or member), newest-updated first. */
function createListChats(ctx: ChatContext, deps: ReadDeps): ChatService["listChats"] {
  return async ({ principal, includeArchived }: ListChatsParams): Promise<ChatSummary[]> => {
    const rows = await listMemberChats(ctx.db, principal.userId, includeArchived ?? false);
    return await buildSummaries(ctx.db, deps, rows, principal.userId);
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
    const macroNames = await loadChatMacroNameProducer(ctx.db, { participants });
    const personaAvatars = await loadPersonaAvatarProducer(ctx.db, { participants });
    const characterAvatars = await loadCharacterAvatarProducer(ctx.db, { participants });
    return toChatDetail({
      chat: membership.chat,
      participants,
      macroNames,
      personaAvatars,
      characterAvatars,
      viewerUserId: principal.userId,
      viewerHistoryFloorSeq: membership.historyFloorSeq,
    });
  };
}

/** The host-configured member-card level for a chat (D22): `chatMetadata.group.memberCardVisibility`, or the
 *  `DEFAULT_GROUP_CONFIG` floor (`sheet`) when the room carries no group blob. Read straight off the already-
 *  loaded membership row — no extra read. */
function configuredCardVisibility(chat: { readonly metadata: ChatMetadata }): MemberCardVisibility {
  return chat.metadata.group?.memberCardVisibility ?? DEFAULT_GROUP_CONFIG.memberCardVisibility;
}

/** Build the MINIMAL render context for the D22 card DISPLAY — just the two macro bindings the card fields
 *  need: `{{char}}` = THIS card's name, `{{user}}`/`{{persona}}` = the chat ANCHOR persona (the source the
 *  assemble binds for card-derived sections — `renderMemberField`/`char_description` use `ctx.pinnedPersona`).
 *  This is deliberately NOT the full turn gather (`buildPreviewContext`): a card read renders card text against
 *  the anchor, it does not assemble a prompt, so it must not depend on a resolvable connection / memory recall /
 *  variable fold. The macro option mapper (`macroOptionsFor`) reads only `character`/`pinnedPersona` off this —
 *  every other field is optional-safe — so a bare ctx renders `{{char}}`/`{{user}}`/`{{persona}}` faithfully. */
function cardRenderContext(card: CharacterCard, anchor: AssemblePersona | null): AssembleContext {
  const character: AssembleCharacter = {
    name: card.name,
    description: card.description ?? "",
    personality: card.personality,
    scenario: card.scenario,
    exampleMessages: card.exampleMessages,
    systemPrompt: card.systemPrompt,
    postHistoryInstructions: card.postHistoryInstructions,
    depthPrompt: null,
  };
  return {
    character,
    cast: [character],
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
 *  against the ANCHOR persona (the same source the assemble resolves card fields against). `lore` (world-info
 *  contents) and `tags` are already stored resolved — no macro pass. */
function createGetMemberCard(ctx: ChatContext, deps: ReadDeps): ChatService["getMemberCard"] {
  return async ({ principal, chatId, characterId }: GetMemberCardParams): Promise<MemberCardView> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    // Belt 2 + the host owner: resolve the room's present roster ONCE — the host (card owner for every load
    // below) and the present character seats (the roster-scope gate). A hostless room is unusable (leak-free).
    const roster = await loadRoster(ctx.db, chatId);
    const hostUserId = roster.find((r) => r.role === "host" && r.userId !== null)?.userId ?? null;
    const seated = roster.some((r) => r.kind === "character" && r.characterId === characterId);
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
    const [tags, lore, avatarHash, anchorPersona] = await Promise.all([
      ctx.resolveCharacterTags({ ownerId: hostUserId, characterId }),
      loadCharacterCardLore(ctx.db, { characterId, ownerId: hostUserId }),
      ctx.resolveAssetHash(card.avatarAssetId),
      resolveAnchorPersona(deps, chatId, hostUserId, membership.chat.anchorPersonaId),
    ]);
    // PURE projection — fields above the effective level become null HERE, server-side (never sent over the
    // wire). `clampMemberCard` fabricates nothing: it gates the caller-resolved `tags`/`lore`/`avatarHash`.
    const clamped = clampMemberCard({ characterId, card, tags, lore, avatarHash, visibility });
    // Render display macros on the SURVIVING text fields against the anchor persona (a null field was clamped
    // away and passes through). Greetings render per-entry. `lore`/`tags` are stored resolved (no macro pass).
    const renderCtx = cardRenderContext(card, anchorPersona);
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
 *  model arg (which only tunes preset selection) is irrelevant here — no `resolveConnection` hop is needed. */
async function resolveAnchorPersona(deps: ReadDeps, chatId: ChatId, hostUserId: UserId, anchorPersonaId: PersonaId | null): Promise<AssemblePersona | null> {
  const foreign = await deps.resolveForeignInputs({
    chatId,
    runAsUserId: hostUserId,
    model: "",
    anchorPersonaId,
    personaIds: anchorPersonaId !== null ? [anchorPersonaId] : [],
  });
  return foreign.personas.anchor;
}

// An unclamped `limit` is a DoS surface (an unbounded SQL `.limit()`), not an authz hole.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** `listMessages` — a paged canon read (each slot joined to its selected variant), chronological, + the
 *  page's {@link ChatMacroNameProducer}. The `excludedFromPrompt` flag rides each `MessageView`.
 *
 *  D16 join-history clamp: the window's floor is the CALLER's `historyFloorSeq` (stamped by the chokepoint) —
 *  a `from-join` member never receives a row below their own `joinSeq`. Pagination stays honest: a
 *  `beforeSeq` cursor at/below the floor simply matches nothing, so the caller gets an EMPTY page (the
 *  same terminal signal an exhausted backward walk gives), never a fabricated one. */
function createListMessages(ctx: ChatContext, deps: ReadDeps): ChatService["listMessages"] {
  return async ({ principal, chatId, beforeSeq, limit }: ListMessagesParams): Promise<MessagesPage> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const pageSize = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const page = await loadMessagesPage(ctx.db, chatId, { beforeSeq, limit: pageSize, floorSeq: membership.historyFloorSeq });
    // `loadMessagesPage` returns newest-first (the backward window); reverse for chronological display.
    // The §3.6 MEMBER-STRIP trust boundary: hidden-class spans never reach a NON-HOST viewer's payload
    // (a client-only hide would leak the truth bytes in the wire). The host reads unstripped — the reveal
    // eye / standing-lie inventory are host-plane reads over the full body. P3: on a DECEPTION-active game the
    // member also loses the reasoning channel (resolved once per read via the injected rpg op — `false` for a
    // non-game / non-deception chat, so no regression).
    const chronological = page.reverse();
    const reasoningHostOnly = membership.role === "host" ? false : await resolveReasoningHostOnly(ctx, chatId);
    const messages = membership.role === "host" ? chronological : chronological.map((v) => projectViewForMember(v, reasoningHostOnly));
    const participants = await deps.loadParticipantViews(chatId);
    const macroNames = await loadChatMacroNameProducer(ctx.db, { participants, messages });
    const personaAvatars = await loadPersonaAvatarProducer(ctx.db, { participants, messages });
    const characterAvatars = await loadCharacterAvatarProducer(ctx.db, { participants, messages });
    return { messages, macroNames, personaAvatars, characterAvatars };
  };
}

/** `listMessageVariants` — the full sibling-variant set for one slot, ordered by idx, no content. A
 *  foreign-chat/unknown `messageId` collapses to a leak-free NOT_FOUND. */
function createListMessageVariants(ctx: ChatContext): ChatService["listMessageVariants"] {
  return async ({ principal, chatId, messageId }: ListMessageVariantsParams): Promise<MessageVariantSummary[]> => {
    await requireParticipant(ctx, principal, chatId);
    const rows = await loadMessageVariantSummaries(ctx.db, chatId, messageId);
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

/** `previewAssembly` — the BUILD product + the debug trace for a hypothetical turn. HOST/ADMIN
 *  (`requireHost`, matrix `previewAssembly: "host"`): the assembled prompt merges every roster member's
 *  card at FULL fidelity — exposing it to a plain member would bypass the D22 `memberCardVisibility` clamp
 *  (a member reading another member's private card fields). A `guided` steer is routed through the same
 *  gather→build a real turn uses. */
function createPreviewAssembly(ctx: ChatContext, deps: ReadDeps): ChatService["previewAssembly"] {
  return async ({ principal, chatId, speakerCharacterId, guided }: PreviewAssemblyParams): Promise<AssemblyPreview> => {
    const membership = await requireHost(ctx, principal, chatId);
    const inputs = await resolvePreviewInputs(ctx, deps, chatId, {
      anchorPersonaId: membership.chat.anchorPersonaId,
      speakerCharacterId,
    });
    const registry = buildPreviewRegistry(inputs);
    const assembleContext = await buildPreviewContext(ctx, inputs, chatId, { registry, guided });
    const prompt = buildPrompt(inputs.foreign.promptConfig, assembleContext, registry ?? undefined);
    // Route through the host-audience redaction seam (chat-crew-design/04 §2, CREW-6). The verdict is DERIVED
    // from the membership `requireHost` already loaded (no second read) — provably `true` today, but if this
    // gate is ever relaxed to `requireParticipant` the elision inherits automatically (the structural belt: a
    // host-ring `audience:"host"` injection can never leak through a snapshot-serving projection).
    return { prompt, trace: prompt.trace };
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
    const assembleContext = await buildPreviewContext(ctx, inputs, chatId, { registry });
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
    const assembleContext = await buildPreviewContext(ctx, inputs, chatId, { registry });
    const assembled = buildPrompt(inputs.foreign.promptConfig, assembleContext, registry ?? undefined);

    // The per-chat macro name producer over the full canon — resolves each history row's own macro stamps
    // (client-display parity), exactly as the engine builds it for a real turn.
    const canon = await loadCanonHistory(ctx.db, chatId);
    const macroProducer = await loadChatMacroNameProducer(ctx.db, { messages: canon });
    const historyMacroNames: HistoryMacroNames = {
      characterNamesById: buildCharacterNameMap(macroProducer.characterNames),
      personaNamesById: buildPersonaNameMap(macroProducer.personaNames),
    };

    // SHAPE the next-turn peek (no user input, no group nudge, primary speaker / merged): the same wire
    // history the pipeline would build, minus the per-speaker round machinery — the trace describes how the
    // CURRENT canon shapes for the next turn.
    const inChatInjections: ChatInjection[] = [...(assembleContext.chatInjections ?? []).filter((i) => i.position === "in_chat"), ...assembled.afterHistory];
    const turns = inputs.capability?.turns;
    const shaped = shapeTurn({
      canon: assembled.sendHistory ? toShapeCanon(canon, assembleContext, historyMacroNames) : [],
      appendUserTurn: null,
      injections: inChatInjections,
      output: "per-speaker",
      cardScope: "merged",
      scopedTargetId: null,
      namesBehavior: assembleContext.promptConfig.namesBehavior ?? "default",
      speakers: { user: assembleContext.activePersona?.name ?? "User", assistant: assembleContext.character.name },
      groupNudge: null,
      assistantPrefill: turns?.assistantPrefill === true,
      midConversationSystem: turns?.midConversationSystem === true,
      roleHandling: assembleContext.promptConfig.params.advanced?.roleHandling,
      roleHandlingFloor: turns?.roleHandlingFloor,
      squashSystemMessages: assembleContext.promptConfig.params.advanced?.squashSystemMessages,
    });
    return buildShapeTrace(shaped.stages, shaped.cacheBreakpointFromEnd);
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
}): ContextFitPreview {
  const { fitted, canon, compactSummary, coveragePoint } = env;
  const hasSummary = compactSummary !== null && compactSummary.length > 0;
  const common = {
    usedTokens: fitted.usedTokens,
    ceilingTokens: fitted.ceilingTokens ?? 0,
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
    const assembleContext = await buildPreviewContext(ctx, inputs, chatId, { registry });
    const assembled = buildPrompt(inputs.foreign.promptConfig, assembleContext, registry ?? undefined);

    const canon = await loadCanonHistory(ctx.db, chatId);
    const macroProducer = await loadChatMacroNameProducer(ctx.db, { messages: canon });
    const historyMacroNames: HistoryMacroNames = {
      characterNamesById: buildCharacterNameMap(macroProducer.characterNames),
      personaNamesById: buildPersonaNameMap(macroProducer.personaNames),
    };

    const inChatInjections: ChatInjection[] = [...(assembleContext.chatInjections ?? []).filter((i) => i.position === "in_chat"), ...assembled.afterHistory];
    const turns = inputs.capability?.turns;
    const shaped = shapeTurn({
      canon: assembled.sendHistory ? toShapeCanon(canon, assembleContext, historyMacroNames) : [],
      appendUserTurn: null,
      injections: inChatInjections,
      output: "per-speaker",
      cardScope: "merged",
      scopedTargetId: null,
      namesBehavior: assembleContext.promptConfig.namesBehavior ?? "default",
      speakers: { user: assembleContext.activePersona?.name ?? "User", assistant: assembleContext.character.name },
      groupNudge: null,
      assistantPrefill: turns?.assistantPrefill === true,
      midConversationSystem: turns?.midConversationSystem === true,
      roleHandling: assembleContext.promptConfig.params.advanced?.roleHandling,
      roleHandlingFloor: turns?.roleHandlingFloor,
      squashSystemMessages: assembleContext.promptConfig.params.advanced?.squashSystemMessages,
    });

    // FIT — the same budget the engine's turn pipeline builds: window (capability) soft-capped by the
    // preset's `maxContextTokens`, reserving the materialized output budget + the assembled system tokens.
    const params = assembleContext.promptConfig.params;
    const systemTokens = estimateTokens([assembled.static, assembled.dynamic].join("\n\n"));
    const budget = buildHistoryBudget({
      windowTokens: inputs.capability?.context.window ?? Number.POSITIVE_INFINITY,
      maxContextTokens: params.maxContextTokens,
      maxOutputTokens: params.maxOutputTokens,
      systemTokens,
    });
    const fitted = fitHistory(shaped.history, budget);
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
 *  An unknown `sectionId` is a leak-free NOT_FOUND (the section, not the chat). */
function createPreviewSection(ctx: ChatContext, deps: ReadDeps): ChatService["previewSection"] {
  return async ({ principal, chatId, sectionId, speakerCharacterId }: PreviewSectionParams): Promise<SectionPreview> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const inputs = await resolvePreviewInputs(ctx, deps, chatId, {
      anchorPersonaId: membership.chat.anchorPersonaId,
      speakerCharacterId,
    });
    const section = inputs.foreign.promptConfig.sections.find((s) => s.id === sectionId);
    if (section === undefined) {
      throw new DomainNotFoundError("prompt_section", sectionId);
    }
    const registry = buildPreviewRegistry(inputs);
    const assembleContext = await buildPreviewContext(ctx, inputs, chatId, { registry });
    return previewSection(section, assembleContext, inputs.foreign.promptConfig, registry ?? undefined);
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
    // non-deception chat.
    const reasoningHostOnly = membership.role === "host" ? false : await resolveReasoningHostOnly(ctx, chatId);
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
    const isHost = membership.role === "host";
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
    if (isHost) {
      return floored;
    }
    const reasoningHostOnly = await resolveReasoningHostOnly(ctx, chatId);
    return scrubChatEventReplayForMember(floored, membership, reasoningHostOnly);
  };
}

/** `chatEventBounds` — the durable bus-log cursor bounds + the caller's own D16 read floor. Also the SSE
 *  attach / per-yield membership gate: the `streamMessages` generator calls this before each live yield so a
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
    const isHost = membership.role === "host";
    const reasoningHostOnly = isHost ? false : await resolveReasoningHostOnly(ctx, chatId);
    return { ...(await loadChatEventBounds(ctx.db, chatId)), historyFloorSeq: membership.historyFloorSeq, viewerIsHost: isHost, reasoningHostOnly };
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
    getMemberCard: createGetMemberCard(ctx, deps),
    previewAssembly: createPreviewAssembly(ctx, deps),
    getActivePresetConfig: createGetActivePresetConfig(ctx, deps),
    previewSection: createPreviewSection(ctx, deps),
    peekPrompt: createPeekPrompt(ctx, deps),
    getShapeTrace: createGetShapeTrace(ctx, deps),
    previewContextFit: createPreviewContextFit(ctx, deps),
    listMessages: createListMessages(ctx, deps),
    listMessageVariants: createListMessageVariants(ctx),
    listParticipants: createListParticipants(ctx, deps),

    replayStreamEvents: createReplayStreamEvents(ctx),
    streamEventBounds: createStreamEventBounds(ctx),
    replayChatEvents: createReplayChatEvents(ctx),
    chatEventBounds: createChatEventBounds(ctx),
  };
}

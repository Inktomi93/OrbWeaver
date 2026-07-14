// domain/chat/verbs/read — the chat read surface (listings, single-chat reads, dry-run prompt previews,
// resumable stream-ring reads). Pure reads: no canon mutation, no bus emit. Every chatId surface is
// membership-gated through the one `requireParticipant` chokepoint; listings are pure membership; the
// lineage/fork walks gate per-ancestor independently (a fork grants no parent membership).
//
// The dry-run previews (`previewAssembly`/`peekPrompt`/`previewSection`/`getActivePresetConfig`) build the
// assemble ctx + render through the `substrate/assembly-access` seam and return the BUILD product for
// inspection — no turn runs, nothing persists.
//
// Deps not on `ChatContext`: `loadParticipantViews` resolves the roster read-model; `resolveConnection`
// resolves the model the previews need; `resolveForeignInputs` is the foreign half of the assemble ctx.

import type {
  ChatMacroNameProducer,
  ParticipantView,
  PersonaAvatarEntry,
} from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { PromptConfig } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../context";
import { ChatNotFoundError } from "../contract/errors";
import type { ForeignInputs, ResolveForeignInputsOp } from "../contract/foreign";
import type {
  ChatEventBoundsParams,
  GetActivePresetConfigParams,
  GetChatLineageParams,
  GetChatParams,
  GuidedSteer,
  ListChatsParams,
  ListForksParams,
  ListMessagesParams,
  ListMessageVariantsParams,
  ListParticipantsParams,
  PeekPromptParams,
  PreviewAssemblyParams,
  PreviewSectionParams,
  ReplayChatEventsParams,
  ReplayStreamEventsParams,
  StreamEventBoundsParams,
} from "../contract/params";
import type { ChatService } from "../contract/service";
import type {
  AssembledPrompt,
  AssemblyPreview,
  ChatDetail,
  ChatLineageView,
  ChatStreamReplayEvent,
  ChatSummary,
  MessagesPage,
  MessageVariantSummary,
  SectionPreview,
  StreamEventBounds,
} from "../contract/views";
import { gateLineagePerAncestor, requireParticipant } from "../guard";
import { loadChatMacroNameProducer } from "../persistence/macro-names";
import {
  listMemberChats,
  loadAncestorChain,
  loadChatEventBounds,
  loadChatEventReplay,
  loadChatMessageStats,
  loadChatParticipantCharacterIds,
  loadForkChildren,
  loadMessagesPage,
  loadMessageVariantSummaries,
  loadStreamBounds,
  loadStreamReplay,
} from "../persistence/queries";
import { loadRoster } from "../persistence/roster";
import { loadPersonaAvatarProducer } from "../persistence/roster-avatars";
import { gatherAssembleContext } from "../substrate/assemble-gather";
import { buildPrompt, previewSection } from "../substrate/assembly-access";

/** The collaborators not on `ChatContext` (see the file header). */
interface ReadDeps {
  readonly loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]>;
  readonly resolveConnection: (args: {
    readonly runAsUserId: UserId;
    readonly chatId: ChatId;
  }) => Promise<ResolvedConnection>;
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
  | "previewAssembly"
  | "getActivePresetConfig"
  | "previewSection"
  | "peekPrompt"
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
  readonly castCharacterIds: readonly CharacterId[];
  readonly personaIds: readonly PersonaId[];
  readonly foreign: ForeignInputs;
}

/** Map a loaded chat row + its resolved roster + macro name producer → `ChatDetail`. The same projection
 *  `fork.ts`/`invites.ts`/`start-chat.ts` use — one shape, no drift. */
interface ToChatDetailInput {
  readonly chat: ChatRowView;
  readonly participants: readonly ParticipantView[];
  readonly macroNames: ChatMacroNameProducer;
  readonly personaAvatars: readonly PersonaAvatarEntry[];
  readonly viewerUserId: UserId;
}

function toChatDetail({
  chat,
  participants,
  macroNames,
  personaAvatars,
  viewerUserId,
}: ToChatDetailInput): ChatDetail {
  const viewer = participants.find((p) => p.userId === viewerUserId);
  return {
    id: chat.id,
    title: chat.title,
    star: chat.star,
    archived: chat.archived,
    parentChatId: chat.parentChatId,
    forkedAt: chat.forkedAt,
    anchorPersonaId: chat.anchorPersonaId,
    participants,
    viewerActivePersonaId: viewer?.activePersonaId ?? null,
    viewerIsHost: viewer?.role === "host",
    viewerUserId,
    pendingHostUserId: chat.pendingHostUserId,
    group: chat.metadata.group ?? DEFAULT_GROUP_CONFIG,
    roomOverrides: chat.metadata.roomOverrides ?? DEFAULT_ROOM_OVERRIDES,
    opening: chat.metadata.opening ?? null,
    compactSummary: chat.compactSummary,
    compactedAtSeq: chat.compactedAtSeq,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    macroNames,
    personaAvatars,
  };
}

/** Map a loaded chat row + its canon stats + present roster + character-seat ids → the light `ChatSummary`
 *  list row. `participantNames` are display names only — the heavy roster is `getChat`. */
function toChatSummary(
  row: ChatRowView,
  stat: { messageCount: number; lastMessageAt: number | null },
  participants: readonly ParticipantView[],
  participantCharacterIds: readonly CharacterId[],
): ChatSummary {
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The canon stats for a chat with no messages (absent from the batched aggregate). */
const EMPTY_STATS = { messageCount: 0, lastMessageAt: null } as const;

/** Resolve a set of chat rows → `ChatSummary[]` (the canon stats batched in one read; the names per chat).
 *  Shared by listChats / listForks / getChatLineage. */
async function buildSummaries(
  db: Db,
  deps: ReadDeps,
  rows: readonly ChatRowView[],
): Promise<ChatSummary[]> {
  if (rows.length === 0) {
    return [];
  }
  const chatIds = rows.map((r) => r.id);
  const stats = await loadChatMessageStats(db, chatIds);
  const characterIdsByChat = await loadChatParticipantCharacterIds(db, chatIds);
  const enriched = await Promise.all(
    rows.map(async (row) => ({ row, names: await deps.loadParticipantViews(row.id) })),
  );
  return enriched.map(({ row, names }) =>
    toChatSummary(
      row,
      stats.get(row.id) ?? EMPTY_STATS,
      names,
      characterIdsByChat.get(row.id) ?? [],
    ),
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
  const castIds = roster.flatMap((r) =>
    r.kind === "character" && r.characterId !== null ? [r.characterId] : [],
  );
  const castCharacterIds =
    speakerCharacterId !== null &&
    speakerCharacterId !== undefined &&
    castIds.includes(speakerCharacterId)
      ? [speakerCharacterId, ...castIds.filter((id) => id !== speakerCharacterId)]
      : castIds;
  const personaIds = roster.flatMap((r) =>
    r.kind === "human" && r.activePersonaId !== null ? [r.activePersonaId] : [],
  );
  const connection = await deps.resolveConnection({ runAsUserId: hostUserId, chatId });
  const foreign = await deps.resolveForeignInputs({
    chatId,
    runAsUserId: hostUserId,
    model: connection.model,
    anchorPersonaId,
    personaIds,
  });
  return { hostUserId, model: connection.model, castCharacterIds, personaIds, foreign };
}

/** Build the assemble ctx for a preview from the resolved {@link PreviewInputs}. No persist, no turn. An
 *  optional `guided` steer mirrors a real turn's steered assembly. */
async function buildPreviewContext(
  ctx: ChatContext,
  inputs: PreviewInputs,
  chatId: ChatId,
  guided?: GuidedSteer,
): ReturnType<typeof gatherAssembleContext> {
  return await gatherAssembleContext(
    ctx,
    {
      chatId,
      runAsUserId: inputs.hostUserId,
      model: inputs.model,
      castCharacterIds: inputs.castCharacterIds,
      personaIds: inputs.personaIds,
      ...(guided !== undefined ? { guided } : {}),
    },
    inputs.foreign,
  );
}

/** `listChats` — the caller's chats (pure membership, host or member), newest-updated first. */
function createListChats(ctx: ChatContext, deps: ReadDeps): ChatService["listChats"] {
  return async ({ principal, includeArchived }: ListChatsParams): Promise<ChatSummary[]> => {
    const rows = await listMemberChats(ctx.db, principal.userId, includeArchived ?? false);
    return await buildSummaries(ctx.db, deps, rows);
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
    return toChatDetail({
      chat: membership.chat,
      participants,
      macroNames,
      personaAvatars,
      viewerUserId: principal.userId,
    });
  };
}

// An unclamped `limit` is a DoS surface (an unbounded SQL `.limit()`), not an authz hole.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** `listMessages` — a paged canon read (each slot joined to its selected variant), chronological, + the
 *  page's {@link ChatMacroNameProducer}. The `excludedFromPrompt` flag rides each `MessageView`. */
function createListMessages(ctx: ChatContext, deps: ReadDeps): ChatService["listMessages"] {
  return async ({
    principal,
    chatId,
    beforeSeq,
    limit,
  }: ListMessagesParams): Promise<MessagesPage> => {
    await requireParticipant(ctx, principal, chatId);
    const pageSize = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const page = await loadMessagesPage(ctx.db, chatId, beforeSeq, pageSize);
    // `loadMessagesPage` returns newest-first (the backward window); reverse for chronological display.
    const messages = page.reverse();
    const participants = await deps.loadParticipantViews(chatId);
    const macroNames = await loadChatMacroNameProducer(ctx.db, { participants, messages });
    const personaAvatars = await loadPersonaAvatarProducer(ctx.db, { participants, messages });
    return { messages, macroNames, personaAvatars };
  };
}

/** `listMessageVariants` — the full sibling-variant set for one slot, ordered by idx, no content. A
 *  foreign-chat/unknown `messageId` collapses to a leak-free NOT_FOUND. */
function createListMessageVariants(ctx: ChatContext): ChatService["listMessageVariants"] {
  return async ({
    principal,
    chatId,
    messageId,
  }: ListMessageVariantsParams): Promise<MessageVariantSummary[]> => {
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

/** `previewAssembly` — the BUILD product + the debug trace for a hypothetical turn (host/admin debug
 *  surface). A `guided` steer is routed through the same gather→build a real turn uses. */
function createPreviewAssembly(ctx: ChatContext, deps: ReadDeps): ChatService["previewAssembly"] {
  return async ({
    principal,
    chatId,
    speakerCharacterId,
    guided,
  }: PreviewAssemblyParams): Promise<AssemblyPreview> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const inputs = await resolvePreviewInputs(ctx, deps, chatId, {
      anchorPersonaId: membership.chat.anchorPersonaId,
      speakerCharacterId,
    });
    const assembleContext = await buildPreviewContext(ctx, inputs, chatId, guided);
    const prompt = buildPrompt(inputs.foreign.promptConfig, assembleContext);
    return { prompt, trace: prompt.trace };
  };
}

/** `peekPrompt` — the assembled prompt for the NEXT real turn (no generation). The BUILD product only. */
function createPeekPrompt(ctx: ChatContext, deps: ReadDeps): ChatService["peekPrompt"] {
  return async ({
    principal,
    chatId,
    speakerCharacterId,
  }: PeekPromptParams): Promise<AssembledPrompt> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const inputs = await resolvePreviewInputs(ctx, deps, chatId, {
      anchorPersonaId: membership.chat.anchorPersonaId,
      speakerCharacterId,
    });
    const assembleContext = await buildPreviewContext(ctx, inputs, chatId);
    return buildPrompt(inputs.foreign.promptConfig, assembleContext);
  };
}

/** `getActivePresetConfig` — the resolved `PromptConfig` the chat assembles against. No assemble ctx is
 *  built (only the config is needed). */
function createGetActivePresetConfig(
  ctx: ChatContext,
  deps: ReadDeps,
): ChatService["getActivePresetConfig"] {
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
  return async ({
    principal,
    chatId,
    sectionId,
    speakerCharacterId,
  }: PreviewSectionParams): Promise<SectionPreview> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const inputs = await resolvePreviewInputs(ctx, deps, chatId, {
      anchorPersonaId: membership.chat.anchorPersonaId,
      speakerCharacterId,
    });
    const section = inputs.foreign.promptConfig.sections.find((s) => s.id === sectionId);
    if (section === undefined) {
      throw new DomainNotFoundError("prompt_section", sectionId);
    }
    const assembleContext = await buildPreviewContext(ctx, inputs, chatId);
    return previewSection(section, assembleContext, inputs.foreign.promptConfig);
  };
}

/** `replayStreamEvents` — resume the resumable SSE token log from a cursor (late-subscriber ramp-up). */
function createReplayStreamEvents(ctx: ChatContext): ChatService["replayStreamEvents"] {
  return async ({
    principal,
    chatId,
    afterSeq,
  }: ReplayStreamEventsParams): Promise<ChatStreamReplayEvent[]> => {
    await requireParticipant(ctx, principal, chatId);
    return await loadStreamReplay(ctx.db, chatId, afterSeq);
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
 *  resume is never truncated). Member-gated; the events are room-public by the bus payload allowlist. */
function createReplayChatEvents(ctx: ChatContext): ChatService["replayChatEvents"] {
  return async ({ principal, chatId, afterSeq }: ReplayChatEventsParams) => {
    await requireParticipant(ctx, principal, chatId);
    const rows = await loadChatEventReplay(ctx.db, chatId, afterSeq);
    return rows.map(({ seq, payload }) => ({ seq, event: payload }));
  };
}

/** `chatEventBounds` — the durable bus-log cursor bounds. Also the SSE per-yield membership gate: the
 *  `streamMessages` generator calls this before each live yield so a kicked member's stream stops within
 *  the kick tx. */
function createChatEventBounds(ctx: ChatContext): ChatService["chatEventBounds"] {
  return async ({ principal, chatId }: ChatEventBoundsParams): Promise<StreamEventBounds> => {
    await requireParticipant(ctx, principal, chatId);
    return await loadChatEventBounds(ctx.db, chatId);
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
    previewAssembly: createPreviewAssembly(ctx, deps),
    getActivePresetConfig: createGetActivePresetConfig(ctx, deps),
    previewSection: createPreviewSection(ctx, deps),
    peekPrompt: createPeekPrompt(ctx, deps),
    listMessages: createListMessages(ctx, deps),
    listMessageVariants: createListMessageVariants(ctx),
    listParticipants: createListParticipants(ctx, deps),
    replayStreamEvents: createReplayStreamEvents(ctx),
    streamEventBounds: createStreamEventBounds(ctx),
    replayChatEvents: createReplayChatEvents(ctx),
    chatEventBounds: createChatEventBounds(ctx),
  };
}

// domain/chat/verbs/read — the chat READ SURFACE (chat.md Part I 8-slot `verbs/read.ts`; the listings, the
// single-chat reads, the DRY-RUN prompt previews, and the resumable stream-ring reads). PURE reads: no canon
// mutation, no bus emit. Every chatId surface is MEMBERSHIP-gated (D18) through the ONE `requireParticipant`
// chokepoint (default-deny — a non-participant gets a leak-free `ChatNotFoundError`); listings are pure
// membership (`listMemberChats` — only the caller's chats); the lineage/fork walks gate per-ancestor
// INDEPENDENTLY (a fork grants NO parent membership — inv §16).
//
// THE DRY-RUN PREVIEWS (`previewAssembly` / `peekPrompt` / `previewSection` / `getActivePresetConfig`): they
// `buildAssembleContext` (RESOLVE→GATHER→BUILD) + `assemblePrompt`/`previewSection` THROUGH the
// `substrate/assembly-access` seam (a direct `verbs/ → assembly/` import is `domain-no-cross-subsystem`-illegal)
// and return the BUILD product for inspection — NO turn runs, NOTHING persists. The returned view-models
// (`AssembledPrompt`/`AssemblyPreview`/`SectionPreview`) are the BUILD halves (static/dynamic/afterHistory +
// the host/admin trace); the SHAPE wire-history is a turn-only product (not in these read-models).
//
// GUIDED (chat.md §6, PD-63 routed): `previewAssembly` threads its `guided` steer into the GATHER→BUILD —
// the SAME resolution a real turn gets (template + neutralized `{{input}}` → the `{{guided_instruction}}`
// marker or a depth-0 injection), so the preview mirrors the steered prompt exactly.
//
// D22 NOTE: the member-card visibility CLAMP is for a roster character's CARD read (`MemberCardView`) — NOT in
// this verb set. `listParticipants` returns `ParticipantView` (the roster identity row — no card content to
// clamp). The clamp lands with the member-card read verb.
//
// DEPS NOT ON `ChatContext` (the second factory arg — the `fork.ts`/`turn.ts` precedent):
//   • loadParticipantViews   — resolve the roster read-model (`users` publics are resolved at the root, OUTSIDE
//                              the `no-direct-users-read` domain scope).
//   • resolveConnection      — `connection.resolveChat` (the previews need the resolved `model` for the WI
//                              `{{model}}` regex; the host funds it — D19 `runAsUserId`).
//   • resolveForeignInputs   — the FOREIGN half of the assemble ctx (preset/persona/settings — the same seam
//                              `turn.ts` uses; contract/foreign.ts). The CHAT-INTERNAL half (canon/injections/
//                              vars/metadata/memory/regex-tier) `gatherAssembleContext` reads itself.

import type { ParticipantView } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { PromptConfig } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context";
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
  MessageView,
  SectionPreview,
  StreamEventBounds,
} from "../contract/views";
import { gateLineagePerAncestor, requireParticipant } from "../guard";
import {
  listMemberChats,
  loadAncestorChain,
  chatEventBounds as loadChatEventBounds,
  replayChatEvents as loadChatEventReplay,
  loadChatMessageStats,
  loadForkChildren,
  loadMessagesPage,
  streamEventBounds as loadStreamBounds,
  replayStreamEvents as loadStreamReplay,
} from "../persistence/queries";
import { loadRoster } from "../persistence/roster";
import { gatherAssembleContext } from "../substrate/assemble-gather";
import { buildPrompt, previewSection } from "../substrate/assembly-access";

/** The collaborators not on `ChatContext` (the second factory arg — see the file header). */
interface ReadDeps {
  readonly loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]>;
  readonly resolveConnection: (args: {
    readonly runAsUserId: UserId;
    readonly chatId: ChatId;
  }) => Promise<ResolvedConnection>;
  /** The FOREIGN half of the assemble ctx (preset/persona/settings) — the same seam `verbs/turn.ts` +
   *  `start-chat.ts` use (contract/foreign.ts). The CHAT-INTERNAL half is gathered by `gatherAssembleContext`. */
  readonly resolveForeignInputs: ResolveForeignInputsOp;
}

/** The read slice of `ChatService` this grouped file owns (the bundle the root spreads in). */
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
  | "listParticipants"
  | "replayStreamEvents"
  | "replayChatEvents"
  | "chatEventBounds"
  | "streamEventBounds"
>;

/** A loaded chat row (the inferred membership/list reader return — the `fork.ts` named-local precedent). */
type ChatRowView = Awaited<ReturnType<typeof listMemberChats>>[number];

/** The resolved preview substrate: the host (D19 funding id), the resolved cast/personas, the connection
 *  `model`, and the cross-domain assemble inputs (incl. the `PromptConfig`). The previews + `getActivePreset
 *  Config` share this resolution. */
interface PreviewInputs {
  readonly hostUserId: UserId;
  readonly model: string;
  readonly castCharacterIds: readonly CharacterId[];
  readonly personaIds: readonly PersonaId[];
  readonly foreign: ForeignInputs;
}

// ── view mappers ────────────────────────────────────────────────────────────────

/** Map a loaded chat row + its resolved roster → `ChatDetail` (metadata sub-blobs applied to defaults; the
 *  same projection `fork.ts`/`start-chat.ts` use — one shape, no drift). */
function toChatDetail(chat: ChatRowView, participants: readonly ParticipantView[]): ChatDetail {
  return {
    id: chat.id,
    title: chat.title,
    star: chat.star,
    archived: chat.archived,
    parentChatId: chat.parentChatId,
    forkedAt: chat.forkedAt,
    anchorPersonaId: chat.anchorPersonaId,
    participants,
    group: chat.metadata.group ?? DEFAULT_GROUP_CONFIG,
    roomOverrides: chat.metadata.roomOverrides ?? DEFAULT_ROOM_OVERRIDES,
    opening: chat.metadata.opening ?? null,
    compactSummary: chat.compactSummary,
    compactedAtSeq: chat.compactedAtSeq,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

/** Map a loaded chat row + its canon stats + present roster → the light `ChatSummary` list row (D18 — no
 *  `ownerId`; `participantNames` are display names only — the heavy roster is `getChat`). */
function toChatSummary(
  row: ChatRowView,
  stat: { messageCount: number; lastMessageAt: number | null },
  participants: readonly ParticipantView[],
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The canon stats for a chat with no messages (absent from the batched aggregate — D18 just-created room). */
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
  const stats = await loadChatMessageStats(
    db,
    rows.map((r) => r.id),
  );
  const enriched = await Promise.all(
    rows.map(async (row) => ({ row, names: await deps.loadParticipantViews(row.id) })),
  );
  return enriched.map(({ row, names }) =>
    toChatSummary(row, stats.get(row.id) ?? EMPTY_STATS, names),
  );
}

// ── preview substrate ─────────────────────────────────────────────────────────

/** Resolve the {@link PreviewInputs} for a chat: the present roster → host + cast + personas, then the
 *  connection (`model`) + the cross-domain assemble inputs. A hostless room is unusable (a leak-free
 *  NOT_FOUND). The cast is reordered to put `speakerCharacterId` PRIMARY when supplied (so the preview shows
 *  that speaker's per-speaker turn). */
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

/** Build the ONE immutable assemble ctx for a preview (RESOLVE→GATHER→BUILD via the gather) from the resolved
 *  {@link PreviewInputs}. No persist, no turn (no SEND sink — previews take no composer input). An optional
 *  `guided` steer mirrors a real turn's steered assembly (PD-63 — file header). */
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

// ── listings ─────────────────────────────────────────────────────────────────────

/** `listChats` — the caller's chats (pure membership, host OR member; D18), newest-updated first. */
function createListChats(ctx: ChatContext, deps: ReadDeps): ChatService["listChats"] {
  return async ({ principal, includeArchived }: ListChatsParams): Promise<ChatSummary[]> => {
    const rows = await listMemberChats(ctx.db, principal.userId, includeArchived ?? false);
    return await buildSummaries(ctx.db, deps, rows);
  };
}

/** `listForks` — the fork CHILDREN of a chat the caller is ALSO a member of (a fork grants no parent
 *  membership, and parent membership grants no child membership — inv §16; gated per child INDEPENDENTLY). */
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

/** `getChatLineage` — the fork ancestry chain (D27 `parentChatId`), oldest-root first, membership-gated per
 *  ancestor INDEPENDENTLY (a hidden / not-a-member ancestor is OMITTED — the chain may be sparse, inv §16). */
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

// ── single reads ───────────────────────────────────────────────────────────────

/** `getChat` — one chat resolved (row + present roster + effective room behavior). NOT_FOUND when missing OR
 *  the caller is not a participant (leak-free). */
function createGetChat(ctx: ChatContext, deps: ReadDeps): ChatService["getChat"] {
  return async ({ principal, chatId }: GetChatParams): Promise<ChatDetail> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const participants = await deps.loadParticipantViews(chatId);
    return toChatDetail(membership.chat, participants);
  };
}

/** `listMessages` — a paged canon read (D26 — each slot joined to its selected variant), chronological. The
 *  `excludedFromPrompt` (hidden) flag rides each `MessageView` (the client renders the held-out state); a
 *  member sees the full room canon (D18). */
function createListMessages(ctx: ChatContext): ChatService["listMessages"] {
  return async ({
    principal,
    chatId,
    beforeSeq,
    limit,
  }: ListMessagesParams): Promise<MessageView[]> => {
    await requireParticipant(ctx, principal, chatId);
    const page = await loadMessagesPage(ctx.db, chatId, beforeSeq, limit);
    // `loadMessagesPage` returns newest-first (the backward window); reverse for chronological display.
    return page.reverse();
  };
}

/** `listParticipants` — the resolved present roster (`ParticipantView[]`). */
function createListParticipants(ctx: ChatContext, deps: ReadDeps): ChatService["listParticipants"] {
  return async ({ principal, chatId }: ListParticipantsParams): Promise<ParticipantView[]> => {
    await requireParticipant(ctx, principal, chatId);
    return [...(await deps.loadParticipantViews(chatId))];
  };
}

// ── dry-run prompt previews (NO turn, NO persist) ─────────────────────────────────

/** `previewAssembly` — the BUILD product + the debug trace for a hypothetical turn (host/admin debug surface).
 *  A `guided` steer is routed through the SAME GATHER→BUILD a real turn uses (file header — PD-63). */
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

/** `getActivePresetConfig` — the resolved `PromptConfig` the chat assembles against (the cross-domain
 *  resolver's preset, under the host's settings). No assemble ctx is built (only the config is needed). */
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

// ── stream-ring reads (the resumable SSE log; resume cursor) ──────────────────────

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

// ── durable chat-bus reads (the `streamMessages` SSE resume; PD-46's stream half) ───────────────

/** `replayChatEvents` — resume the durable chat-bus log from a cursor (the SSE reconnect replay; the log is
 *  append-only, so a resume is never truncated). Member-gated; the events are room-public by the bus
 *  payload allowlist (inv #11). */
function createReplayChatEvents(ctx: ChatContext): ChatService["replayChatEvents"] {
  return async ({ principal, chatId, afterSeq }: ReplayChatEventsParams) => {
    await requireParticipant(ctx, principal, chatId);
    const rows = await loadChatEventReplay(ctx.db, chatId, afterSeq);
    return rows.map(({ seq, payload }) => ({ seq, event: payload }));
  };
}

/** `chatEventBounds` — the durable bus-log cursor bounds. ALSO the SSE per-yield membership gate: the
 *  `streamMessages` generator calls this before each live yield so a kicked member's stream stops within
 *  the kick tx (Tier-4 "the membership chokepoint must cover the SSE subscribe path"). */
function createChatEventBounds(ctx: ChatContext): ChatService["chatEventBounds"] {
  return async ({ principal, chatId }: ChatEventBoundsParams): Promise<StreamEventBounds> => {
    await requireParticipant(ctx, principal, chatId);
    return await loadChatEventBounds(ctx.db, chatId);
  };
}

/**
 * The read-surface verb BUNDLE (the grouped-file `create<File>` convention — `verb-naming` gate). The root
 * spreads it into the full service. PURE reads (membership-gated; no mutation, no bus emit). `deps` carries the
 * roster resolver + the connection/assemble resolvers the dry-run previews need.
 */
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
    listMessages: createListMessages(ctx),
    listParticipants: createListParticipants(ctx, deps),
    replayStreamEvents: createReplayStreamEvents(ctx),
    streamEventBounds: createStreamEventBounds(ctx),
    replayChatEvents: createReplayChatEvents(ctx),
    chatEventBounds: createChatEventBounds(ctx),
  };
}

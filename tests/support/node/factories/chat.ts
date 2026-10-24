// Chat seeds run the production verbs and return their outcomes; rows-tier twins in `rows/chat.ts` read the rows.

import type { PortableEntity, PortableFile } from "@orb/contracts/portability";
import type {
  chatEvents,
  chatGenerationObservations,
  chatHandoffResumptions,
  chatImportClaims,
  chatInjections,
  chatInvites,
  chatLocks,
  chatParticipants,
  chatStreamEvents,
  chats,
  compactionSpend,
  messageAssets,
  messageReactions,
  pendingTurns,
} from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import type { PortableChat, PortableChatMessage, PortableChatVariant } from "@orb/server/primitives/serde/chat-bundle";
import { buildChatBundleFile, CHAT_BUNDLE_EXT } from "@orb/server/primitives/serde/chat-bundle";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import type { ServerProducerRoot } from "../server.ts";

/** The full `chats` row (derived from the live schema — the factory `X`). */
export type ChatRow = typeof chats.$inferSelect;
export type ChatInviteRow = typeof chatInvites.$inferSelect;
export type ChatParticipantRow = typeof chatParticipants.$inferSelect;
export type MessageReactionRow = typeof messageReactions.$inferSelect;
type ChatImportClaimRow = typeof chatImportClaims.$inferSelect;
type ChatInjectionRow = typeof chatInjections.$inferSelect;
type MessageAssetRow = typeof messageAssets.$inferSelect;
type ChatEventRow = typeof chatEvents.$inferSelect;
type ChatStreamEventRow = typeof chatStreamEvents.$inferSelect;
type ChatLockRow = typeof chatLocks.$inferSelect;
type PendingTurnRow = typeof pendingTurns.$inferSelect;
export type ChatGenerationObservationRow = typeof chatGenerationObservations.$inferSelect;
export type CompactionSpendRow = typeof compactionSpend.$inferSelect;
export type ChatHandoffResumptionRow = typeof chatHandoffResumptions.$inferSelect;

export interface CapturedChatReplayRows {
  readonly events: readonly ChatEventRow[];
  readonly stream: readonly ChatStreamEventRow[];
  readonly locks: readonly ChatLockRow[];
  readonly pending: readonly PendingTurnRow[];
}

export interface SeededImportedChatRows {
  readonly outcome: Awaited<ReturnType<PortableEntity["importFile"]>>;
  readonly claims: readonly ChatImportClaimRow[];
  readonly injections: readonly ChatInjectionRow[];
  readonly attachments: readonly MessageAssetRow[];
}

export interface SeededChat {
  readonly view: Awaited<ReturnType<ChatService["startChat"]>>;
}

/** The caller becomes host and the founding characters join; production owns the husk, roster and opening. */
export async function seedChat(root: ServerProducerRoot, params: Parameters<ChatService["startChat"]>[0]): Promise<SeededChat> {
  return { view: await root.services.chat.startChat(params) };
}

/** One transcript line: the slot's attribution fields plus its single rendered variant. */
export interface TranscriptLine
  extends Pick<PortableChatMessage, "role">,
    Partial<Pick<PortableChatMessage, "kind" | "speakerHandle" | "personaName">>,
    Pick<PortableChatVariant, "content">,
    Partial<Pick<PortableChatVariant, "reasoning">> {}

export interface SeedTranscriptParams {
  readonly ownerId: UserId;
  /** The seated cast, primary first; every handle must name a card the owner holds. */
  readonly characterHandles: PortableChat["characterHandles"];
  readonly lines: readonly TranscriptLine[];
  readonly chat?: Partial<Pick<PortableChat, "title" | "metadata" | "anchorPersonaName">>;
}

export interface SeededTranscript {
  readonly chatId: ChatId;
}

/** A history with assistant rows is bulk data: the native chat import writes it in one call, with no turn. */
export async function seedTranscript(root: ServerProducerRoot, params: SeedTranscriptParams): Promise<SeededTranscript> {
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("production composition has no chat portability descriptor");
  }
  const importFile = descriptor.importFile;
  const [primary] = params.characterHandles;
  if (primary === undefined) {
    throw new Error("a transcript import needs a seated character; production refuses a characterless room");
  }
  const bytes = buildChatBundleFile({
    title: params.chat?.title ?? "",
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    starred: false,
    archived: false,
    compactSummary: null,
    compactedAtSeq: null,
    metadata: params.chat?.metadata ?? null,
    variableValues: null,
    userMacroValues: null,
    anchorPersonaName: params.chat?.anchorPersonaName ?? null,
    characterHandles: params.characterHandles,
    tagNames: [],
    injections: [],
    messages: params.lines.map(transcriptMessage),
    rpg: null,
  });
  const file: PortableFile = { filename: `${primary}/transcript${CHAT_BUNDLE_EXT}`, bytes };
  // The import names no room, so the one the owner's list gains is the room this call wrote.
  const owner = await root.internalCallerFor(params.ownerId);
  const listed = async (): Promise<readonly ChatId[]> => (await owner.chat.listChats({})).items.map(({ id }) => id);
  const before = new Set(await listed());
  const outcome = await importFile(params.ownerId, file);
  if (!(outcome.ok && outcome.created)) {
    throw new Error(`production chat import wrote no transcript: ${outcome.ok ? "an identical transcript was already imported" : outcome.error}`);
  }
  const [chatId, ...extra] = (await listed()).filter((id) => !before.has(id));
  if (chatId === undefined || extra.length > 0) {
    throw new Error("production chat import did not add exactly one room to the owner's list");
  }
  return { chatId };
}

export function transcriptMessage(line: TranscriptLine): PortableChatMessage {
  return {
    role: line.role,
    kind: line.kind ?? "standard",
    speakerHandle: line.speakerHandle ?? null,
    personaName: line.personaName ?? null,
    createdAt: FROZEN_AT_MS,
    selectedIdx: 0,
    // An authored transcript variant carries no generation economics, which is what an interchange import writes.
    variants: [
      {
        idx: 0,
        content: line.content,
        model: null,
        provider: null,
        tokensIn: null,
        tokensOut: null,
        tokenProvenance: "unrecorded",
        reasoning: line.reasoning ?? null,
        ttftMs: null,
        genStartedAt: null,
        genFinishedAt: null,
        variableDelta: null,
        metadata: null,
      },
    ],
  };
}

/** The real host-gated mint owns CSPRNG token hashing, target resolution, bounds and notification delivery. */
export async function seedChatInvite(
  root: ServerProducerRoot,
  params: Parameters<ChatService["createInvite"]>[0],
): Promise<Awaited<ReturnType<ChatService["createInvite"]>>> {
  return await root.services.chat.createInvite(params);
}

/** A real targeted join or recovery: the atomic claim, persona resolution and history-floor write stay production's. */
export async function seedInvitedChatParticipant(
  root: ServerProducerRoot,
  params: Parameters<ChatService["acceptInvite"]>[0],
): Promise<Awaited<ReturnType<ChatService["acceptInvite"]>>> {
  return await root.services.chat.acceptInvite(params);
}

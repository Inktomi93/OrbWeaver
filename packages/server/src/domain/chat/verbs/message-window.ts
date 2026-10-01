import type { MessageView, ParticipantView } from "@orb/contracts/chat";
import { CHAT_MESSAGE_LIST_MAX_LIMIT } from "@orb/contracts/chat";
import type { CorpusSource, CorpusSourceOutcome } from "@orb/contracts/search";
import type { ChatId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import type { GetMessageWindowParams } from "../contract/params.ts";
import type { ChatService } from "../contract/service.ts";
import type { MessageWindow } from "../contract/views.ts";
import { requireParticipant } from "../guard.ts";
import { loadChatIdentityProducer } from "../persistence/identity.ts";
import { loadWindowAnchor, loadWindowRange } from "../persistence/message-window.ts";
import { loadMessagesPage } from "../persistence/queries.ts";
import { projectViewForMember, viewerReadsHidden } from "../substrate/member-visibility.ts";

const DEFAULT_WINDOW_LIMIT = 40;

/** A bounded canon window resolves source identity before applying the same viewer projection as paging. */
export function createMessageWindow(
  ctx: ChatContext,
  deps: { readonly loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]> },
): ChatService["getMessageWindow"] {
  return async ({ principal, chatId, target, cursor, limit }: GetMessageWindowParams): Promise<MessageWindow> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const floor = membership.historyFloorSeq;
    const pageSize = Math.max(1, Math.min(limit ?? DEFAULT_WINDOW_LIMIT, CHAT_MESSAGE_LIST_MAX_LIMIT));
    const resolution = await resolveWindowTarget(ctx, { chatId, target }, floor);
    const { outcome, anchor, end } = resolution;
    if (anchor === null) {
      return {
        outcome,
        anchorMessageId: null,
        anchorSeq: null,
        endSeq: null,
        endMessageId: null,
        messages: [],
        identities: [],
        hasBefore: false,
        hasAfter: false,
      };
    }
    const canon = await readWindowPage(ctx, { chatId, cursor, pageSize, floor, anchorSeq: anchor.seq });
    const readsHidden = viewerReadsHidden(membership);
    const reasoningHostOnly = readsHidden ? false : ((await ctx.rpg?.resolveReasoningHostOnly(chatId)) ?? false);
    const messages = readsHidden ? canon : canon.map((row) => projectViewForMember(row, reasoningHostOnly));
    const participants = await deps.loadParticipantViews(chatId);
    const identities = await loadChatIdentityProducer(ctx.db, { participants, messages });
    const firstSeq = messages[0]?.seq;
    const lastSeq = messages.at(-1)?.seq;
    const [before, after] = await Promise.all([
      firstSeq === undefined ? [] : loadMessagesPage(ctx.db, chatId, { beforeSeq: firstSeq, limit: 1, floorSeq: floor }),
      lastSeq === undefined ? [] : loadMessagesPage(ctx.db, chatId, { beforeSeq: undefined, afterSeq: lastSeq, ascending: true, limit: 1, floorSeq: floor }),
    ]);
    return {
      outcome,
      anchorMessageId: anchor.id,
      anchorSeq: anchor.seq,
      endSeq: end?.seq ?? null,
      endMessageId: end?.id ?? null,
      messages,
      identities,
      hasBefore: before.length > 0,
      hasAfter: after.length > 0,
    };
  };
}

type WindowAnchor = Awaited<ReturnType<typeof loadWindowAnchor>>;
interface WindowResolution {
  readonly outcome: CorpusSourceOutcome;
  readonly anchor: WindowAnchor;
  readonly end: WindowAnchor;
}
async function resolveWindowTarget(ctx: ChatContext, request: Pick<GetMessageWindowParams, "chatId" | "target">, floor: number): Promise<WindowResolution> {
  if (request.target.kind === "source") {
    return await resolveSourceWindow(ctx, request.chatId, request.target.source, floor);
  }
  const anchor = await loadWindowAnchor(ctx.db, request.chatId, request.target.messageId, floor);
  return { outcome: anchor === null ? "deleted" : "resolved", anchor, end: anchor };
}
async function resolveSourceWindow(ctx: ChatContext, chatId: ChatId, source: CorpusSource, floor: number): Promise<WindowResolution> {
  if (source.chatId !== chatId || source.fingerprint === null || source.seqStart === null || source.seqEnd === null || source.seqEnd < source.seqStart) {
    return { outcome: "unavailable", anchor: null, end: null };
  }
  const current = await ctx.resolveCorpusSourceState(source);
  if (current.generationFingerprint !== source.fingerprint) {
    return { outcome: "unavailable", anchor: null, end: null };
  }
  const [range, stableStart, stableEnd] = await Promise.all([
    loadWindowRange(ctx.db, chatId, { seqStart: source.seqStart, seqEnd: source.seqEnd, floorSeq: floor }),
    source.messageStartId === null ? null : loadWindowAnchor(ctx.db, chatId, source.messageStartId, floor),
    source.messageEndId === null ? null : loadWindowAnchor(ctx.db, chatId, source.messageEndId, floor),
  ]);
  // Sequence slots can be reused after edits; surviving stable identity owns the jump.
  const anchor = stableStart ?? stableEnd ?? range.first;
  const survivingEnd = stableEnd ?? range.last;
  const end = anchor !== null && survivingEnd !== null && survivingEnd.seq >= anchor.seq ? survivingEnd : anchor;
  return { anchor, end, outcome: sourceOutcome({ source, anchor, end, contentHash: current.contentHash, sourceSpanMatches: current.sourceSpanMatches }) };
}
function sourceOutcome({
  source,
  anchor,
  end,
  contentHash,
  sourceSpanMatches,
}: {
  readonly source: CorpusSource;
  readonly anchor: WindowAnchor;
  readonly end: WindowAnchor;
  readonly contentHash: string | null;
  readonly sourceSpanMatches: boolean;
}): CorpusSourceOutcome {
  if (anchor === null) {
    return "deleted";
  }
  const exact =
    sourceSpanMatches &&
    contentHash === source.contentHash &&
    anchor.id === source.messageStartId &&
    end?.id === source.messageEndId &&
    anchor.seq === source.seqStart &&
    end.seq === source.seqEnd;
  return exact ? "resolved" : "moved";
}
async function readWindowPage(
  ctx: ChatContext,
  {
    chatId,
    cursor,
    pageSize,
    floor,
    anchorSeq,
  }: {
    readonly chatId: ChatId;
    readonly cursor: GetMessageWindowParams["cursor"];
    readonly pageSize: number;
    readonly floor: number;
    readonly anchorSeq: number;
  },
): Promise<MessageView[]> {
  if (cursor?.kind === "before") {
    return (await loadMessagesPage(ctx.db, chatId, { beforeSeq: cursor.seq, limit: pageSize, floorSeq: floor })).reverse();
  }
  if (cursor?.kind === "after") {
    return await loadMessagesPage(ctx.db, chatId, { beforeSeq: undefined, afterSeq: cursor.seq, ascending: true, limit: pageSize, floorSeq: floor });
  }
  const before = await loadMessagesPage(ctx.db, chatId, { beforeSeq: anchorSeq + 1, limit: Math.ceil(pageSize / 2), floorSeq: floor });
  const after = await loadMessagesPage(ctx.db, chatId, {
    beforeSeq: undefined,
    afterSeq: anchorSeq,
    ascending: true,
    limit: pageSize - before.length,
    floorSeq: floor,
  });
  return [...before.reverse(), ...after];
}

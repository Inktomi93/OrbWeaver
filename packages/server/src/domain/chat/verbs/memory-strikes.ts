// verbs: memoryView / strikeMemory / restoreMemory — the room's story memory in plain parts, and the host's strike
// and restore of one remembered item.
//
// ONLY THE HOST STRIKES. A strike changes what every speaker in the room recalls, so it is room configuration, the
// same authority as the room's notes (`saveCorrection`, `deleteChatInjection`); a member reads the view and is
// refused the write with `not_host`.
//
// A MEMBER SEES ONLY WHAT THEIR FLOOR ALLOWS. An item is listed to a member with a D16 join floor only when the
// whole span it covers sits at or above that floor (containment, not overlap: a summary that straddles the floor
// retells history the member may not read). An item whose span cannot be resolved is not listed to them, and the
// unmatched-strike list (anchors of scenes that may be below the floor) is withheld. The host is never floored.
//
// THE STRIKE NAMES WHAT THE HOST READ. The item key carries the digest's content hash; a key whose digest is gone,
// was summarized again, or no longer resolves to its messages is refused `memory_item_stale`, never landed on
// whatever sits at that position now. The strike stores the covered span's endpoint message ids, so a re-summary
// of the same messages stays struck (`chat_memory_strikes` in `packages/db/src/schema/chat.ts`). The one place a
// strike leaves the prompt is recall (`dropStruck` in `memory/recall/recall.ts`).

import type { MemoryItemView, MemoryView, StrikeMemoryResult, UnmatchedStrikeView } from "@orb/contracts/chat";
import { memoryViewStatus, NO_HISTORY_FLOOR } from "@orb/contracts/chat";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { matchStrikes } from "@orb/kit/recall";
import type { ChatContext } from "../contract/context.ts";
import type { EmitDurableChatEventOp } from "../contract/engine-context.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import type { MemoryViewParams, RestoreMemoryParams, StrikeMemoryParams } from "../contract/params.ts";
import type { ChatService } from "../contract/service.ts";
import { requireHost, requireParticipant } from "../guard.ts";
import { resolveCfg } from "../memory/constants.ts";
import {
  deleteMemoryStrike,
  findMemoryStrike,
  IMPORTED_STRIKE_HASH,
  insertMemoryStrike,
  loadDigestAt,
  loadMemoryStrikes,
  loadRecentWindowStart,
  loadRoomDigests,
  loadSpeakersOf,
  resolveDigestSpans,
} from "../memory/persistence/strikes.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import { loadMaxMessageSeq } from "../persistence/queries.ts";
import { loadPresentHostUserId } from "../persistence/reactions.ts";

export type MemoryStrikeVerbs = Pick<ChatService, "memoryView" | "strikeMemory" | "restoreMemory">;

/** The bucket every speaker recalls, as the turn resolves it (`gatherMemory`): the room's synthetic group character,
 *  else its first seated character. Null in a room with no character seated. */
async function resolveSharedBucket(ctx: ChatContext, chatId: ChatId, hostUserId: UserId): Promise<CharacterId | null> {
  const groupId = (await ctx.findSyntheticGroupCharacter({ ownerId: hostUserId, chatId }))?.characterId;
  if (groupId !== undefined) {
    return groupId;
  }
  const seats = await loadParticipants(ctx.db, chatId);
  for (const seat of seats) {
    const actor = classifyParticipant(seat);
    if (actor?.kind === "character") {
      return actor.characterId;
    }
  }
  return null;
}

function createMemoryView(ctx: ChatContext): ChatService["memoryView"] {
  return async ({ principal, chatId }: MemoryViewParams): Promise<MemoryView> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const floor = membership.historyFloorSeq;
    const floored = floor !== NO_HISTORY_FLOOR;
    // The turn obeys the present host's switch; a room between hosts runs no turn, so it reads as the host's off.
    const hostUserId = await loadPresentHostUserId(ctx.db, chatId);
    const appModeOff = resolveCfg(ctx.readMemoryDefaults()).mode === "off";
    const cfg = hostUserId === null ? null : resolveCfg(await ctx.resolveMemoryConfig(hostUserId));
    if (appModeOff || hostUserId === null || cfg === null || cfg.mode === "off") {
      return { status: { kind: "off", reason: appModeOff ? "app-off" : "host-off" }, items: [], unmatchedStrikes: [], recentWindowStartsAt: null };
    }
    const [stored, strikes, sharedBucket, maxSeq, windowStart] = await Promise.all([
      loadRoomDigests(ctx.db, chatId),
      loadMemoryStrikes(ctx.db, chatId),
      resolveSharedBucket(ctx, chatId, hostUserId),
      loadMaxMessageSeq(ctx.db, chatId),
      loadRecentWindowStart(ctx.db, chatId),
    ]);
    const resolved = await resolveDigestSpans(ctx.db, chatId, stored, cfg.fanOut);
    const visible = floored ? resolved.filter((d) => d.seqSpan !== null && d.seqSpan.seqStart >= floor) : resolved;
    // Matched over every stored item, so a strike on a scene below the member's floor never reads as unmatched.
    const match = matchStrikes(resolved, strikes, { sharedBucket, fanOut: cfg.fanOut });
    const speakers = await loadSpeakersOf(
      ctx.db,
      visible.map((d) => d.id),
    );
    const items = visible.map((d): MemoryItemView => {
      const strike = match.struck.get(d);
      return {
        key: { tier: d.tier, blockIdx: d.blockIdx, scopedCharacterId: d.scopedCharacterId, contentHash: d.contentHash },
        bucket: d.scopedCharacterId === sharedBucket ? "shared" : "scoped",
        topicAnchor: d.topicAnchor,
        text: d.text,
        keywords: [...d.keywords],
        speakers: speakers.get(d.id) ?? [],
        strike:
          strike === undefined
            ? null
            : { strikeId: strike.id, changedSinceStrike: strike.contentHash !== IMPORTED_STRIKE_HASH && strike.contentHash !== d.contentHash },
        retellsStruck: match.coversStruck.has(d),
      };
    });
    const matched = new Set(match.struck.values());
    const unmatchedStrikes = floored
      ? []
      : strikes
          .filter((s) => !matched.has(s))
          .map((s): UnmatchedStrikeView => ({ strikeId: s.id, tier: s.tier, scopedCharacterId: s.scopedCharacterId, topicAnchor: s.topicAnchor }));
    return {
      status: memoryViewStatus({
        appModeOff,
        hostEnabled: true,
        maxSeq,
        verbatimWindow: cfg.verbatimWindow,
        blockSize: cfg.blockSize,
        storedItems: items.length,
      }),
      items,
      unmatchedStrikes,
      // A boundary below the member's floor means everything they may read was in the reply's window.
      recentWindowStartsAt: windowStart === null || windowStart.seq < floor ? null : windowStart.id,
    };
  };
}

function stale(chatId: ChatId): ChatOperationError {
  return new ChatOperationError(CHAT_OP_CODES.memoryItemStale, `chat ${chatId}: the remembered item has changed since it was read`);
}

function createStrikeMemory(ctx: ChatContext, emit: EmitDurableChatEventOp): ChatService["strikeMemory"] {
  return async ({ principal, chatId, item }: StrikeMemoryParams): Promise<StrikeMemoryResult> => {
    await requireHost(ctx, principal, chatId);
    const digest = await loadDigestAt(ctx.db, chatId, item);
    if (digest === undefined || digest.contentHash !== item.contentHash) {
      throw stale(chatId);
    }
    const cfg = resolveCfg(await ctx.resolveMemoryConfig(principal.userId));
    const [resolved] = await resolveDigestSpans(ctx.db, chatId, [digest], cfg.fanOut);
    if (resolved === undefined || resolved.span === null) {
      throw stale(chatId);
    }
    const sharedBucket = await resolveSharedBucket(ctx, chatId, principal.userId);
    const identity = {
      scopedCharacterId: digest.scopedCharacterId === sharedBucket ? null : digest.scopedCharacterId,
      tier: digest.tier,
      messageStartId: resolved.span.startId,
      messageEndId: resolved.span.endId,
    };
    const strikeId = ctx.newMemoryStrikeId();
    const inserted = await insertMemoryStrike(ctx.db, {
      ...identity,
      id: strikeId,
      chatId,
      contentHash: digest.contentHash,
      topicAnchor: digest.topicAnchor,
      createdAt: ctx.now(),
    });
    if (inserted) {
      await emit({ type: "chatUpdated", chatId });
      return { strikeId };
    }
    const kept = await findMemoryStrike(ctx.db, chatId, identity);
    // The insert yielded only to the standing strike; a concurrent restore between the two statements is the one
    // way it is gone, and the item then reads as changed under the host.
    if (kept === undefined) {
      throw stale(chatId);
    }
    return { strikeId: kept.id };
  };
}

/** Idempotent like `deleteChatInjection`: a repeated or foreign strike id writes nothing and announces nothing. */
function createRestoreMemory(ctx: ChatContext, emit: EmitDurableChatEventOp): ChatService["restoreMemory"] {
  return async ({ principal, chatId, strikeId }: RestoreMemoryParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    if (await deleteMemoryStrike(ctx.db, chatId, strikeId)) {
      await emit({ type: "chatUpdated", chatId });
    }
  };
}

export function createMemoryStrikes(ctx: ChatContext, deps: { readonly emit: EmitDurableChatEventOp }): MemoryStrikeVerbs {
  return {
    memoryView: createMemoryView(ctx),
    strikeMemory: createStrikeMemory(ctx, deps.emit),
    restoreMemory: createRestoreMemory(ctx, deps.emit),
  };
}

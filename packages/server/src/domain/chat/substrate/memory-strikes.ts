// domain/chat/substrate/memory-strikes — the substrate seam between the memory-strike verbs and the `memory/`
// subsystem (`domain-substrate-mediates-subsystems`): the view's read, the strike's write and the strike carries the
// roster verbs owe. The verbs own the gates and the emits; this file owns what a strike names and what the view
// lists.
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

import type { HistoryFloorSeq, MemoryItemKey, MemoryItemView, MemoryView, UnmatchedStrikeView } from "@orb/contracts/chat";
import { memoryViewStatus, NO_HISTORY_FLOOR } from "@orb/contracts/chat";
import type { BatchStmt } from "@orb/db/query";
import type { CharacterId, ChatId, ChatMemoryStrikeId, UserId } from "@orb/kit/ids";
import { matchStrikes } from "@orb/kit/recall";
import type { ChatContext } from "../contract/context.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import { resolveCfg } from "../memory/constants.ts";
import {
  copySharedStrikesStatements,
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
  restampMemoryStrikesStatement,
} from "../memory/persistence/strikes.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import { loadMaxMessageSeq } from "../persistence/queries.ts";
import { loadPresentHostUserId } from "../persistence/reactions.ts";

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

/** The room's memory as the caller may see it, below their history floor clamped away. */
export async function buildMemoryView(ctx: ChatContext, args: { readonly chatId: ChatId; readonly floor: HistoryFloorSeq }): Promise<MemoryView> {
  const { chatId, floor } = args;
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
}

function stale(chatId: ChatId): ChatOperationError {
  return new ChatOperationError(CHAT_OP_CODES.memoryItemStale, `chat ${chatId}: the remembered item has changed since it was read`);
}

/** Strike the item the key names, or find the strike already on it. `inserted` says whether a row landed. */
export async function writeMemoryStrike(
  ctx: ChatContext,
  args: { readonly chatId: ChatId; readonly hostUserId: UserId; readonly item: MemoryItemKey },
): Promise<{ readonly strikeId: ChatMemoryStrikeId; readonly inserted: boolean }> {
  const { chatId, hostUserId, item } = args;
  const digest = await loadDigestAt(ctx.db, chatId, item);
  if (digest === undefined || digest.contentHash !== item.contentHash) {
    throw stale(chatId);
  }
  const cfg = resolveCfg(await ctx.resolveMemoryConfig(hostUserId));
  const [resolved] = await resolveDigestSpans(ctx.db, chatId, [digest], cfg.fanOut);
  if (resolved === undefined || resolved.span === null) {
    throw stale(chatId);
  }
  const sharedBucket = await resolveSharedBucket(ctx, chatId, hostUserId);
  const identity = {
    scopedCharacterId: digest.scopedCharacterId === sharedBucket ? null : digest.scopedCharacterId,
    tier: digest.tier,
    messageStartId: resolved.span.startId,
    messageEndId: resolved.span.endId,
  };
  const strikeId = ctx.newMemoryStrikeId();
  const row = { ...identity, id: strikeId, chatId, contentHash: digest.contentHash, topicAnchor: digest.topicAnchor, createdAt: ctx.now() };
  if (await insertMemoryStrike(ctx.db, row)) {
    return { strikeId, inserted: true };
  }
  const kept = await findMemoryStrike(ctx.db, chatId, identity);
  // The insert yielded only to the standing strike; a concurrent restore between the two statements is the one
  // way it is gone, and the item then reads as changed under the host.
  if (kept === undefined) {
    throw stale(chatId);
  }
  return { strikeId: kept.id, inserted: false };
}

/** Remove one strike of this room. Returns true when a row moved. */
export async function dropMemoryStrike(ctx: ChatContext, chatId: ChatId, strikeId: ChatMemoryStrikeId): Promise<boolean> {
  return await deleteMemoryStrike(ctx.db, chatId, strikeId);
}

/** The strike carry a solo room owes when it gains its second character: until the group character exists, the
 *  shared bucket is the lone character (`gatherMemory`), so its shared-bucket strikes are copied onto that
 *  character's scoped bucket in the seat's batch (`copySharedStrikesStatements` holds why). */
export async function soloStrikeCarryStatements(
  ctx: ChatContext,
  args: { readonly chatId: ChatId; readonly hostUserId: UserId; readonly seated: readonly { readonly characterId: CharacterId }[] },
): Promise<BatchStmt[]> {
  const [sole, ...others] = args.seated;
  if (sole === undefined || others.length > 0 || (await ctx.findSyntheticGroupCharacter({ ownerId: args.hostUserId, chatId: args.chatId })) !== null) {
    return [];
  }
  return await copySharedStrikesStatements(ctx.db, { chatId: args.chatId, characterId: sole.characterId, newMemoryStrikeId: ctx.newMemoryStrikeId });
}

/** The handoff re-key of scoped strikes, beside the digests' re-key (`restampMemoryStrikesStatement`). */
export function restampMemoryStrikesVia(...args: Parameters<typeof restampMemoryStrikesStatement>): BatchStmt {
  return restampMemoryStrikesStatement(...args);
}

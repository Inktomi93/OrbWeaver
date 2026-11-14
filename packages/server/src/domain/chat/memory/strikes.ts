// domain/chat/memory/strikes — the memory view's read and the host's strike and restore, run after the verbs' gates
// (`verbs/memory-strikes.ts`) through `ChatContext.memoryStrikes`.
//
// A STRIKE NAMES A SPAN OF THE STORY. Recall leaves out every bucket's summary of a struck span and every longer
// summary retelling one (`matchStrikes` in `packages/kit/src/recall/index.ts`). So the view shows one struck entry per
// span (the item the host struck, else the first listed copy, else the shortest summary still retelling it once the
// scene's own summaries are gone) and marks every other item left out `retellsStruck`; a strike whose stored
// character is null (the shared bucket, or a character since deleted) is carried by the shared copy. A strike on an
// already struck span answers the standing strike; a restore lifts the span for every bucket.
//
// A MEMBER SEES ONLY WHAT THEIR FLOOR ALLOWS. An item is listed to a member with a D16 join floor only when the
// whole span it covers sits at or above that floor (containment, not overlap: a summary that straddles the floor
// retells history the member may not read). An item whose span cannot be resolved is not listed to them, and the
// unmatched-strike list (anchors of scenes that may be below the floor) is withheld. The host is never floored.
//
// STRIKE IDS GO TO THE HOST ONLY. A member may see that an item is struck and its text (it retells turns they can
// read), but only the host restores, so a member's view carries no strike id.
//
// THE STRIKE NAMES WHAT THE HOST READ. The item key carries the digest's content hash; a key whose digest is gone,
// was summarized again, or no longer resolves to its messages is refused `memory_item_stale`, never landed on
// whatever sits at that position now. The strike stores the covered span's endpoint message ids, so a re-summary
// of the same messages stays struck (`chat_memory_strikes` in `packages/db/src/schema/chat.ts`). The one place a
// strike leaves the prompt is recall (`dropStruck` in `recall/recall.ts`).

import type { HandoffCardPair, MemoryItemKey, MemoryItemStrikeView, MemoryItemView, MemoryView, UnmatchedStrikeView } from "@orb/contracts/chat";
import { memoryOffReason, memoryViewStatus, NO_HISTORY_FLOOR } from "@orb/contracts/chat";
import type { BatchStmt } from "@orb/db/query";
import type { CharacterId, ChatId, ChatMemoryStrikeId, UserId } from "@orb/kit/ids";
import type { ResolvedStrike, StrikeMatch } from "@orb/kit/recall";
import { matchStrikes } from "@orb/kit/recall";
import type { ChatContext, MemoryStrikeOps } from "#src/domain/chat/contract/context.ts";
import { CHAT_OP_CODES, ChatOperationError } from "#src/domain/chat/contract/errors.ts";
import { loadParticipants } from "#src/domain/chat/persistence/participants-read.ts";
import { loadMaxMessageSeq } from "#src/domain/chat/persistence/queries.ts";
import { loadPresentHostUserId } from "#src/domain/chat/persistence/reactions.ts";
import { classifyParticipant } from "#src/domain/chat/substrate/participant-actor.ts";
import { resolveCfg } from "./constants.ts";
import type { StoredMemoryStrike } from "./persistence/strikes.ts";
import {
  deleteSpanStrikes,
  findSpanStrike,
  IMPORTED_STRIKE_HASH,
  insertMemoryStrike,
  loadDigestAt,
  loadRecentWindowStart,
  loadResolvedStrikes,
  loadRoomDigests,
  loadSpeakersOf,
  resolveDigestSpans,
  restampMemoryStrikesStatement,
} from "./persistence/strikes.ts";

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

function spanKey(strike: Pick<StoredMemoryStrike, "tier" | "messageStartId" | "messageEndId">): string {
  return `${strike.tier}:${strike.messageStartId}:${strike.messageEndId}`;
}

type Strike = StoredMemoryStrike & ResolvedStrike;
interface Carried {
  readonly strike: Strike;
  readonly own: boolean;
}
interface CarrierRow {
  readonly scopedCharacterId: CharacterId;
  readonly tier: number;
}

// Per struck span, the listed summary of the scene itself: the copy in the bucket the host struck, else the first.
function ownCarriers<R extends CarrierRow>(visible: readonly R[], struck: ReadonlyMap<R, Strike>, sharedBucket: CharacterId | null): Map<string, R> {
  const own = new Map<string, R>();
  for (const d of visible) {
    const strike = struck.get(d);
    if (strike === undefined) {
      continue;
    }
    const struckBucket = strike.scopedCharacterId ?? sharedBucket;
    const current = own.get(spanKey(strike));
    if (current === undefined || (current.scopedCharacterId !== struckBucket && d.scopedCharacterId === struckBucket)) {
      own.set(spanKey(strike), d);
    }
  }
  return own;
}

// Per struck span with no listed summary of its own, the shortest listed summary still retelling it.
function retellingCarriers<R extends CarrierRow>(visible: readonly R[], covers: ReadonlyMap<R, Strike>, own: ReadonlyMap<string, R>): Map<string, R> {
  const retelling = new Map<string, R>();
  for (const d of visible) {
    const strike = covers.get(d);
    if (strike === undefined || own.has(spanKey(strike))) {
      continue;
    }
    const current = retelling.get(spanKey(strike));
    if (current === undefined || d.tier < current.tier) {
      retelling.set(spanKey(strike), d);
    }
  }
  return retelling;
}

// One listed entry carries each struck span, so the host can see and restore every strike leaving something out:
// the scene's own summary when one is listed, else, once the build dropped them, a longer summary retelling it.
function spanCarriers<R extends CarrierRow>(visible: readonly R[], match: StrikeMatch<R, Strike>, sharedBucket: CharacterId | null): Map<R, Carried> {
  const own = ownCarriers(visible, match.struck, sharedBucket);
  const carried = new Map<R, Carried>();
  for (const d of own.values()) {
    const strike = match.struck.get(d);
    if (strike !== undefined) {
      carried.set(d, { strike, own: true });
    }
  }
  for (const d of retellingCarriers(visible, match.coversStruck, own).values()) {
    const strike = match.coversStruck.get(d);
    if (strike !== undefined) {
      carried.set(d, { strike, own: false });
    }
  }
  return carried;
}

// A strike carried by a longer summary always reads as changed: the scene's own summary it was made on is gone.
function strikeView(carried: Carried, contentHash: string, isHost: boolean): MemoryItemStrikeView {
  const { strike } = carried;
  return {
    strikeId: isHost ? strike.id : null,
    changedSinceStrike: !carried.own || (strike.contentHash !== IMPORTED_STRIKE_HASH && strike.contentHash !== contentHash),
  };
}

// One entry per struck span that leaves nothing stored out.
function unmatchedSpans(strikes: readonly Strike[], match: StrikeMatch<unknown, Strike>, isHost: boolean): UnmatchedStrikeView[] {
  const matched = new Set([...match.struck.values(), ...match.coversStruck.values()].map(spanKey));
  const out = new Map<string, UnmatchedStrikeView>();
  for (const s of strikes) {
    const key = spanKey(s);
    if (!(matched.has(key) || out.has(key))) {
      out.set(key, { strikeId: isHost ? s.id : null, tier: s.tier, scopedCharacterId: s.scopedCharacterId, topicAnchor: s.topicAnchor });
    }
  }
  return [...out.values()];
}

export async function buildMemoryView(ctx: ChatContext, args: Parameters<MemoryStrikeOps["view"]>[0]): Promise<MemoryView> {
  const { chatId, floor, isHost } = args;
  const floored = floor !== NO_HISTORY_FLOOR;
  // The turn obeys the present host's switch; a room between hosts runs no turn, so it reads as the host's off.
  const hostUserId = await loadPresentHostUserId(ctx.db, chatId);
  const appModeOff = resolveCfg(ctx.readMemoryDefaults()).mode === "off";
  const cfg = hostUserId === null ? null : resolveCfg(await ctx.resolveMemoryConfig(hostUserId));
  const off = memoryOffReason({ appModeOff, hostEnabled: cfg !== null && cfg.mode !== "off" });
  if (off !== null || hostUserId === null || cfg === null) {
    return { status: { kind: "off", reason: off ?? "host-off" }, items: [], unmatchedStrikes: [], recentWindowStartsAt: null };
  }
  const [stored, strikes, sharedBucket, maxSeq, windowStart] = await Promise.all([
    loadRoomDigests(ctx.db, chatId),
    loadResolvedStrikes(ctx.db, chatId),
    resolveSharedBucket(ctx, chatId, hostUserId),
    loadMaxMessageSeq(ctx.db, chatId),
    loadRecentWindowStart(ctx.db, chatId),
  ]);
  const resolved = await resolveDigestSpans(ctx.db, chatId, stored, cfg.fanOut);
  const visible = floored ? resolved.filter((d) => d.seqSpan !== null && d.seqSpan.seqStart >= floor) : resolved;
  // Matched over every stored item, so a strike on a scene below the member's floor never reads as unmatched.
  const match = matchStrikes(resolved, strikes);
  const carrier = spanCarriers(visible, match, sharedBucket);
  const speakers = await loadSpeakersOf(
    ctx.db,
    visible.map((d) => d.id),
  );
  const items = visible.map((d): MemoryItemView => {
    const carried = carrier.get(d);
    return {
      key: { tier: d.tier, blockIdx: d.blockIdx, scopedCharacterId: d.scopedCharacterId, contentHash: d.contentHash },
      bucket: d.scopedCharacterId === sharedBucket ? "shared" : "scoped",
      topicAnchor: d.topicAnchor,
      text: d.text,
      keywords: [...d.keywords],
      speakers: speakers.get(d.id) ?? [],
      strike: carried === undefined ? null : strikeView(carried, d.contentHash, isHost),
      retellsStruck: carried === undefined && (match.struck.has(d) || match.coversStruck.has(d)),
    };
  });
  return {
    status: memoryViewStatus({
      maxSeq,
      verbatimWindow: cfg.verbatimWindow,
      blockSize: cfg.blockSize,
      storedItems: resolved.length,
      listedItems: items.length,
    }),
    items,
    unmatchedStrikes: floored ? [] : unmatchedSpans(strikes, match, isHost),
    // A boundary below the member's floor means everything they may read was in the reply's window.
    recentWindowStartsAt: windowStart === null || windowStart.seq < floor ? null : windowStart.id,
  };
}

function stale(chatId: ChatId): ChatOperationError {
  return new ChatOperationError(CHAT_OP_CODES.memoryItemStale, `chat ${chatId}: the remembered item has changed since it was read`);
}

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
  const span = { tier: digest.tier, messageStartId: resolved.span.startId, messageEndId: resolved.span.endId };
  const standing = await findSpanStrike(ctx.db, chatId, span);
  if (standing !== undefined) {
    return { strikeId: standing.id, inserted: false };
  }
  const sharedBucket = await resolveSharedBucket(ctx, chatId, hostUserId);
  const strikeId = ctx.newMemoryStrikeId();
  const row = {
    ...span,
    scopedCharacterId: digest.scopedCharacterId === sharedBucket ? null : digest.scopedCharacterId,
    id: strikeId,
    chatId,
    contentHash: digest.contentHash,
    topicAnchor: digest.topicAnchor,
    createdAt: ctx.now(),
  };
  if (await insertMemoryStrike(ctx.db, row)) {
    return { strikeId, inserted: true };
  }
  // The insert yielded to a strike that landed after the read; a concurrent restore between the two statements
  // is the one way it is gone again, and the item then reads as changed under the host.
  const kept = await findSpanStrike(ctx.db, chatId, span);
  if (kept === undefined) {
    throw stale(chatId);
  }
  return { strikeId: kept.id, inserted: false };
}

export async function restoreMemoryStrike(ctx: ChatContext, args: Parameters<MemoryStrikeOps["restore"]>[0]): Promise<boolean> {
  return await deleteSpanStrikes(ctx.db, args.chatId, args.strikeId);
}

export function restampStrikesForHandoff(ctx: ChatContext, chatId: ChatId, pairs: readonly HandoffCardPair[]): BatchStmt[] {
  return pairs.map((c) => restampMemoryStrikesStatement(ctx.db, chatId, c.sourceCharacterId, c.characterId));
}

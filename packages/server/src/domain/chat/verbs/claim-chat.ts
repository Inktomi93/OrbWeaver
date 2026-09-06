// domain/chat/verbs/claim-chat — THE CLAIM CHOKEPOINT (chat-creation draft-mode replacement, R0 §4.2/§4.5/§4.7).
//
// A room minted by `startChat` is born a HUSK (`chats.started_at` NULL): real, reloadable, deep-linkable, and
// HIDDEN from every member's library list. CLAIMING is the one-way transition that makes it a normal chat.
// This file owns that transition and NOTHING else decides it: every qualifying verb calls the injected
// `ClaimChatOp` and stays ignorant of the column, the stats timing and the fan.
//
// WHAT CLAIMS (F4(a), owner-ratified — the owner's words are "never started OR DID SOMETHING WITH"):
//   • a user line committed (`send` / `commitMessage`, via `commitUserTurn`)
//   • a generated turn run — including the founding `opening:"generate"` (via `resolveTurnBase`,
//     `forceCharacterTurn`, `generateImage`, `postNarratorMessage`, `start-chat`'s opening arm)
//   • a canon EDIT (edit/hide/delete/move/duplicate/reattribute/variant-select — `verbs/edit.ts`)
//   • any explicit chat-row or config write (title/star/archive/anchor/variables/user-macros/injections;
//     group config, room overrides, databank visibility, background, display scripts, tool-recurse limit;
//     a roster change; minting an invite)
// What deliberately does NOT claim: pure navigation, unsent composer text, and every READ. Deleting or
// reaping the room does not claim it either (the row is going away).
//
// THE ORDERING INVARIANT (load-bearing — a violation double-counts economics):
// **a verb claims BEFORE it writes.** The claim replays the creation-time stats deltas over the canon that
// exists AT CLAIM (§4.7 moved them off `startChat`, so a husk nobody started never inflates chat-created
// economics and never consumes a character's first-chat bump). Claim after the write and the claiming
// activity's own row would be counted twice — once by its own delta builder, once by the replay.
//
// The replay uses the CHAT ROW's `createdAt` as the creation delta's clock, not the claim instant: the stats
// rebuild buckets `chatsCreated` by `chats.created_at` (`rebuild-from-canon.ts::loadChatMeta`), so claiming a
// day later must still land the room on the day it was created or the drift gate reds. Per-canon-row deltas
// bucket on their own `createdAt` already.

import { chats, messages, messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { ChatContext } from "../context.ts";
import type { ClaimChatOp } from "../contract/context.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { characterSeatedInAnotherChat, loadParticipants } from "../persistence/participants-read.ts";
import { hostUserIdOf } from "../substrate/participants-host.ts";
import { canonMessageDelta, chatCreatedDelta, seatChatDelta, swipeVariantDelta } from "../substrate/stats-delta.ts";

/** The canon present at claim (slots + every variant), the delta replay's input. */
interface ClaimCanon {
  readonly slots: readonly (typeof messages.$inferSelect)[];
  readonly variants: readonly (typeof messageVariants.$inferSelect)[];
}

/** Load the room's whole canon slot-by-slot with every variant — at claim this is the seeded greeting set
 *  (and nothing else, by the ordering invariant), but the read is total so the replay can never under-count. */
async function loadClaimCanon(ctx: ChatContext, chatId: ChatId): Promise<ClaimCanon> {
  const slots = await ctx.db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.seq));
  if (slots.length === 0) {
    return { slots, variants: [] };
  }
  const variants = await ctx.db
    .select()
    .from(messageVariants)
    .where(
      inArray(
        messageVariants.messageId,
        slots.map((s) => s.id),
      ),
    );
  return { slots, variants };
}

/** The creation-stats replay: the chat-created counters (+ a census and first-chat bump per founding seat) and
 *  every canon row present at claim. Mirrors `verbs/fork.ts::pushForkStatsDeltas` fold-for-fold — the two
 *  differ only in their head delta (`forked`), and both mirror the rebuild's folds (the drift-gate contract). */
async function pushClaimStatsDeltas(
  ctx: ChatContext,
  stmts: BatchStmt[],
  args: { readonly chatId: ChatId; readonly ownerId: UserId; readonly characterIds: readonly CharacterId[]; readonly createdAt: number; readonly now: number },
): Promise<void> {
  const { chatId, ownerId, characterIds, createdAt, now } = args;
  // The firstness probe runs at CLAIM, not at creation: the room's own seats are already inserted, so the
  // `excludeChatId` belt is what keeps them out of the answer, and the probe's husk arm keeps every OTHER
  // unclaimed room out too (a husk must never consume a character's one first-chat bump — §4.7).
  const firstChat = await Promise.all(characterIds.map(async (characterId) => !(await characterSeatedInAnotherChat(ctx.db, characterId, chatId))));
  ctx.applyStatsDelta(
    stmts,
    ctx.db,
    chatCreatedDelta({ ownerId, characterId: characterIds[0] ?? null, forked: false, newCharacter: firstChat[0] === true, now: createdAt }),
  );
  // EVERY OTHER FOUNDING SEAT COUNTS THE ROOM TOO (#1147). The rebuild credits the room to each of its
  // character seats (`COUNT(DISTINCT cp.chat_id)`), so a seat that rode only an `owner_stats.characters`
  // bump left the live census reading 0 chats for every character seated after the first — the ordinary
  // group room. The seat delta carries no owner-grain `chats`, so the room still counts ONCE for the owner.
  for (const [idx, characterId] of characterIds.entries()) {
    if (idx > 0) {
      ctx.applyStatsDelta(stmts, ctx.db, seatChatDelta({ ownerId, characterId, forked: false, newCharacter: firstChat[idx] === true, now: createdAt }));
    }
  }
  const { slots, variants } = await loadClaimCanon(ctx, chatId);
  const variantsByMessage = new Map<string, (typeof messageVariants.$inferSelect)[]>();
  for (const v of variants) {
    variantsByMessage.set(v.messageId, [...(variantsByMessage.get(v.messageId) ?? []), v]);
  }
  for (const slot of slots) {
    const own = variantsByMessage.get(slot.id) ?? [];
    const selected = own.find((v) => v.id === slot.selectedVariantId);
    if (selected !== undefined) {
      ctx.applyStatsDelta(
        stmts,
        ctx.db,
        canonMessageDelta({
          ownerId,
          row: { ...selected, characterId: slot.characterId, role: slot.role, createdAt: slot.createdAt, selectedIdx: selected.idx, variantCount: own.length },
          sign: 1,
          now,
        }),
      );
    }
    for (const v of own) {
      if (v.id !== slot.selectedVariantId) {
        ctx.applyStatsDelta(
          stmts,
          ctx.db,
          swipeVariantDelta({ ownerId, row: { ...v, characterId: slot.characterId, msgCreatedAt: slot.createdAt }, sign: 1, now }),
        );
      }
    }
  }
}

/** Build the injected claim op. The stamp is a CONDITIONAL update (`WHERE started_at IS NULL`) in the SAME
 *  atomic batch as its replay deltas + canon-version bumps: `reconcileStats` can therefore never observe a
 *  claimed source row before the live projection is current. The composition-owned in-flight map serializes
 *  concurrent same-room callers; the `RETURNING` row count remains the transition test for the list fan.
 *
 *  A chatId that no longer exists stamps nothing and is a silent no-op: every caller is a verb that already
 *  gated on membership, so a vanished row means the room was deleted concurrently, not that the caller lied. */
export function createClaimChat(ctx: ChatContext): ClaimChatOp {
  const active = new Map<ChatId, Promise<void>>();

  const claimOnce = async (chatId: ChatId): Promise<void> => {
    const now = ctx.now();
    const [candidate] = await ctx.db
      .select({ createdAt: chats.createdAt })
      .from(chats)
      .where(and(eq(chats.id, chatId), isNull(chats.startedAt)))
      .limit(1);
    if (candidate === undefined) {
      return;
    }
    const participants = await loadParticipants(ctx.db, chatId);
    // D18: the room has no owner column — the stats owner is the HOST SEAT, looked up from the loaded
    // roster (`substrate/participants-host`, the one home for role→identity), never an owner comparison.
    const hostUserId = hostUserIdOf(participants);
    // A hostless room (an archived orphan / a racing delete) has nobody to attribute economics to, so the
    // replay is skipped — but the visibility flip still lands: the row is claimed either way.
    const statements: BatchStmt[] = [
      batchStmt(
        ctx.db
          .update(chats)
          .set({ startedAt: now })
          .where(and(eq(chats.id, chatId), isNull(chats.startedAt)))
          .returning({ id: chats.id }),
      ),
    ];
    if (hostUserId !== null) {
      const characterIds = participants.flatMap((r) => {
        const actor = classifyParticipant(r);
        return actor?.kind === "character" ? [actor.characterId] : [];
      });
      await pushClaimStatsDeltas(ctx, statements, { chatId, ownerId: hostUserId, characterIds, createdAt: candidate.createdAt, now });
    }
    const results = await ctx.db.batch(batchMany(statements));
    const stamped = results[0] as readonly { readonly id: ChatId }[];
    if (stamped.length === 0) {
      return;
    }
    // The hidden→visible flip IS a list change on every member device (§4.5). The per-chat `emit` is NOT
    // fanned here: the claiming verb already emits its own room event, and a room the viewer could not see
    // has no subscribers to tell.
    await ctx.emitChatChanged(chatId, { detail: true });
  };

  const claim: ClaimChatOp = async (chatId) => {
    const incumbent = active.get(chatId);
    if (incumbent !== undefined) {
      // @orb-gate-ignore caught-failure-ownership(promise:incumbent): retried, not swallowed — a failed
      // incumbent claim is retried via `claim(chatId)`, whose returned promise is awaited here, so a final
      // rejection still propagates to this caller. Ends if the retry needs a bound (unbounded today).
      await incumbent.catch(() => claim(chatId));
      return;
    }
    const current = claimOnce(chatId);
    active.set(chatId, current);
    try {
      await current;
    } finally {
      if (active.get(chatId) === current) {
        active.delete(chatId);
      }
    }
  };
  return claim;
}

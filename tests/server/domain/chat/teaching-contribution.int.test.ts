// The B7/MR4 reaction-attribution contributor (`chat.reaction-attribution`) over a REAL db — the unit
// suite pins the registry order and the react-attach matrix; THIS one proves the loop's behavior at the
// level the unit tier cannot see: what the read returns becomes note LINES, bounded and honest.
//   · the plane knob OFF ⇒ EMPTY_COLLECTION without touching the db (the verdict silences the loop);
//   · no reactions ⇒ EMPTY_COLLECTION (the A1 per-contributor byte-identity — a reaction-free room's
//     prompt is byte-identical to a pre-B7 tree);
//   · a reaction ⇒ ONE depth-0 `in_chat` system injection, the reactor named by DISPLAY identity
//     (character name / persona name / "A member" — never a raw id);
//   · a segment note quotes the STORED snippet and names whose line; a STALE anchor (canon moved)
//     DEGRADES to a whole-message note rather than mis-attributing a quote;
//   · the per-message K cap keeps the most-recent K (a brigaded message cannot blow the prompt budget).

import { REACTION_ATTRIBUTION_MAX_PER_MESSAGE, REACTION_EMOJIS } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import type { ChatId, ChatParticipantId, Handle, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { beforeEach } from "vitest";
import type { TeachingContext, TeachingContribution } from "../../../../packages/server/src/domain/chat/contract/context.ts";
import type { StoredSegmentAnchor } from "../../../../packages/server/src/domain/chat/contract/params.ts";
import { insertReaction } from "../../../../packages/server/src/domain/chat/persistence/reactions.ts";
import { createChatTeachingContributions } from "../../../../packages/server/src/domain/chat/teaching-contribution.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { FROZEN_AT, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "./_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

function attribution(): TeachingContribution {
  const found = createChatTeachingContributions({ db }).find((c) => c.id === "chat.reaction-attribution");
  if (found === undefined) {
    throw new Error("chat.reaction-attribution is not registered");
  }
  return found;
}

function tctxFor(chatId: ChatId, over: { readonly reactionsEnabled?: boolean } = {}): TeachingContext {
  return {
    chatId,
    runAsUserId: castId<UserId>("user_host"),
    knobs: { offerChoices: false, charactersCanReact: false, reactionsEnabled: over.reactionsEnabled ?? true },
    prose: {},
    identity: { user: "Alex", char: "Aria" },
    rpgGather: null,
  };
}

async function react(row: {
  readonly variantId: MessageVariantId;
  readonly seat: ChatParticipantId;
  readonly emoji: string;
  readonly at: number;
  readonly segment?: StoredSegmentAnchor;
}): Promise<void> {
  await insertReaction(db, {
    id: mintTypeId(ID_PREFIX.messageReaction),
    variantId: row.variantId,
    reactorParticipantId: row.seat,
    emoji: row.emoji,
    segment: row.segment ?? null,
    createdAt: row.at,
  });
}

/** A room with a host, a reacting CHARACTER seat named `Cass`, and one committed slot. */
async function seedRoom(key: string): Promise<{ readonly chatId: ChatId; readonly cassSeat: ChatParticipantId; readonly variantId: MessageVariantId }> {
  const host = await seedUser(db, castId<Handle>(`h-${key}`));
  const chatId = await seedChat(db, key);
  await seedParticipant(db, { chatId, key: `h-${key}`, userId: host, role: "host" });
  const cass = await seedCharacter(db, host, "Cass");
  const cassSeat = await seedParticipant(db, { chatId, key: `c-${key}`, characterId: cass });
  const { variantId } = await seedMessage(db, chatId, 1, { content: "A reply worth reacting to." });
  return { chatId, cassSeat, variantId };
}

test("no reactions ⇒ EMPTY_COLLECTION, and the plane knob OFF silences a room that HAS reactions", async () => {
  const { chatId, cassSeat, variantId } = await seedRoom("a");

  // The byte-identity arm: nothing reacted, nothing injected.
  expect(await attribution().collect(tctxFor(chatId))).toEqual({ injections: [], toolNames: [] });

  await react({ variantId, seat: cassSeat, emoji: "🔥", at: FROZEN_AT + 1 });
  // The knob is the RESOLVED verdict the turn build hands in — OFF means the loop contributes nothing
  // even though rows exist (the same silencing the wire read enforces for the pills).
  expect(await attribution().collect(tctxFor(chatId, { reactionsEnabled: false }))).toEqual({ injections: [], toolNames: [] });
});

test("a whole-message reaction becomes ONE depth-0 in_chat system note naming the reactor's DISPLAY identity", async () => {
  const { chatId, cassSeat, variantId } = await seedRoom("b");
  await react({ variantId, seat: cassSeat, emoji: "🔥", at: FROZEN_AT + 1 });

  const out = await attribution().collect(tctxFor(chatId));
  expect(out.toolNames).toEqual([]);
  expect(out.injections).toEqual([
    {
      position: "in_chat",
      depth: 0,
      role: "system",
      content: '[Cass reacted with 🔥 to the message: "A reply worth reacting to."]',
    },
  ]);
});

test("a persona-less HUMAN reactor reads as 'A member' — never a raw id", async () => {
  const { chatId, variantId } = await seedRoom("c");
  const plain = await seedUser(db, castId<Handle>("plain-c"));
  const plainSeat = await seedParticipant(db, { chatId, key: "m-c", userId: plain });
  await react({ variantId, seat: plainSeat, emoji: "👍", at: FROZEN_AT + 1 });

  const out = await attribution().collect(tctxFor(chatId));
  expect(out.injections[0]?.content).toBe('[A member reacted with 👍 to the message: "A reply worth reacting to."]');
});

test("a segment note quotes the STORED snippet and names whose line; a STALE anchor degrades to whole-message", async () => {
  const host = await seedUser(db, castId<Handle>("h-seg"));
  const chatId = await seedChat(db, "seg");
  await seedParticipant(db, { chatId, key: "h-seg", userId: host, role: "host" });
  const alice = await seedCharacter(db, host, "Alice");
  const bob = await seedCharacter(db, host, "Bob");
  const aliceSeat = await seedParticipant(db, { chatId, key: "seg-alice", characterId: alice });
  await seedParticipant(db, { chatId, key: "seg-bob", characterId: bob });
  const { variantId } = await seedMessage(db, chatId, 1, { kind: "narrator", content: "Alice: Hello there.\nBob: Fine day." });

  // A LIVE anchor (Bob's line, snippet matching the current canon) and a STALE one (the snippet no
  // longer prefixes span 0 — the shape a later edit leaves behind).
  await react({
    variantId,
    seat: aliceSeat,
    emoji: "😂",
    at: FROZEN_AT + 1,
    segment: { segmentIndex: 1, segmentSpeaker: "Bob", segmentSnippet: "Bob: Fine day." },
  });
  await react({
    variantId,
    seat: aliceSeat,
    emoji: "😮",
    at: FROZEN_AT + 2,
    segment: { segmentIndex: 0, segmentSpeaker: "Alice", segmentSnippet: "Alice: something replaced" },
  });

  const out = await attribution().collect(tctxFor(chatId));
  // Asserted WHOLE (the degrade note quotes the message head, whose own `\n` survives — a line split
  // would tear it): the live anchor names Bob's line and quotes the stored snippet; the stale one is
  // re-judged at inject time through the ONE kit rule and DEGRADED — the quote is the message's own
  // head, never the dead snippet against the wrong line.
  expect(out.injections[0]?.content).toBe(
    '[Alice reacted with 😂 to Bob\'s line: "Bob: Fine day."]\n[Alice reacted with 😮 to the message: "Alice: Hello there.\nBob: Fine day."]',
  );
});

test("the per-message K cap keeps the MOST-RECENT K notes", async () => {
  const { chatId, cassSeat, variantId } = await seedRoom("k");
  // One row per vocabulary emoji (the whole-message unique caps one per (seat, emoji)) — 10 rows, K = 8.
  for (const [i, emoji] of REACTION_EMOJIS.entries()) {
    await react({ variantId, seat: cassSeat, emoji, at: FROZEN_AT + 1 + i });
  }

  const out = await attribution().collect(tctxFor(chatId));
  const lines = out.injections[0]?.content.split("\n") ?? [];
  expect(lines).toHaveLength(REACTION_ATTRIBUTION_MAX_PER_MESSAGE);
  // The tail slice: the two OLDEST (the first two emojis inserted) fell off.
  const expected = REACTION_EMOJIS.slice(REACTION_EMOJIS.length - REACTION_ATTRIBUTION_MAX_PER_MESSAGE);
  expect(lines.map((l) => /reacted with (\S+) to/.exec(l)?.[1])).toEqual([...expected]);
});

// verbs: toggleReaction + listReactions (B6/MR0-MR1) + the B7 additions (the segment anchor, the
// reactions-enabled posture gate, `createReactAsCharacter`) against a real libSQL db. What it proves, in
// the order the plane's own header claims it: the toggle is IDEMPOTENT IN BOTH DIRECTIONS by the partial
// UNIQUEs (never by writer discipline); it announces on the bus ONLY when a row actually moved; the
// grouping is a READ projection over one row per reactor (two members' 👍 is ONE chip with two reactors,
// not two chips — and B7: per TARGET, a whole-message 😂 and a line-anchored 😂 are different chips); the
// anchor is the VARIANT (a sibling swipe carries its own set, and a variant delete CASCADES); both gates
// bite — a non-member's chatId and a member's foreign/below-floor variantId are the SAME leak-free
// NOT_FOUND; the B7 posture gate is ENFORCED here (refused/answered, not merely hidden client-side); and a
// segment CLAIM is validated against the SERVER's own canon parse, never stored from the wire.
//
// The two gates are probed SEPARATELY on purpose. The cross-tenant sweep proves the chatId chokepoint over
// the whole router; what it cannot reach is the second belt, because a stranger is refused before the
// variant is ever loaded — so the foreign-variant case is a MEMBER of their own room aiming at another, and
// it can only be probed here.

import type { DurableChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { messageReactions, messageVariants } from "@orb/db";
import type { ChatId, Handle, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import { createReactAsCharacter, createReactions } from "../../../../../packages/server/src/domain/chat/verbs/reactions.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { addVariant, makeChatContext, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../_support.ts";

let db: Db;
let emitted: DurableChatBusEvent[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
});

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

/** The verb pair over the test db. `hostDefaults` overrides the injected `readReactionDefaults` op (the
 *  `_support` default is the shipped posture: plane ON, react tool OFF). */
function reactions(hostDefaults?: { readonly charactersCanReact: boolean; readonly reactionsEnabled: boolean }): ReturnType<typeof createReactions> {
  const ctx = makeChatContext(db, hostDefaults === undefined ? {} : { readReactionDefaults: () => Promise.resolve(hostDefaults) });
  return createReactions(ctx, {
    emit: (event) => {
      emitted.push(event);
      return Promise.resolve();
    },
  });
}

/** A room with a host + a plain member, and one committed assistant slot to react to. */
async function seedRoom(
  key = "a",
  metadata?: Record<string, unknown>,
): Promise<{
  readonly host: UserId;
  readonly member: UserId;
  readonly chatId: ChatId;
  readonly messageId: Awaited<ReturnType<typeof seedMessage>>["messageId"];
  readonly variantId: MessageVariantId;
}> {
  const host = await seedUser(db, castId<Handle>(`host-${key}`));
  const member = await seedUser(db, castId<Handle>(`member-${key}`));
  const chatId = await seedChat(db, key, metadata === undefined ? {} : { metadata });
  await seedParticipant(db, { chatId, key: `h-${key}`, userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: `m-${key}`, userId: member, role: "member" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1);
  return { host, member, chatId, messageId, variantId };
}

/** A narrator-voiced two-speaker body + the two PRESENT character seats its plain labels key off.
 *  Spans: [0] Alice's line · [1] Bob's line (label text stays in its span — the kit grammar). */
const NARRATOR_BODY = "Alice: Hello there.\nBob: Fine day.";
async function seedNarratorRoom(key: string): Promise<Awaited<ReturnType<typeof seedRoom>>> {
  const room = await seedRoom(key);
  const alice = await seedCharacter(db, room.host, "Alice");
  const bob = await seedCharacter(db, room.host, "Bob");
  await seedParticipant(db, { chatId: room.chatId, key: `${key}-alice`, characterId: alice });
  await seedParticipant(db, { chatId: room.chatId, key: `${key}-bob`, characterId: bob });
  const { messageId, variantId } = await seedMessage(db, room.chatId, 2, { kind: "narrator", content: NARRATOR_BODY });
  return { ...room, messageId, variantId };
}

describe("toggleReaction — the write path", () => {
  test("adds, then REMOVES on the second press; each press emits exactly one reactionsChanged", async () => {
    const { host, chatId, messageId, variantId } = await seedRoom();
    const verb = reactions();

    expect(await verb.toggleReaction({ principal: principal(host), chatId, variantId, emoji: "👍" })).toBe(true);
    expect(await db.select().from(messageReactions)).toHaveLength(1);
    expect(await verb.toggleReaction({ principal: principal(host), chatId, variantId, emoji: "👍" })).toBe(false);
    expect(await db.select().from(messageReactions)).toHaveLength(0);

    // The emit carries the DIRECTION and the reacted slot — what the `reactionsChanged` trigger fact projects.
    expect(emitted).toEqual([
      { type: "reactionsChanged", chatId, messageId, variantId, emoji: "👍", added: true },
      { type: "reactionsChanged", chatId, messageId, variantId, emoji: "👍", added: false },
    ]);
  });

  test("two members' same emoji are TWO rows and ONE chip — the grouping is a read projection", async () => {
    const { host, member, chatId, variantId } = await seedRoom();
    const verb = reactions();

    await verb.toggleReaction({ principal: principal(host), chatId, variantId, emoji: "😂" });
    await verb.toggleReaction({ principal: principal(member), chatId, variantId, emoji: "😂" });

    expect(await db.select().from(messageReactions)).toHaveLength(2);
    const { groups } = await verb.listReactions({ principal: principal(host), chatId });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.emoji).toBe("😂");
    expect(groups[0]?.reactorParticipantIds).toHaveLength(2);
    // Each seat removes only its OWN row — the keyed DELETE, not the chip.
    await verb.toggleReaction({ principal: principal(member), chatId, variantId, emoji: "😂" });
    expect((await verb.listReactions({ principal: principal(host), chatId })).groups[0]?.reactorParticipantIds).toHaveLength(1);
  });

  test("a NON-MEMBER's toggle is a leak-free NOT_FOUND and writes nothing", async () => {
    const { chatId, variantId } = await seedRoom();
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const verb = reactions();

    const err = await verb.toggleReaction({ principal: principal(stranger), chatId, variantId, emoji: "🔥" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe("ChatNotFoundError");
    expect(await db.select().from(messageReactions)).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  test("a MEMBER aiming a FOREIGN room's variantId at their own chat is refused — the variant's own belt", async () => {
    const a = await seedRoom("a");
    const b = await seedRoom("b");
    const verb = reactions();

    // `a.host` is a real member of chat A, and `b.variantId` is a REAL variant — of somebody else's room.
    // The chatId gate passes; the belt this test exists for is what refuses.
    const err = await verb.toggleReaction({ principal: principal(a.host), chatId: a.chatId, variantId: b.variantId, emoji: "👀" }).catch((e: unknown) => e);
    expect((err as Error).name).toBe("ChatNotFoundError");
    expect(await db.select().from(messageReactions)).toHaveLength(0);
  });

  test("a `from-join` member cannot react BELOW their own D16 floor", async () => {
    const host = await seedUser(db, castId<Handle>("host-f"));
    const late = await seedUser(db, castId<Handle>("late-f"));
    const chatId = await seedChat(db, "f");
    await seedParticipant(db, { chatId, key: "h-f", userId: host, role: "host" });
    // Joined at seq 5 with the OPT-IN restriction: seq 1 is pre-join canon they may not read.
    await seedParticipant(db, { chatId, key: "l-f", userId: late, role: "member", joinSeq: 5, joinHistoryVisibility: "from-join" });
    const old = await seedMessage(db, chatId, 1);
    const fresh = await seedMessage(db, chatId, 5);
    const verb = reactions();

    const err = await verb.toggleReaction({ principal: principal(late), chatId, variantId: old.variantId, emoji: "🎉" }).catch((e: unknown) => e);
    expect((err as Error).name).toBe("ChatNotFoundError");
    // …and the SAME member reacts freely at/above their floor (the floor is a clamp, never a block).
    expect(await verb.toggleReaction({ principal: principal(late), chatId, variantId: fresh.variantId, emoji: "🎉" })).toBe(true);
  });
});

// ── B7: the reactions-enabled POSTURE GATE — enforced at the verbs, never merely hidden ────────────────
describe("the reactions-enabled posture gate", () => {
  test("a room pinned OFF refuses the toggle CODED and answers the read empty-with-verdict", async () => {
    const { host, chatId, variantId } = await seedRoom("off", { reactionsEnabled: false });
    const verb = reactions();

    const err = await verb.toggleReaction({ principal: principal(host), chatId, variantId, emoji: "👍" }).catch((e: unknown) => e);
    // A coded posture refusal, NOT a NOT_FOUND collapse: the caller IS a member — they may know the host
    // turned the plane off (their own client hides the doors off this same verdict).
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("reactions_disabled");
    expect(await db.select().from(messageReactions)).toHaveLength(0);
    expect(emitted).toHaveLength(0);

    // The read is the verdict CARRIER, not a throw — it is how every member's client learns the posture.
    expect(await verb.listReactions({ principal: principal(host), chatId })).toEqual({ reactionsEnabled: false, groups: [] });
  });

  test("a never-pinned room INHERITS the host's per-user default — OFF refuses, and the room's own ON beats it", async () => {
    // The host's per-user default is OFF (the injected op — the verb resolves under the PRESENT HOST's
    // identity, never the caller's).
    const inheritRoom = await seedRoom("inh");
    const hostOff = reactions({ charactersCanReact: false, reactionsEnabled: false });
    const err = await hostOff
      .toggleReaction({ principal: principal(inheritRoom.member), chatId: inheritRoom.chatId, variantId: inheritRoom.variantId, emoji: "👍" })
      .catch((e: unknown) => e);
    expect((err as ChatOperationError).code).toBe("reactions_disabled");

    // The SAME host default, but this room explicitly pinned ON: the room's choice wins (the
    // resolveOfferChoices precedence, one resolver home).
    const pinnedRoom = await seedRoom("pin", { reactionsEnabled: true });
    const stillOff = reactions({ charactersCanReact: false, reactionsEnabled: false });
    expect(
      await stillOff.toggleReaction({ principal: principal(pinnedRoom.host), chatId: pinnedRoom.chatId, variantId: pinnedRoom.variantId, emoji: "👍" }),
    ).toBe(true);
  });

  test("a HOSTLESS room falls to the shipped floor (plane ON) — never a crash, never a silent off", async () => {
    // No host seat at all: `loadPresentHostUserId` misses and the resolve falls to DEFAULT_CHAT_BEHAVIOR.
    const solo = await seedUser(db, castId<Handle>("solo-hl"));
    const chatId = await seedChat(db, "hl");
    await seedParticipant(db, { chatId, key: "m-hl", userId: solo, role: "member" });
    const { variantId } = await seedMessage(db, chatId, 1);
    // The injected op would say OFF — but it is never consulted for a hostless room (no host identity to
    // resolve under), which is exactly what pins the DEFAULT_CHAT_BEHAVIOR floor as the fallback.
    const verb = reactions({ charactersCanReact: false, reactionsEnabled: false });

    expect(await verb.toggleReaction({ principal: principal(solo), chatId, variantId, emoji: "👍" })).toBe(true);
  });
});

// ── B7/MR3: the segment CLAIM — server-validated, server-derived, never stored from the wire ───────────
describe("toggleReaction — the segment anchor", () => {
  test("a VALID claim stores the SERVER's own parse (speaker + snippet from canon, not from the wire)", async () => {
    const { host, chatId, variantId } = await seedNarratorRoom("seg");
    const verb = reactions();

    expect(await verb.toggleReaction({ principal: principal(host), chatId, variantId, emoji: "😂", segmentIndex: 1, segmentSpeaker: "Bob" })).toBe(true);

    const [row] = await db.select().from(messageReactions);
    // The stored trio is the SERVER's derivation: the span's own label and its trimmed-head snippet —
    // the wire never carried either as free text.
    expect(row?.segmentIndex).toBe(1);
    expect(row?.segmentSpeaker).toBe("Bob");
    expect(row?.segmentSnippet).toBe("Bob: Fine day.");
    // The same claim toggles the same anchor OFF — the segment arm is a full toggle, not add-only.
    expect(await verb.toggleReaction({ principal: principal(host), chatId, variantId, emoji: "😂", segmentIndex: 1, segmentSpeaker: "Bob" })).toBe(false);
    expect(await db.select().from(messageReactions)).toHaveLength(0);
  });

  test("whole-message and segment are INDEPENDENT toggles that group as SEPARATE chips", async () => {
    const { host, chatId, variantId } = await seedNarratorRoom("ind");
    const verb = reactions();

    await verb.toggleReaction({ principal: principal(host), chatId, variantId, emoji: "😂" });
    await verb.toggleReaction({ principal: principal(host), chatId, variantId, emoji: "😂", segmentIndex: 1, segmentSpeaker: "Bob" });

    const { groups } = await verb.listReactions({ principal: principal(host), chatId });
    // Same emoji, same seat, same variant — TWO chips, because the TARGET differs (MA-2 §4).
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => [g.emoji, g.segmentIndex, g.segmentSpeaker, g.segmentSnippet])).toEqual([
      ["😂", null, null, null],
      ["😂", 1, "Bob", "Bob: Fine day."],
    ]);
  });

  test("a claim the server's parse REFUTES is `invalid_segment` — out-of-range AND wrong-speaker both refuse", async () => {
    const { host, chatId, variantId } = await seedNarratorRoom("bad");
    const verb = reactions();

    // Out of range: the body has two spans.
    const range = await verb
      .toggleReaction({ principal: principal(host), chatId, variantId, emoji: "👍", segmentIndex: 5, segmentSpeaker: "Bob" })
      .catch((e: unknown) => e);
    expect((range as ChatOperationError).code).toBe("invalid_segment");
    // Wrong speaker at a real index: span 0 is Alice's — a content/speaker race must REFUSE, never silently
    // land the click on somebody else's line.
    const wrong = await verb
      .toggleReaction({ principal: principal(host), chatId, variantId, emoji: "👍", segmentIndex: 0, segmentSpeaker: "Bob" })
      .catch((e: unknown) => e);
    expect((wrong as ChatOperationError).code).toBe("invalid_segment");
    expect(await db.select().from(messageReactions)).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  test("the narrator-voice gate: plain `Name:` labels split ONLY a narrator row; `<speaker>` tags split any row", async () => {
    const { host, chatId } = await seedNarratorRoom("gate");
    // A STANDARD row with the same plain-label body: the character-name set does NOT apply (any other kind is one
    // speaker's row, so `Alice:` is prose) — the body is ONE null span and the speaker claim refuses.
    const standard = await seedMessage(db, chatId, 3, { content: NARRATOR_BODY });
    const verb = reactions();
    const err = await verb
      .toggleReaction({ principal: principal(host), chatId, variantId: standard.variantId, emoji: "👍", segmentIndex: 1, segmentSpeaker: "Bob" })
      .catch((e: unknown) => e);
    expect((err as ChatOperationError).code).toBe("invalid_segment");

    // …but a `<speaker>` TAG is invisible markup, not prose — it splits unconditionally on BOTH sides
    // (the client parses tags on every kind too), so a tagged standard row accepts the claim.
    const tagged = await seedMessage(db, chatId, 4, { content: "<speaker>Alice</speaker>Well met." });
    expect(
      await verb.toggleReaction({ principal: principal(host), chatId, variantId: tagged.variantId, emoji: "👍", segmentIndex: 0, segmentSpeaker: "Alice" }),
    ).toBe(true);
    const [row] = await db.select().from(messageReactions);
    expect(row?.segmentSnippet).toBe("Well met.");
  });
});

// ── B7/MR5: `createReactAsCharacter` — the `react` tool's write half ───────────────────────────────────
describe("createReactAsCharacter", () => {
  /** The op over the test db, with the room's react-tool opt-in ON via metadata (the plane defaults ON). */
  function reactOp(): ReturnType<typeof createReactAsCharacter> {
    return createReactAsCharacter(makeChatContext(db), {
      emit: (event) => {
        emitted.push(event);
        return Promise.resolve();
      },
    });
  }

  test("attributes the reaction to the CHARACTER's seat on the newest slot, and narrates the target", async () => {
    // Opt in: the room pins charactersCanReact ON (the plane is ON by default).
    const { host, chatId } = await seedRoom("rc2", { charactersCanReact: true });
    const alice = await seedCharacter(db, host, "Alice-rc2");
    await seedParticipant(db, { chatId, key: "rc2-alice", characterId: alice });
    const newest = await seedMessage(db, chatId, 2, { content: "The last word." });
    const op = reactOp();

    const out = await op({ principal: principal(host), chatId, characterName: "Alice-rc2", emoji: "🔥" });
    expect(out).toEqual({ ok: true, alreadyReacted: false, character: "Alice-rc2", emoji: "🔥", target: "the whole message" });
    const rows = await db.select().from(messageReactions);
    expect(rows).toHaveLength(1);
    // ATTRIBUTED to the character's seat — never the executing principal's (the turn host merely drives).
    expect(rows[0]?.reactorParticipantId).toBe(castId("chat_participant_rc2-alice"));
    expect(rows[0]?.variantId).toBe(newest.variantId);
    expect(emitted.at(-1)).toEqual({ type: "reactionsChanged", chatId, messageId: newest.messageId, variantId: newest.variantId, emoji: "🔥", added: true });

    // ADD-ONLY: the model's retry must never un-react — the repeat lands on the partial unique and says so.
    const emitCount = emitted.length;
    const again = await op({ principal: principal(host), chatId, characterName: "Alice-rc2", emoji: "🔥" });
    expect(again).toMatchObject({ ok: true, alreadyReacted: true });
    expect(await db.select().from(messageReactions)).toHaveLength(1);
    expect(emitted).toHaveLength(emitCount);
  });

  test("`toSpeaker` anchors to that speaker's LAST line; an unmatched name DEGRADES to whole-message, narrated", async () => {
    const host = await seedUser(db, castId<Handle>("host-ts2"));
    const optIn = await seedChat(db, "ts2", { metadata: { charactersCanReact: true } });
    const alice = await seedCharacter(db, host, "Alice-ts2");
    const bob = await seedCharacter(db, host, "Bob-ts2");
    await seedParticipant(db, { chatId: optIn, key: "ts2-h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: optIn, key: "ts2-alice", characterId: alice });
    await seedParticipant(db, { chatId: optIn, key: "ts2-bob", characterId: bob });
    await seedMessage(db, optIn, 1, { kind: "narrator", content: "Alice-ts2: One.\nBob-ts2: Two.\nAlice-ts2: Three." });
    const op = reactOp();

    const anchored = await op({ principal: principal(host), chatId: optIn, characterName: "Bob-ts2", emoji: "😮", toSpeaker: "Alice-ts2" });
    // The LAST of Alice's spans (index 2) — "react to what they just said".
    expect(anchored).toMatchObject({ ok: true, target: "Alice-ts2's line" });
    const [row] = await db.select().from(messageReactions);
    expect(row?.segmentIndex).toBe(2);
    expect(row?.segmentSpeaker).toBe("Alice-ts2");
    expect(row?.segmentSnippet).toBe("Alice-ts2: Three.");

    // An unmatched name: the intent to react is clear, the spelling is not — whole-message, and SAY so.
    const degraded = await op({ principal: principal(host), chatId: optIn, characterName: "Bob-ts2", emoji: "😢", toSpeaker: "Zed" });
    expect(degraded).toMatchObject({ ok: true, target: 'the whole message (no line by "Zed" found in it)' });
  });

  test("every refusal is ERRORS-AS-DATA the model can narrate — posture off, unknown character, empty room", async () => {
    const op = reactOp();

    // The SHIPPED posture: charactersCanReact resolves OFF (no metadata, host default off) — the
    // write-side belt for a knob flipped mid-turn (the attach gate already keeps the tool off the wire).
    const shipped = await seedNarratorRoom("ref1");
    const off = await op({ principal: principal(shipped.host), chatId: shipped.chatId, characterName: "Alice", emoji: "👍" });
    expect(off).toEqual({ ok: false, reason: "Reactions by characters are turned off in this chat." });

    // The master switch outranks the opt-in: plane OFF + tool ON still refuses.
    const master = await seedRoom("ref2", { charactersCanReact: true, reactionsEnabled: false });
    const masterOut = await op({ principal: principal(master.host), chatId: master.chatId, characterName: "Alice", emoji: "👍" });
    expect(masterOut).toEqual({ ok: false, reason: "Reactions by characters are turned off in this chat." });

    // Unknown character: a legality answer, not a platform fault.
    const noChar = await seedRoom("ref3", { charactersCanReact: true });
    const noCharOut = await op({ principal: principal(noChar.host), chatId: noChar.chatId, characterName: "Nobody", emoji: "👍" });
    expect(noCharOut).toEqual({ ok: false, reason: 'No present character named "Nobody" in this chat — use a present character\'s exact name.' });

    // An empty room (a character seat exists; no message yet).
    const empty = await seedUser(db, castId<Handle>("host-ref4"));
    const emptyChat = await seedChat(db, "ref4", { metadata: { charactersCanReact: true } });
    const emptyAlice = await seedCharacter(db, empty, "Alice-ref4");
    await seedParticipant(db, { chatId: emptyChat, key: "ref4-h", userId: empty, role: "host" });
    await seedParticipant(db, { chatId: emptyChat, key: "ref4-alice", characterId: emptyAlice });
    const emptyOut = await op({ principal: principal(empty), chatId: emptyChat, characterName: "Alice-ref4", emoji: "👍" });
    expect(emptyOut).toEqual({ ok: false, reason: "There is no message to react to yet." });

    expect(await db.select().from(messageReactions)).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  // #1402a — THE D16 FLOOR ON THE TOOL'S OWN TARGET RESOLUTION. `loadNewestSelectedSlot` took the room's
  // newest slot with no floor predicate, while the sibling human path (`toggleReaction` →
  // `loadVariantSlotInChat`) has carried one since B6. Today's executing principal is the TURN's resolved
  // HOST (floor 0 — `entry/compose/chat-tools.ts`), so this is the op's OWN contract being held rather than a
  // live leak: `ReactAsCharacterParams` admits any member principal and the verb gates with
  // `requireParticipant`, so the target read must obey the CALLER's floor like every other canon read in the
  // domain (D106: membership and visibility are ONE answer). A clamped caller whose whole readable window is
  // empty gets the same "nothing to react to" answer an empty room gives — never a pre-join slot's ids.
  test("reactAsCharacter OBEYS THE D16 FLOOR — a from-join caller cannot react to (or learn of) a PRE-JOIN newest slot", async () => {
    const host = await seedUser(db, castId<Handle>("host-fl"));
    const late = await seedUser(db, castId<Handle>("late-fl"));
    const chatId = await seedChat(db, "fl", { metadata: { charactersCanReact: true } });
    const alice = await seedCharacter(db, host, "Alice-fl");
    await seedParticipant(db, { chatId, key: "fl-h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "fl-l", userId: late, role: "member", joinSeq: 5, joinHistoryVisibility: "from-join" });
    await seedParticipant(db, { chatId, key: "fl-alice", characterId: alice });
    const pre = await seedMessage(db, chatId, 1, { content: "before they walked in" });
    const op = reactOp();

    // The clamped caller: the room's newest slot is BELOW their floor, so there is nothing they may target.
    expect(await op({ principal: principal(late), chatId, characterName: "Alice-fl", emoji: "🔥" })).toEqual({
      ok: false,
      reason: "There is no message to react to yet.",
    });
    expect(await db.select().from(messageReactions)).toHaveLength(0);
    expect(emitted).toEqual([]);

    // POSITIVE CONTROL 1 — the HOST is unclamped, so the same call on the same slot lands.
    expect(await op({ principal: principal(host), chatId, characterName: "Alice-fl", emoji: "🔥" })).toMatchObject({ ok: true });
    expect((await db.select().from(messageReactions))[0]?.variantId).toBe(pre.variantId);

    // POSITIVE CONTROL 2 — a slot AT the clamped caller's own floor is theirs, and the tool works for them.
    const post = await seedMessage(db, chatId, 5, { content: "after they walked in" });
    expect(await op({ principal: principal(late), chatId, characterName: "Alice-fl", emoji: "😂" })).toMatchObject({ ok: true });
    expect(emitted.at(-1)).toMatchObject({ type: "reactionsChanged", messageId: post.messageId, variantId: post.variantId, emoji: "😂" });
  });

  // #1402b — A DISABLED (muted) CHARACTER SEAT MAY NOT AUTHOR. `disabled` is the seat kill-switch every
  // other speaking path honors (`isArbiterEligible` — never arbiter-selected, out of `{{groupNotMuted}}`),
  // and the react tool's attach gate is knob-level only (`teaching-contribution.ts` reads
  // `reactionsEnabled && charactersCanReact`, never a seat), so nothing upstream of this verb knows the seat
  // is muted. A muted character putting a reaction on the transcript is that seat SPEAKING.
  test("a DISABLED character seat cannot author a reaction — errors-as-data, while the enabled seat beside it works", async () => {
    const host = await seedUser(db, castId<Handle>("host-mu"));
    const chatId = await seedChat(db, "mu", { metadata: { charactersCanReact: true } });
    const muted = await seedCharacter(db, host, "Muted-mu");
    const live = await seedCharacter(db, host, "Live-mu");
    await seedParticipant(db, { chatId, key: "mu-h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "mu-muted", characterId: muted, disabled: true });
    await seedParticipant(db, { chatId, key: "mu-live", characterId: live });
    await seedMessage(db, chatId, 1, { content: "the last word" });
    const op = reactOp();

    expect(await op({ principal: principal(host), chatId, characterName: "Muted-mu", emoji: "🔥" })).toEqual({
      ok: false,
      reason: 'The character "Muted-mu" is muted in this chat and cannot react.',
    });
    expect(await db.select().from(messageReactions)).toHaveLength(0);
    expect(emitted).toEqual([]);

    // POSITIVE CONTROL — the un-muted seat in the same room, same call shape, still reacts.
    expect(await op({ principal: principal(host), chatId, characterName: "Live-mu", emoji: "🔥" })).toMatchObject({ ok: true });
    expect(await db.select().from(messageReactions)).toHaveLength(1);
  });
});

describe("the VARIANT anchor (D26)", () => {
  test("a sibling swipe carries its OWN set, and deleting a variant CASCADES its reactions", async () => {
    const { host, chatId, messageId, variantId } = await seedRoom();
    const sibling = await addVariant(db, messageId, 1, "a reroll");
    const verb = reactions();

    await verb.toggleReaction({ principal: principal(host), chatId, variantId, emoji: "❤️" });
    // The sibling swipe is a DIFFERENT generation — its own (empty) set, which is the whole reason the
    // anchor is the variant rather than the slot.
    const { groups } = await verb.listReactions({ principal: principal(host), chatId });
    expect(groups.filter((g) => g.variantId === sibling)).toHaveLength(0);
    expect(groups.filter((g) => g.variantId === variantId)).toHaveLength(1);

    await db.delete(messageVariants).where(eq(messageVariants.id, variantId));
    expect(await db.select().from(messageReactions)).toHaveLength(0);
  });
});

describe("listReactions — the read", () => {
  test("a NON-MEMBER is refused; a `from-join` member's window omits below-floor slots entirely", async () => {
    const host = await seedUser(db, castId<Handle>("host-r"));
    const late = await seedUser(db, castId<Handle>("late-r"));
    const stranger = await seedUser(db, castId<Handle>("stranger-r"));
    const chatId = await seedChat(db, "r");
    await seedParticipant(db, { chatId, key: "h-r", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "l-r", userId: late, role: "member", joinSeq: 5, joinHistoryVisibility: "from-join" });
    const old = await seedMessage(db, chatId, 1);
    await seedMessage(db, chatId, 5);
    const verb = reactions();

    // The HOST reacts to a pre-join message — real canon the clamped member may not read.
    await verb.toggleReaction({ principal: principal(host), chatId, variantId: old.variantId, emoji: "🤔" });

    expect((await verb.listReactions({ principal: principal(host), chatId })).groups).toHaveLength(1);
    // The clamped member's window is EMPTY — a pill row naming who reacted to a message they cannot see is
    // the same leak one seq lower. The VERDICT still answers true: the plane is on, their window is empty.
    expect(await verb.listReactions({ principal: principal(late), chatId })).toEqual({ reactionsEnabled: true, groups: [] });

    const err = await verb.listReactions({ principal: principal(stranger), chatId }).catch((e: unknown) => e);
    expect((err as Error).name).toBe("ChatNotFoundError");
  });
});

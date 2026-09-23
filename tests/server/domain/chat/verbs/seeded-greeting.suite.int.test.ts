// THE GREETING MALLEABILITY WINDOW (D166).
//
// A `.suite.` because the invariant is not one verb's: the WINDOW is opened by `startChat` (which seeds the
// greeting rows) and closed by `send` (whose `freezeGreetingVolatiles` bakes them), while the STEP is
// `setSeededGreeting`'s. A per-verb test can prove the step and still let the window be wrong at either end.
//
// The model under test:
//   • A seeded greeting is REAL CANON from the creation click (R1) — not a client-side preview.
//   • It stays MALLEABLE until the room's first USER turn. That turn is the freeze: volatile macros are
//     resolved into the variant (`freezeGreetingVolatiles`, verbs/turn.ts), so stepping afterwards would
//     discard drawn values and rewrite settled canon.
//   • Inside the window the HOST may step it onto another of the character card's alternates. The verb takes
//     an INDEX and resolves the bytes from the card — the caller never supplies content, so this host-gated
//     door cannot become a second free-text write beside `editMessage`'s author-or-host one.
//
// EACH REFUSAL ARM CARRIES A PLANTED POSITIVE CONTROL — the same call, one fixture fact changed, asserted to
// SUCCEED. A refusal test that would also pass with the belt deleted proves nothing; the paired success is
// what makes each `expect(...).rejects` a statement about the belt rather than about the fixture.

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { messageVariants } from "@orb/db";
import type { CharacterId, ChatId, Handle, MessageId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { ChatNotFoundError, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import { createEdit } from "../../../../../packages/server/src/domain/chat/verbs/edit.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, noClaim, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../_support.ts";

let db: Db;
let emitted: ChatBusEvent[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
});

const emit = (event: ChatBusEvent): Promise<void> => {
  emitted.push(event);
  return Promise.resolve();
};

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

const ALT_0 = "The night market hums.";
const ALT_1 = "She looks up from the ledger.";
const ALT_2 = "Rain, again.";
/** The card's openings, in card order — the strip's `n / m` domain and the verb's index space. */
const ALTERNATES = [ALT_0, ALT_1, ALT_2];
/** What a card edited AFTER the seed now says at index 1 — the verb must serve the card's CURRENT bytes. */
const REWRITTEN_FIRST = "A rewritten opening.";
const REWRITTEN_ALT = "And its rewritten alternate.";

/** The card the verb re-reads to resolve an index. */
function cardWith(greetings: readonly string[]): CharacterCard {
  // @orb-waive no-test-fabrication(never): this path reads exactly one field (`greetings`) — a full CharacterCard literal would be twenty nulls of noise around it. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return { name: "Aria", greetings: greetings.map((text) => ({ text })) } as never;
}

/** The edit bundle under a recorder emit + a card resolver. `noClaim` — the claim chokepoint is R0's and has
 *  its own suite; what is under test here is the step. */
function edit(card: CharacterCard = cardWith(ALTERNATES)): ReturnType<typeof createEdit> {
  const ctx = makeChatContext(db, { getCard: () => Promise.resolve(card) });
  const notReached = (): never => {
    throw new Error("not reached in this suite");
  };
  return createEdit(ctx, { emit, resolveForeignInputs: notReached, claimChat: noClaim });
}

interface Room {
  readonly host: UserId;
  readonly member: UserId;
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
  readonly greetingId: MessageId;
}

/** A room in its WINDOW: a host, a second present human, a seated character, and ONE seeded greeting row
 *  (assistant + characterId + `authorUserId: null` — exactly what `startChat`'s seeder writes). No user row. */
async function seedRoom(key: string): Promise<Room> {
  const host = await seedUser(db, castId<Handle>(`host_${key}`));
  const member = await seedUser(db, castId<Handle>(`member_${key}`));
  const characterId = await seedCharacter(db, host, `aria_${key}`);
  const chatId = await seedChat(db, key);
  await seedParticipant(db, { chatId, key: `ph_${key}`, userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: `pm_${key}`, userId: member, role: "member" });
  await seedParticipant(db, { chatId, key: `pc_${key}`, characterId });
  const { messageId } = await seedMessage(db, chatId, 1, { role: "assistant", characterId, content: ALT_0 });
  return { host, member, chatId, characterId, greetingId: messageId };
}

/** The greeting row's live content, read straight off the variant (never through a view builder). */
async function contentOf(messageId: MessageId): Promise<string | undefined> {
  const [row] = await db.select({ content: messageVariants.content }).from(messageVariants).where(eq(messageVariants.messageId, messageId));
  return row?.content;
}

describe("the step — the host walks the card's alternates", () => {
  test("stepping swaps the row's canon bytes to the indexed alternate and emits messageEdited", async () => {
    const room = await seedRoom("a");

    const view = await edit().setSeededGreeting({ principal: principal(room.host), chatId: room.chatId, messageId: room.greetingId, greetingIndex: 1 });

    expect(view.content).toBe(ALT_1);
    expect(await contentOf(room.greetingId)).toBe(ALT_1);
    expect(emitted.map((e) => e.type)).toStrictEqual(["messageEdited"]);
  });

  test("a SECOND step wraps to another alternate — the window is walkable, not a one-shot", async () => {
    const room = await seedRoom("b");
    const verbs = edit();

    await verbs.setSeededGreeting({ principal: principal(room.host), chatId: room.chatId, messageId: room.greetingId, greetingIndex: 2 });
    expect(await contentOf(room.greetingId)).toBe(ALT_2);

    // Back to the first: the step reads the CARD each time, so it never depends on where it has been —
    // which is what makes the client's wrap-around (last → first) land as plain index arithmetic.
    await verbs.setSeededGreeting({ principal: principal(room.host), chatId: room.chatId, messageId: room.greetingId, greetingIndex: 0 });
    expect(await contentOf(room.greetingId)).toBe(ALT_0);
  });

  test("the CARD is the only content source — a card whose greetings changed serves its CURRENT bytes", async () => {
    const room = await seedRoom("c");
    // The caller sends an index and nothing else, so a card edited between the seed and the step cannot be
    // overridden by a stale client: what lands is whatever the card says NOW.
    const rewritten = [REWRITTEN_FIRST, REWRITTEN_ALT];

    await edit(cardWith(rewritten)).setSeededGreeting({ principal: principal(room.host), chatId: room.chatId, messageId: room.greetingId, greetingIndex: 1 });

    expect(await contentOf(room.greetingId)).toBe(REWRITTEN_ALT);
  });
});

describe("the freeze — the window is one-way", () => {
  test("a room PAST its first user turn refuses the step, and the greeting keeps its bytes", async () => {
    const room = await seedRoom("d");
    await seedMessage(db, room.chatId, 2, { role: "user", authorUserId: room.host, content: "Hello." });

    await expect(
      edit().setSeededGreeting({ principal: principal(room.host), chatId: room.chatId, messageId: room.greetingId, greetingIndex: 1 }),
    ).rejects.toThrow(ChatOperationError);
    expect(await contentOf(room.greetingId)).toBe(ALT_0);
    expect(emitted).toStrictEqual([]);
  });

  test("PLANTED CONTROL for the freeze belt: the SAME room without the user row steps fine", async () => {
    // The discriminator. Without this, the refusal above would also pass on a build where the belt read the
    // wrong predicate (or nothing at all) and the step happened to fail for some unrelated reason.
    const room = await seedRoom("e");

    await edit().setSeededGreeting({ principal: principal(room.host), chatId: room.chatId, messageId: room.greetingId, greetingIndex: 1 });

    expect(await contentOf(room.greetingId)).toBe(ALT_1);
  });

  test("an ASSISTANT row past the greeting does not reopen the window — only a USER row closes it, and it stays closed", async () => {
    const room = await seedRoom("f");
    await seedMessage(db, room.chatId, 2, { role: "user", authorUserId: room.host, content: "Hello." });
    await seedMessage(db, room.chatId, 3, { role: "assistant", characterId: room.characterId, content: "A reply." });

    await expect(
      edit().setSeededGreeting({ principal: principal(room.host), chatId: room.chatId, messageId: room.greetingId, greetingIndex: 1 }),
    ).rejects.toThrow(ChatOperationError);
  });
});

describe("authority — host-only, and leak-free to a stranger", () => {
  test("a present MEMBER who is not the host is refused, and the greeting keeps its bytes", async () => {
    const room = await seedRoom("g");

    await expect(
      edit().setSeededGreeting({ principal: principal(room.member), chatId: room.chatId, messageId: room.greetingId, greetingIndex: 1 }),
    ).rejects.toThrow(ChatOperationError);
    expect(await contentOf(room.greetingId)).toBe(ALT_0);
  });

  test("PLANTED CONTROL for the host belt: the same call by the HOST succeeds", async () => {
    const room = await seedRoom("h");

    await edit().setSeededGreeting({ principal: principal(room.host), chatId: room.chatId, messageId: room.greetingId, greetingIndex: 1 });

    expect(await contentOf(room.greetingId)).toBe(ALT_1);
  });

  test("a FOREIGN caller gets the leak-free NOT_FOUND — never a coded refusal that admits the room exists", async () => {
    const room = await seedRoom("i");
    const stranger = await seedUser(db, castId<Handle>("stranger"));

    // The membership chokepoint fires FIRST, so a non-participant learns nothing about the chat, the slot,
    // or the freeze state — the same collapse every other chatId surface makes (the cross-tenant sweep
    // probes this verb for exactly this reason).
    await expect(
      edit().setSeededGreeting({ principal: principal(stranger), chatId: room.chatId, messageId: room.greetingId, greetingIndex: 1 }),
    ).rejects.toThrow(ChatNotFoundError);
    expect(await contentOf(room.greetingId)).toBe(ALT_0);
  });
});

describe("the target — only a character-voiced greeting has alternates", () => {
  test("a USER row is refused (no card, no alternates to step among)", async () => {
    const room = await seedRoom("j");
    // Seeded at seq 0 so the window stays OPEN — this arm must fail on the ROW SHAPE, not on the freeze.
    // (A user row anywhere closes the window, so the fixture puts it… nowhere: this is a narrator-less
    // system row instead, which is the same shape question without touching the freeze.)
    const { messageId } = await seedMessage(db, room.chatId, 2, { role: "system", content: "A system note." });

    await expect(edit().setSeededGreeting({ principal: principal(room.host), chatId: room.chatId, messageId, greetingIndex: 1 })).rejects.toThrow(
      ChatOperationError,
    );
  });

  test("an assistant row with NO characterId (a narrator line) is refused", async () => {
    const room = await seedRoom("k");
    const { messageId } = await seedMessage(db, room.chatId, 2, { role: "assistant", characterId: null, content: "The rain keeps on." });

    await expect(edit().setSeededGreeting({ principal: principal(room.host), chatId: room.chatId, messageId, greetingIndex: 1 })).rejects.toThrow(
      ChatOperationError,
    );
  });

  test("a slot from ANOTHER chat is the leak-free NOT_FOUND (the chat-scoping belt)", async () => {
    const room = await seedRoom("l");
    const other = await seedRoom("m");

    await expect(
      edit().setSeededGreeting({ principal: principal(room.host), chatId: room.chatId, messageId: other.greetingId, greetingIndex: 1 }),
    ).rejects.toThrow(ChatNotFoundError);
    expect(await contentOf(other.greetingId)).toBe(ALT_0);
  });
});

describe("the index — resolved against the card, never trusted", () => {
  test("an out-of-range index is refused and writes nothing", async () => {
    const room = await seedRoom("n");

    await expect(
      edit().setSeededGreeting({ principal: principal(room.host), chatId: room.chatId, messageId: room.greetingId, greetingIndex: ALTERNATES.length }),
    ).rejects.toThrow(ChatOperationError);
    expect(await contentOf(room.greetingId)).toBe(ALT_0);
    expect(emitted).toStrictEqual([]);
  });

  test("a card that LOST its alternates refuses the step a stale client still offers", async () => {
    const room = await seedRoom("o");

    await expect(
      edit(cardWith([ALT_0])).setSeededGreeting({
        principal: principal(room.host),
        chatId: room.chatId,
        messageId: room.greetingId,
        greetingIndex: 2,
      }),
    ).rejects.toThrow(ChatOperationError);
    expect(await contentOf(room.greetingId)).toBe(ALT_0);
  });
});

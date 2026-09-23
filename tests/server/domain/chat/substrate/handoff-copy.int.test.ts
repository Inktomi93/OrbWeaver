// The HOST-HANDOFF PROPERTY OFFER, end to end against a real libSQL db (stickler 2026-08-03 §5/§6(f)).
//
// Composed-REAL on purpose: the four copy ops are the actual domain factories (`createCopyHandoffCards` /
// `createCopyHandoffBooks` / `createCopyHandoffRegexScripts` / `createHandoffRestampStatements`), not fakes.
// The whole claim of this arm is about rows that land in OTHER domains' tables, and a fake would prove only
// that chat called something. What is pinned here:
//
//   • NO OFFER = today's behavior, BYTE-IDENTICAL — the D64 drop runs, nothing is copied, nothing is minted.
//   • WITH the offer: the departing host's seated cards are copied into the NOMINEE's library, this room's
//     seats are re-pointed IN PLACE (era + knobs preserved), `messages.characterId` and the digest keys move
//     onto the copies, and the ORIGINALS are untouched.
//   • CROSS-TENANT, both directions: only cards the DEPARTING host owns are candidates, and a card the
//     nominee already owns is not "gifted" to them a second time.
//   • The CRASH ARM: the mints land before the swap, so an accept that dies in between leaves ordinary
//     library rows + an intact nomination — and the retry converges on the SAME copies (zero duplicates).
//   • LORE: character-attached books are copied BY VALUE (a reference-carry loses them silently — the
//     character-book pool is owner-filtered) and the room's chat-attached books are re-pointed at copies,
//     severing the license the old host would otherwise keep over the room's prompt.
//   • REGEX (#1739): the room's chat-tier scripts move the same way, at their stored positions — the
//     executable twin of the lore arm, and the one the departed host could otherwise keep EDITING.

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { NotificationEvent } from "@orb/contracts/notifications";
import { regexScriptBehaviorSchema } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import {
  auditLogs,
  characterBooks,
  characters,
  chatBooks,
  chatDigestSpeakers,
  chatDigests,
  chatHandoffResumptions,
  chatParticipants,
  chatRegexScripts,
  embedGenerations,
  messages,
  regexScripts,
  userConnections,
  worldBooks,
  worldEntries,
} from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type {
  CharacterHandle,
  CharacterId,
  ChatDigestId,
  ChatId,
  EmbedGenerationId,
  Handle,
  RegexScriptId,
  UserConnectionId,
  UserId,
  WorldBookId,
  WorldEntryId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createCopyHandoffCards, handoffProvenance } from "../../../../../packages/server/src/domain/character/index.ts";
import { createParticipants } from "../../../../../packages/server/src/domain/chat/verbs/participants.ts";
import { createHandoffRestampStatements } from "../../../../../packages/server/src/domain/embeddings/index.ts";
import { createCopyHandoffRegexScripts, createCountHandoffRegexScripts } from "../../../../../packages/server/src/domain/regex/index.ts";
import { bumpStatsCanonVersion } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { createCopyHandoffBooks, createCountHandoffBooks } from "../../../../../packages/server/src/domain/world-info/index.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../../../support/inference-identities.ts";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../_support.ts";

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

/** The emit-op contract: record the event AND commit the producer's unexecuted co-statements. */
function recordingEmit(notes: NotificationEvent[]): (event: NotificationEvent, coStatements?: readonly unknown[]) => Promise<void> {
  return async (event, coStatements) => {
    notes.push(event);
    if (coStatements !== undefined && coStatements.length > 0) {
      await db.batch(batchMany(coStatements as BatchStmt[]));
    }
  };
}

/** The REAL owner-scoped card read (`loadOwnedCharacterRow`'s shape): a card resolves only for its owner. */
function ownedCard(): (params: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<CharacterCard | null> {
  return async ({ ownerId, characterId }) => {
    const [row] = await db.select().from(characters).where(eq(characters.id, characterId));
    // @orb-waive no-test-fabrication(unknown): the copy plan reads ONLY card NON-nullness (resolvable under this owner?), never a field. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    return row !== undefined && row.ownerId === ownerId ? ({ name: row.name, avatarAssetId: null } as unknown as CharacterCard) : null;
  };
}

/** Deterministic minters — a copy's id is `<prefix>_copy_<n>`, so an assertion can name it without reading. */
function minters(): {
  newCharacterId: () => CharacterId;
  newBookId: () => WorldBookId;
  newEntryId: () => WorldEntryId;
  newScriptId: () => RegexScriptId;
} {
  let n = 0;
  return {
    newCharacterId: (): CharacterId => {
      n += 1;
      return castId<CharacterId>(`character_copy_${n}`);
    },
    newBookId: (): WorldBookId => {
      n += 1;
      return castId<WorldBookId>(`world_book_copy_${n}`);
    },
    newEntryId: (): WorldEntryId => {
      n += 1;
      return castId<WorldEntryId>(`world_entry_copy_${n}`);
    },
    newScriptId: (): RegexScriptId => {
      n += 1;
      return castId<RegexScriptId>(`regex_script_copy_${n}`);
    },
  };
}

/** A chat context wired with the REAL copy factories. `copyAsset` is the identity-ish stub (the picture
 *  re-own is the assets domain's — its own contract; here it simply reports "no avatar"), so these tests
 *  assert the card/book/digest planes without an assets service. */
function copyContext(
  overrides: NonNullable<Parameters<typeof makeChatContext>[1]> = {},
  notes: NotificationEvent[] = [],
): Parameters<typeof createParticipants>[0] {
  const mint = minters();
  return makeChatContext(db, {
    getCard: ownedCard(),
    emitNotification: recordingEmit(notes),
    copyHandoffCards: createCopyHandoffCards({
      db,
      bumpStatsCanonVersion,
      now: () => 1,
      newCharacterId: mint.newCharacterId,
      copyAsset: () => Promise.resolve(null),
    }),
    copyHandoffBooks: createCopyHandoffBooks({ db, now: () => 1, newBookId: mint.newBookId, newEntryId: mint.newEntryId }),
    copyHandoffRegexScripts: createCopyHandoffRegexScripts({ db, now: () => 1, newScriptId: mint.newScriptId }),
    // The disclosure twins are REAL too (#1762) — the whole claim of the nomination pins is that the counted
    // plan and the executed copy are one resolution, which a stubbed count could not prove.
    countHandoffBooks: createCountHandoffBooks(db),
    countHandoffRegexScripts: createCountHandoffRegexScripts(db),
    restampHandoffDigests: createHandoffRestampStatements({ db }),
    ...overrides,
  });
}

/** host + nominee + a room the host seats `aria` (the host's own card) in. */
async function seedTransferRoom(): Promise<{ host: UserId; member: UserId; chatId: ChatId; aria: CharacterId }> {
  const host = await seedUser(db, castId<Handle>("host"));
  const member = await seedUser(db, castId<Handle>("member"));
  const aria = await seedCharacter(db, host, "aria");
  const chatId = await seedChat(db, "a");
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
  await seedParticipant(db, { chatId, key: "ca", characterId: aria, role: "member", disabled: true });
  return { host, member, chatId, aria };
}

describe("no offer — the built D64 behavior stays byte-identical", () => {
  test("a nomination with no offer copies nothing and drops the outgoing host's seat exactly as before", async () => {
    const { host, member, chatId, aria } = await seedTransferRoom();
    const roster = createParticipants(copyContext(), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    // Nothing minted: the nominee's library is empty, the host still owns exactly their one card.
    const cards = await db.select().from(characters);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.ownerId).toBe(host);
    // And the seat took the D64 drop.
    const seats = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(seats.find((s) => s.characterId === aria)?.leftSeq).not.toBeNull();
  });

  test("an offer of NOTHING (both flags false) is the same path — an explicit decline copies nothing", async () => {
    const { host, member, chatId, aria } = await seedTransferRoom();
    const roster = createParticipants(copyContext(), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: false, copyGmPreset: false } });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    expect(await db.select().from(characters)).toHaveLength(1);
    const seats = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(seats.find((s) => s.characterId === aria)?.leftSeq).not.toBeNull();
  });
});

describe("the accepted offer — the room moves onto the copies", () => {
  test("an actor-tail failure leaves a resumable marker; retry converges without a second audit", async () => {
    const { host, member, chatId } = await seedTransferRoom();
    let attempts = 0;
    // @orb-waive no-test-fabrication(unknown): minimal ChatRpgOps fault injector; this accept path reaches only the two handoff methods below. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const rpg = {
      handoffHealStatements: (): Promise<readonly BatchStmt[]> => Promise.resolve([]),
      handoffRekeyActors: (): Promise<void> => {
        attempts += 1;
        return attempts === 1 ? Promise.reject(new Error("injected actor rekey failure")) : Promise.resolve();
      },
    } as unknown as NonNullable<NonNullable<Parameters<typeof makeChatContext>[1]>["rpg"]>;
    let eventAttempts = 0;
    const resumableEmit = async (event: ChatBusEvent, claimStatement?: BatchStmt): Promise<boolean> => {
      eventAttempts += 1;
      if (eventAttempts === 1) {
        return false;
      }
      if (claimStatement !== undefined) {
        const [claim] = await db.batch(batchMany([claimStatement]));
        if (claim.rowsAffected === 0) {
          return true;
        }
      }
      emitted.push(event);
      return true;
    };
    const roster = createParticipants(copyContext({ rpg }), { claimChat: (): Promise<void> => Promise.resolve(), emit: resumableEmit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: false } });
    emitted.length = 0;
    eventAttempts = 0;
    await expect(roster.acceptHostHandoff({ principal: principal(member), chatId })).rejects.toThrow("injected actor rekey failure");

    expect(await db.select().from(chatHandoffResumptions)).toHaveLength(1);
    expect((await db.select().from(chatParticipants).where(eq(chatParticipants.userId, member)))[0]?.role).toBe("host");
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, "chat.acceptHostHandoff"))).toHaveLength(1);

    // The nomination is already clear, so this call reaches the durable marker rather than the nomination
    // gate. A total-bus false verdict must keep the marker too — awaiting a resolved emit is not evidence.
    await expect(roster.acceptHostHandoff({ principal: principal(member), chatId })).rejects.toThrow("was not durably appended");
    expect(await db.select().from(chatHandoffResumptions)).toHaveLength(1);

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    expect(attempts).toBe(3);
    expect(eventAttempts).toBe(2);
    expect(await db.select().from(chatHandoffResumptions)).toHaveLength(0);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, "chat.acceptHostHandoff"))).toHaveLength(1);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("the seated card is COPIED to the nominee, the seat re-points IN PLACE, and the original is untouched", async () => {
    const { host, member, chatId, aria } = await seedTransferRoom();
    const roster = createParticipants(copyContext(), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: false } });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    // The copy exists under the NOMINEE, provenance-stamped (the idempotency key).
    const copy = (await db.select().from(characters).where(eq(characters.ownerId, member)))[0];
    expect(copy).toBeDefined();
    expect(copy?.importedFrom).toBe(handoffProvenance(chatId, aria));
    expect(copy?.name).toBe("aria");
    // The ORIGINAL is untouched — same owner, no provenance stamp, still there.
    const original = (await db.select().from(characters).where(eq(characters.id, aria)))[0];
    expect(original?.ownerId).toBe(host);
    expect(original?.importedFrom).toBeNull();

    // The seat MOVED rather than dropping — and kept its row identity + knobs (the in-place re-point).
    const seat = (
      await db
        .select()
        .from(chatParticipants)
        .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "character")))
    )[0];
    expect(seat?.characterId).toBe(copy?.id);
    expect(seat?.leftSeq).toBeNull();
    expect(seat?.disabled).toBe(true);
  });

  test("this room's canon RE-STAMPS onto the copy; a DIFFERENT room's stamps for the same card do not", async () => {
    const { host, member, chatId, aria } = await seedTransferRoom();
    // A second room the same card speaks in — the scope proof: a transfer of room A must not re-voice room B.
    const otherChatId = await seedChat(db, "b");
    await seedMessage(db, chatId, 1, { characterId: aria });
    await seedMessage(db, otherChatId, 1, { characterId: aria });
    const roster = createParticipants(copyContext(), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: false } });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const copyId = (await db.select().from(characters).where(eq(characters.ownerId, member)))[0]?.id;
    expect((await db.select().from(messages).where(eq(messages.chatId, chatId)))[0]?.characterId).toBe(copyId);
    expect((await db.select().from(messages).where(eq(messages.chatId, otherChatId)))[0]?.characterId).toBe(aria);
  });

  test("the derived DIGEST keys move too — both the bucket and the speakers join, chat-scoped", async () => {
    const { host, member, chatId, aria } = await seedTransferRoom();
    const otherChatId = await seedChat(db, "b");
    const mine = castId<ChatDigestId>("chat_digest_mine");
    const theirs = castId<ChatDigestId>("chat_digest_theirs");
    const generationId = castId<EmbedGenerationId>("embed_generation_handoff_copy");
    const connectionId = castId<UserConnectionId>("user_connection_handoff_copy");
    await db
      .insert(userConnections)
      .values({ id: connectionId, ownerId: host, label: "handoff copy embed", providerId: testProviderId("custom-openai"), model: testModelId("m") });
    await db.insert(embedGenerations).values({
      id: generationId,
      ownerId: host,
      task: "embed",
      via: "embed",
      connectionId,
      connectionRef: connectionId,
      fingerprint: "test:handoff-copy",
      space: "m",
    });
    for (const [id, chat] of [
      [mine, chatId],
      [theirs, otherChatId],
    ] as const) {
      await db.insert(chatDigests).values({
        id,
        chatId: chat,
        scopedCharacterId: aria,
        tier: 0,
        blockIdx: 0,
        text: "t",
        contentHash: id,
        topicAnchor: "a",
        keywords: [],
        model: "m",
        generationId,
        dim: 1,
        embedding: new Float32Array([0]),
      });
      await db.insert(chatDigestSpeakers).values({ digestId: id, characterId: aria });
    }
    const roster = createParticipants(copyContext(), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: false } });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const copyId = (await db.select().from(characters).where(eq(characters.ownerId, member)))[0]?.id;
    // THIS room's digest + its speakers join now name the copy — so the old host deleting their card can no
    // longer cascade the transferred room's memory away.
    expect((await db.select().from(chatDigests).where(eq(chatDigests.id, mine)))[0]?.scopedCharacterId).toBe(copyId);
    expect((await db.select().from(chatDigestSpeakers).where(eq(chatDigestSpeakers.digestId, mine)))[0]?.characterId).toBe(copyId);
    // The other room's rows are untouched — the speakers UPDATE joins through `chat_digests` for its scope.
    expect((await db.select().from(chatDigests).where(eq(chatDigests.id, theirs)))[0]?.scopedCharacterId).toBe(aria);
    expect((await db.select().from(chatDigestSpeakers).where(eq(chatDigestSpeakers.digestId, theirs)))[0]?.characterId).toBe(aria);
  });
});

describe("cross-tenant — the offer gives only what the departing host owns", () => {
  test("a seated card the departing host does NOT own is never copied (a roster seat is not a license)", async () => {
    const { host, member, chatId } = await seedTransferRoom();
    // A third party's card sitting on the roster (a prior host's, still seated).
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const foreign = await seedCharacter(db, stranger, "foreign");
    await seedParticipant(db, { chatId, key: "cf", characterId: foreign, role: "member" });
    const roster = createParticipants(copyContext(), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: false } });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    // Exactly ONE copy landed — aria's. The stranger's card was not gifted by anybody.
    const minted = await db.select().from(characters).where(eq(characters.ownerId, member));
    expect(minted).toHaveLength(1);
    expect(minted[0]?.importedFrom).toBe(
      handoffProvenance(
        chatId,
        (
          await db
            .select()
            .from(characters)
            .where(eq(characters.handle, castId<CharacterHandle>("aria")))
        )[0]?.id ?? foreign,
      ),
    );
    // …and the foreign seat still takes the D64 drop, because the new host cannot read it either.
    const seats = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(seats.find((s) => s.characterId === foreign)?.leftSeq).not.toBeNull();
  });

  test("a seated card the NOMINEE already owns is left alone — no second copy, no re-point", async () => {
    const { host, member, chatId } = await seedTransferRoom();
    const bella = await seedCharacter(db, member, "bella");
    await seedParticipant(db, { chatId, key: "cb", characterId: bella, role: "member" });
    const roster = createParticipants(copyContext(), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: false } });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    // The nominee's library gained exactly one row (aria's copy) — bella was not duplicated onto herself.
    expect(await db.select().from(characters).where(eq(characters.ownerId, member))).toHaveLength(2);
    const seats = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(seats.find((s) => s.characterId === bella)?.leftSeq).toBeNull();
  });
});

describe("the crash arm — mints land first, and a retry converges", () => {
  test("a re-accept after the mints landed re-uses the SAME copies (zero duplicates)", async () => {
    const { host, member, chatId, aria } = await seedTransferRoom();
    const ctx = copyContext();
    const roster = createParticipants(ctx, { claimChat: (): Promise<void> => Promise.resolve(), emit });

    // Simulate the crash window: the LIBRARY half ran and the swap did not. The nomination is intact, so the
    // accept is simply re-tried — which is the whole point of running the mints first.
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: false } });
    const first = await ctx.copyHandoffCards({ fromOwnerId: host, toOwnerId: member, chatId, characterIds: [aria] });
    expect(first).toEqual([{ sourceCharacterId: aria, characterId: castId<CharacterId>("character_copy_1"), minted: true }]);
    // The strays are the NOMINEE's own ordinary library rows at this point — inert, not corruption.
    expect(await db.select().from(characters).where(eq(characters.ownerId, member))).toHaveLength(1);

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    // Still ONE copy: the provenance key found the existing row instead of minting a second library.
    const minted = await db.select().from(characters).where(eq(characters.ownerId, member));
    expect(minted).toHaveLength(1);
    expect(minted[0]?.id).toBe("character_copy_1");
    // …and the room is pointed at it.
    const seat = (
      await db
        .select()
        .from(chatParticipants)
        .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "character")))
    )[0];
    expect(seat?.characterId).toBe("character_copy_1");
  });

  test("a DECLINE after a partial mint leaves the strays as ordinary library rows and the room untouched", async () => {
    const { host, member, chatId, aria } = await seedTransferRoom();
    const ctx = copyContext();
    const roster = createParticipants(ctx, { claimChat: (): Promise<void> => Promise.resolve(), emit });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: false } });
    await ctx.copyHandoffCards({ fromOwnerId: host, toOwnerId: member, chatId, characterIds: [aria] });

    // The nominee never accepts. Nothing else happens — no sweep, no cleanup job, no half-state.
    const seats = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(seats.find((s) => s.userId === host)?.role).toBe("host");
    expect(seats.find((s) => s.characterId === aria)?.leftSeq).toBeNull();
    // The stray is a normal card the NOMINEE owns: editable, deletable, indistinguishable from a duplicate.
    const stray = (await db.select().from(characters).where(eq(characters.ownerId, member)))[0];
    expect(stray?.ownerId).toBe(member);
    expect(stray?.synthetic).toBe(false);
  });
});

describe("lore — the books are copied BY VALUE, and the room's license is severed", () => {
  test("a seated card's attached book is copied with its entries and attached to the COPY", async () => {
    const { host, member, chatId, aria } = await seedTransferRoom();
    const bookId = castId<WorldBookId>("world_book_aria");
    await db.insert(worldBooks).values({ id: bookId, ownerId: host, name: "Aria's lore", description: null, createdAt: 1 });
    await db.insert(worldEntries).values({ id: castId<WorldEntryId>("world_entry_1"), worldBookId: bookId, title: "t", content: "the secret", createdAt: 1 });
    await db.insert(characterBooks).values({ characterId: aria, worldBookId: bookId, role: "primary", createdAt: 1 });
    const roster = createParticipants(copyContext(), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: false } });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const copyId = (await db.select().from(characters).where(eq(characters.ownerId, member)))[0]?.id ?? aria;
    // A fresh BOOK under the nominee (not a reference to the host's — that would lose the lore silently, since
    // the character-book pool is owner-filtered), carrying the entry content.
    const copiedBooks = await db.select().from(worldBooks).where(eq(worldBooks.ownerId, member));
    expect(copiedBooks).toHaveLength(1);
    expect(copiedBooks[0]?.name).toBe("Aria's lore");
    const copiedEntries = await db
      .select()
      .from(worldEntries)
      .where(eq(worldEntries.worldBookId, copiedBooks[0]?.id ?? bookId));
    expect(copiedEntries.map((e) => e.content)).toEqual(["the secret"]);
    // The junction is copy→copy, with the role preserved.
    const junction = (await db.select().from(characterBooks).where(eq(characterBooks.characterId, copyId)))[0];
    expect(junction?.worldBookId).toBe(copiedBooks[0]?.id);
    expect(junction?.role).toBe("primary");
    // The host's original book + junction are untouched.
    expect(await db.select().from(characterBooks).where(eq(characterBooks.characterId, aria))).toHaveLength(1);
  });

  test("the room's chat-attached book is re-pointed at a copy — the departed host can no longer edit the prompt", async () => {
    const { host, member, chatId } = await seedTransferRoom();
    const bookId = castId<WorldBookId>("world_book_room");
    await db.insert(worldBooks).values({ id: bookId, ownerId: host, name: "Room lore", description: null, createdAt: 1 });
    await db.insert(worldEntries).values({ id: castId<WorldEntryId>("world_entry_r"), worldBookId: bookId, title: "t", content: "room truth", createdAt: 1 });
    await db.insert(chatBooks).values({ chatId, worldBookId: bookId, createdAt: 1 });
    const roster = createParticipants(copyContext(), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: false } });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const attached = await db.select().from(chatBooks).where(eq(chatBooks.chatId, chatId));
    expect(attached).toHaveLength(1);
    const attachedBook = (
      await db
        .select()
        .from(worldBooks)
        .where(eq(worldBooks.id, attached[0]?.worldBookId ?? bookId))
    )[0];
    // The room now reads the NOMINEE's copy; the old host's book still exists but no longer fires into it.
    expect(attachedBook?.ownerId).toBe(member);
    expect(attachedBook?.name).toBe("Room lore");
    expect((await db.select().from(worldBooks).where(eq(worldBooks.id, bookId)))[0]?.ownerId).toBe(host);
  });

  // #1763 — THE ROOM HALF IS NOT THE CARD HALF'S CARGO. `chat_books` hangs off the ROOM, so an offer
  // accepted in a room with no GIFTABLE seat (no seats at all, or only seats the nominee already owns /
  // the old host does not own) must still sever the room's book license. Before this arm the whole copy
  // short-circuited on `seats.length === 0` and the departed host kept a book firing into a room they had
  // left — the same shape #1739 fixed for the room's regex scripts, one table over.
  test("an offer accepted with ZERO giftable seats still re-points the room's book (#1763)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    // No character seat anywhere on this roster — the room is two humans and a lorebook.
    const bookId = castId<WorldBookId>("world_book_room");
    await db.insert(worldBooks).values({ id: bookId, ownerId: host, name: "Room lore", description: null, createdAt: 1 });
    await db.insert(worldEntries).values({ id: castId<WorldEntryId>("world_entry_r"), worldBookId: bookId, title: "t", content: "room truth", createdAt: 1 });
    await db.insert(chatBooks).values({ chatId, worldBookId: bookId, createdAt: 1 });
    const roster = createParticipants(copyContext(), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: false } });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const attached = await db.select().from(chatBooks).where(eq(chatBooks.chatId, chatId));
    expect(attached).toHaveLength(1);
    const attachedBook = (
      await db
        .select()
        .from(worldBooks)
        .where(eq(worldBooks.id, attached[0]?.worldBookId ?? bookId))
    )[0];
    expect(attachedBook?.ownerId).toBe(member);
    expect(attachedBook?.name).toBe("Room lore");
    // The entries came with it — a copy whose lore did not follow is a book that reads empty.
    expect(
      (
        await db
          .select()
          .from(worldEntries)
          .where(eq(worldEntries.worldBookId, attachedBook?.id ?? bookId))
      ).map((e) => e.content),
    ).toEqual(["room truth"]);
    // The CARD half stayed seat-gated: nothing was minted for a seat that does not exist.
    expect(await db.select().from(characters).where(eq(characters.ownerId, member))).toHaveLength(0);
  });

  // WHY THE TWO HALVES STAY IN ONE OP (the #1763 fork): they share the call-local source→copy map, so a book
  // attached to BOTH a seated card and the room is copied ONCE and shared, exactly as the originals shared
  // it. Splitting the op in two would give each half its own map and silently fork the room's lore into two
  // divergent duplicates — which is the failure `createCopyHandoffBooks`'s own header names.
  test("a book attached to BOTH the seated card and the room is copied ONCE and shared (#1763)", async () => {
    const { host, member, chatId, aria } = await seedTransferRoom();
    const bookId = castId<WorldBookId>("world_book_shared");
    await db.insert(worldBooks).values({ id: bookId, ownerId: host, name: "Shared lore", description: null, createdAt: 1 });
    await db.insert(worldEntries).values({ id: castId<WorldEntryId>("world_entry_s"), worldBookId: bookId, title: "t", content: "one truth", createdAt: 1 });
    await db.insert(characterBooks).values({ characterId: aria, worldBookId: bookId, role: "primary", createdAt: 1 });
    await db.insert(chatBooks).values({ chatId, worldBookId: bookId, createdAt: 1 });
    const roster = createParticipants(copyContext(), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: false } });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const copies = await db.select().from(worldBooks).where(eq(worldBooks.ownerId, member));
    expect(copies).toHaveLength(1);
    const copyId = copies[0]?.id;
    // BOTH junctions name that one copy — the card's and the room's.
    const cardCopyId = (await db.select().from(characters).where(eq(characters.ownerId, member)))[0]?.id ?? aria;
    expect((await db.select().from(characterBooks).where(eq(characterBooks.characterId, cardCopyId)))[0]?.worldBookId).toBe(copyId);
    expect((await db.select().from(chatBooks).where(eq(chatBooks.chatId, chatId)))[0]?.worldBookId).toBe(copyId);
    // …and the entry landed once, not twice.
    expect(
      await db
        .select()
        .from(worldEntries)
        .where(eq(worldEntries.worldBookId, copyId ?? bookId)),
    ).toHaveLength(1);
  });
});

/** Seed one chat-tier regex script owned by `ownerId` and attach it to `chatId` at `position`. */
async function seedChatScript(
  chatId: ChatId,
  ownerId: UserId,
  over: { readonly id: string; readonly name: string; readonly find: string; readonly position?: number },
): Promise<RegexScriptId> {
  const id = castId<RegexScriptId>(over.id);
  await db.insert(regexScripts).values({
    id,
    ownerId,
    name: over.name,
    enabled: true,
    behavior: regexScriptBehaviorSchema.parse({ findRegex: over.find, replaceString: "[redacted]", placement: ["AI_OUTPUT"] }),
    createdAt: 1,
    updatedAt: 1,
  });
  await db.insert(chatRegexScripts).values({ chatId, regexScriptId: id, position: over.position ?? 0, createdAt: 1 });
  return id;
}

// #1739 — REGEX, the executable twin of the lore arm above. A room's chat-tier scripts are resolved UNSCOPED
// (`domain/regex/persistence/queries.listChatScripts`, "room-public prompt content"), so without this the
// departed host keeps a live find/replace over the new host's prompts and rendered output — editable and
// deletable by them, un-flippable by anyone present. The offer moves the SCRIPTS the same way it moves the
// books: copy into the nominee's library, re-point the junction, leave the original alone.
describe("regex — the room's chat-tier scripts move with the room", () => {
  test("the departed host's chat script is re-pointed at a copy the NOMINEE owns, position preserved", async () => {
    const { host, member, chatId } = await seedTransferRoom();
    const scriptId = await seedChatScript(chatId, host, { id: "regex_script_room", name: "Room quirk", find: "secret", position: 3 });
    const roster = createParticipants(copyContext(), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: false } });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const attached = await db.select().from(chatRegexScripts).where(eq(chatRegexScripts.chatId, chatId));
    expect(attached).toHaveLength(1);
    const attachedScript = (
      await db
        .select()
        .from(regexScripts)
        .where(eq(regexScripts.id, attached[0]?.regexScriptId ?? scriptId))
    )[0];
    // The room now runs the NOMINEE's copy — same name and same body, so the effective transform is unchanged.
    expect(attachedScript?.ownerId).toBe(member);
    expect(attachedScript?.name).toBe("Room quirk");
    expect(attachedScript?.behavior.findRegex).toBe("secret");
    // Execution order is data: the copy inherits the source's position.
    expect(attached[0]?.position).toBe(3);
    // The departed host still owns their original — the copy took nothing away from them.
    expect((await db.select().from(regexScripts).where(eq(regexScripts.id, scriptId)))[0]?.ownerId).toBe(host);
  });

  test("a chat script the departing host does NOT own is left exactly where it is (a junction is not a license)", async () => {
    const { host, member, chatId } = await seedTransferRoom();
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const foreign = await seedChatScript(chatId, stranger, { id: "regex_script_foreign", name: "Not theirs", find: "x" });
    const roster = createParticipants(copyContext(), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: false } });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    // Nothing was minted for the nominee, and the room still names the stranger's row — which the new host
    // can now DETACH (the room gate), but which nobody gets to give away on the stranger's behalf.
    expect(await db.select().from(regexScripts).where(eq(regexScripts.ownerId, member))).toHaveLength(0);
    const attached = await db.select().from(chatRegexScripts).where(eq(chatRegexScripts.chatId, chatId));
    expect(attached.map((a) => a.regexScriptId)).toEqual([foreign]);
  });

  test("NO OFFER copies no script — the junction and its owner are byte-identical to today", async () => {
    const { host, member, chatId } = await seedTransferRoom();
    const scriptId = await seedChatScript(chatId, host, { id: "regex_script_room", name: "Room quirk", find: "secret" });
    const roster = createParticipants(copyContext(), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    expect(await db.select().from(regexScripts).where(eq(regexScripts.ownerId, member))).toHaveLength(0);
    const attached = await db.select().from(chatRegexScripts).where(eq(chatRegexScripts.chatId, chatId));
    expect(attached.map((a) => a.regexScriptId)).toEqual([scriptId]);
  });
});

// ── THE NOMINATION'S DISCLOSURE (#1762) ─────────────────────────────────────────────────────────────────
// The nominee decides on ONE screen, from ONE row, and everything above lands in THEIR library the moment
// they press Accept — including the executable regex scripts (#1739). So the `handoff-nominated`
// notification carries what the offer would copy, resolved AT NOMINATE from the SAME ownership axes the
// accept executes (`resolveHandoffCopyPlan` → the three owning-domain resolvers), never a second guess.
// The pins below are the equality that makes the disclosure honest: what the row SAYS is what the accept
// then DOES, and a nomination that gives nothing says zero rather than staying silent.
describe("the nomination discloses what an accepted offer would copy", () => {
  test("the payload's counts are the rows the accept then lands", async () => {
    const { host, member, chatId, aria } = await seedTransferRoom();
    // A second giftable seat, a card-attached book, the room's own book, and one chat-tier script.
    const bryn = await seedCharacter(db, host, "bryn");
    await seedParticipant(db, { chatId, key: "cb", characterId: bryn, role: "member" });
    const cardBook = castId<WorldBookId>("world_book_card");
    await db.insert(worldBooks).values({ id: cardBook, ownerId: host, name: "Aria lore", description: null, createdAt: 1 });
    await db.insert(characterBooks).values({ characterId: aria, worldBookId: cardBook, role: "primary", createdAt: 1 });
    const roomBook = castId<WorldBookId>("world_book_room");
    await db.insert(worldBooks).values({ id: roomBook, ownerId: host, name: "Room lore", description: null, createdAt: 1 });
    await db.insert(chatBooks).values({ chatId, worldBookId: roomBook, createdAt: 1 });
    await seedChatScript(chatId, host, { id: "regex_script_room", name: "Room quirk", find: "secret" });
    // @orb-waive no-test-fabrication(unknown): minimal ChatRpgOps — this nominate/accept pair reaches only the three handoff methods. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const rpg = {
      handoffHealStatements: (): Promise<readonly BatchStmt[]> => Promise.resolve([]),
      handoffRekeyActors: (): Promise<void> => Promise.resolve(),
      handoffWouldCopyGmPreset: (): Promise<boolean> => Promise.resolve(true),
    } as unknown as NonNullable<NonNullable<Parameters<typeof makeChatContext>[1]>["rpg"]>;
    const notes: NotificationEvent[] = [];
    const roster = createParticipants(copyContext({ rpg }, notes), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: true } });

    const nomination = notes.find((n) => n.type === "handoff-nominated");
    expect(nomination).toBeDefined();
    expect(nomination).toMatchObject({ offer: { characters: 2, worldBooks: 2, regexScripts: 1, gmPreset: true } });

    // …and that IS what lands: the disclosure is the copy plan's own resolution, not a parallel count.
    await roster.acceptHostHandoff({ principal: principal(member), chatId });
    expect(await db.select().from(characters).where(eq(characters.ownerId, member))).toHaveLength(2);
    expect(await db.select().from(worldBooks).where(eq(worldBooks.ownerId, member))).toHaveLength(2);
    expect(await db.select().from(regexScripts).where(eq(regexScripts.ownerId, member))).toHaveLength(1);
  });

  test("an offer of NOTHING discloses zeros — the row still says what it gives, which is nothing", async () => {
    const { host, member, chatId } = await seedTransferRoom();
    await seedChatScript(chatId, host, { id: "regex_script_room", name: "Room quirk", find: "secret" });
    const notes: NotificationEvent[] = [];
    const roster = createParticipants(copyContext({}, notes), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: false, copyGmPreset: false } });

    expect(notes.find((n) => n.type === "handoff-nominated")).toMatchObject({
      offer: { characters: 0, worldBooks: 0, regexScripts: 0, gmPreset: false },
    });
  });

  test("the disclosure carries the copy's OWN ownership axes — a stranger's script and the nominee's own card are not counted", async () => {
    const { host, member, chatId } = await seedTransferRoom();
    // The nominee ALREADY owns this seated card: it is a live seat, never a gift (and never a disclosed one).
    const theirs = await seedCharacter(db, member, "theirs");
    await seedParticipant(db, { chatId, key: "ct", characterId: theirs, role: "member" });
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    await seedChatScript(chatId, stranger, { id: "regex_script_foreign", name: "Not theirs", find: "x" });
    const notes: NotificationEvent[] = [];
    const roster = createParticipants(copyContext({}, notes), { claimChat: (): Promise<void> => Promise.resolve(), emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member, offer: { copyCharacters: true, copyGmPreset: false } });

    // Only the host's own `aria` seat is giftable; the stranger's chat script is not the host's to give.
    expect(notes.find((n) => n.type === "handoff-nominated")).toMatchObject({
      offer: { characters: 1, worldBooks: 0, regexScripts: 0, gmPreset: false },
    });
  });
});

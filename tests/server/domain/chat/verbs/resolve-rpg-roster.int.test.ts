// op: resolveRpgRoster (rpg-design/05 §4.3) — the rpg-facing roster projection, against a real libSQL db.
// Proves: a CHARACTER seat resolves its card under the HOST's ownership (the getCard ownerId = the room host,
// D18/D19); a HUMAN seat resolves its publics (displayName ?? handle ?? ""); a seat that resolves to neither
// ref (a gone card) is DROPPED; the read is `WHERE chatId`-scoped (no cross-chat leak); a LEFT seat is not
// projected (loadRoster present-only). Deterministic (frozen clock, seeded ids); assert the projected shape.

import type { CharacterCard } from "@orb/contracts/character";
import { characterCardSchema } from "@orb/contracts/character";
import type { Db } from "@orb/db";
import type { AssetId, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { createResolveRpgRoster } from "../../../../../packages/server/src/domain/chat/verbs/resolve-rpg-roster.ts";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedCharacter, seedChat, seedParticipant, seedUser } from "../_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

/** A REAL, fully-valid `CharacterCard` keyed by name + avatar — parsed through the schema (no cast), so a new
 *  required card field breaks HERE, not silently. The verb reads only `name`/`avatarAssetId`; the rest are the
 *  schema's app-authored nulls/empties. */
const cardOf = (name: string, avatarAssetId: AssetId | null): CharacterCard =>
  characterCardSchema.parse({
    name,
    description: null,
    personality: null,
    scenario: null,
    greetings: [],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    nickname: null,
    source: null,
    creationDate: null,
    modificationDate: null,
    regexScripts: [],
    extensions: null,
    residualData: null,
    avatarAssetId,
    refinery: null,
  });

/** The publics shape `resolveUserPublics` returns (or null). */
function publics(over: { displayName?: string | null; handle?: Handle | null; avatarAssetId?: AssetId | null } = {}): {
  displayName: string | null;
  handle: Handle | null;
  avatarAssetId: AssetId | null;
} {
  return { displayName: over.displayName ?? null, handle: over.handle ?? null, avatarAssetId: over.avatarAssetId ?? null };
}

describe("resolveRpgRoster", () => {
  test("a character seat resolves its card under the host's ownership; a human resolves its publics", async () => {
    const host = await seedUser(db, "host");
    const player = await seedUser(db, "player");
    const charId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host", joinSeq: 0 });
    await seedParticipant(db, { chatId, key: "player", userId: player, role: "member", joinSeq: 1 });
    await seedParticipant(db, { chatId, key: "aria", characterId: charId, role: "member", joinSeq: 2 });

    // The card read must be OWNED by the host (D18/D19) — assert the ownerId the verb passes.
    const cardCalls: { ownerId: UserId; characterId: CharacterId }[] = [];
    const ctx = makeChatContext(db, {
      getCard: ({ ownerId, characterId }) => {
        cardCalls.push({ ownerId, characterId });
        return Promise.resolve(cardOf("Aria", null));
      },
      resolveUserPublics: (userId) => Promise.resolve(userId === player ? publics({ displayName: "Player One" }) : publics()),
      resolveAssetHash: () => Promise.resolve(null),
    });

    const roster = await createResolveRpgRoster(ctx)(chatId);

    // The character resolves under the HOST's ownership (never the seat's own — a character has no user owner).
    expect(cardCalls).toEqual([{ ownerId: host, characterId: charId }]);
    expect(roster).toEqual([
      { actorRef: { kind: "user", userId: host }, name: "" }, // host publics resolve to null → ""
      { actorRef: { kind: "user", userId: player }, name: "Player One" },
      { actorRef: { kind: "character", characterId: charId }, name: "Aria" },
    ]);
  });

  test("a human's displayName wins, else the handle, else empty; a resolved avatar hash rides", async () => {
    const host = await seedUser(db, "host");
    const withHandle = await seedUser(db, "handled");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host", joinSeq: 0 });
    await seedParticipant(db, { chatId, key: "handled", userId: withHandle, role: "member", joinSeq: 1 });

    const avatar = castId<AssetId>("asset_x");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(null),
      resolveUserPublics: (userId) =>
        Promise.resolve(userId === host ? publics({ displayName: "The Host" }) : publics({ handle: castId<Handle>("handled_one"), avatarAssetId: avatar })),
      resolveAssetHash: (assetId) => Promise.resolve(assetId === avatar ? "hash_x" : null),
    });

    const roster = await createResolveRpgRoster(ctx)(chatId);
    expect(roster).toEqual([
      { actorRef: { kind: "user", userId: host }, name: "The Host" },
      { actorRef: { kind: "user", userId: withHandle }, name: "handled_one", avatar: "hash_x" },
    ]);
  });

  test("a character seat whose card is GONE is dropped (not an addressable actor)", async () => {
    const host = await seedUser(db, "host");
    const charId = await seedCharacter(db, host, "ghost");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host", joinSeq: 0 });
    await seedParticipant(db, { chatId, key: "ghost", characterId: charId, role: "member", joinSeq: 1 });

    // getCard returns null (a gone card) — the character seat resolves to no ref.
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(null),
      resolveUserPublics: () => Promise.resolve(publics({ displayName: "Host" })),
      resolveAssetHash: () => Promise.resolve(null),
    });

    const roster = await createResolveRpgRoster(ctx)(chatId);
    // Only the human host survives — the ghost character is dropped.
    expect(roster).toEqual([{ actorRef: { kind: "user", userId: host }, name: "Host" }]);
  });

  test("the read is chatId-scoped and present-only (no cross-chat leak, a left seat is not projected)", async () => {
    const host = await seedUser(db, "host");
    const stranger = await seedUser(db, "stranger");
    const gone = await seedUser(db, "gone");
    const chatA = await seedChat(db, "a");
    const chatB = await seedChat(db, "b");
    await seedParticipant(db, { chatId: chatA, key: "a_host", userId: host, role: "host", joinSeq: 0 });
    await seedParticipant(db, { chatId: chatA, key: "a_gone", userId: gone, role: "member", joinSeq: 1, leftSeq: 5 });
    // A participant in a DIFFERENT chat must never appear in chat A's roster.
    await seedParticipant(db, { chatId: chatB, key: "b_stranger", userId: stranger, role: "host", joinSeq: 0 });

    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(null),
      resolveUserPublics: (userId) => Promise.resolve(publics({ displayName: userId })),
      resolveAssetHash: () => Promise.resolve(null),
    });

    const roster = await createResolveRpgRoster(ctx)(chatA);
    // Only chat A's PRESENT host — the left member and chat B's stranger are both absent.
    expect(roster).toEqual([{ actorRef: { kind: "user", userId: host }, name: host }]);
  });
});

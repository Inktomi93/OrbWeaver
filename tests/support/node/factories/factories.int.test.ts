// support/factories — self-test for the factory contract (docs/law/Spine-Testing.md §4). Proves: make* is
// deterministic (stable-shape seeded ids, the shared frozen instant, shallow-merge overrides); seed*
// lands FK-clean on an EMPTY db (the user→owned-row chain auto-seeds); explicit relation ids are reused
// (no phantom extra rows); the chat `withX` opt-ins are explicit; and seedMessage performs the D26
// slot→variant→pointer dance.

import { assets, characters, chatParticipants, chats, closeDb, messages, messageVariants, users } from "@orb/db";

import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { cardTokenSize } from "@orb/server/domain/character";
import { sha256Hex } from "@orb/server/primitives/content-hash";
import { cardContentHash } from "@orb/server/primitives/serde/card";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { describe } from "vitest";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import { freshDb } from "../db.ts";
import { expect, test } from "../fixtures.ts";
import { makeAssetBlobRef } from "./asset-view.ts";
import {
  makeAsset,
  makeAssetBytes,
  makeCharacter,
  makeChat,
  makeMessage,
  makeUser,
  seedAsset,
  seedCharacter,
  seedChat,
  seedMessage,
  seedPersona,
  seedUser,
} from "./index.ts";

const CHARACTER_ID_SHAPE = /^character_[0-9a-hjkmnp-tv-z]{26}$/u;

describe("make* — pure, deterministic builders", () => {
  test("user defaults consume the injected production prefixless mint, not a prefixed fixture id", () => {
    const expected = createIdSource(createSeededIds().next);
    const source = createIdSource(createSeededIds().next);
    expect(makeUser({}, source).id).toBe(expected.userId());
    expect(makeUser({}, source).id).toBe(expected.userId());
  });

  test("ids are seeded-counter shaped and distinct per call; timestamps pin to the frozen instant", () => {
    const a = makeCharacter();
    const b = makeCharacter();
    expect(a.id).toMatch(CHARACTER_ID_SHAPE);
    expect(b.id).toMatch(CHARACTER_ID_SHAPE);
    expect(a.id).not.toBe(b.id);
    // The counter lives in the low bytes of the TypeID's uuid, so later calls sort after earlier ones.
    expect(a.id < b.id).toBe(true);
    expect(a.createdAt).toBe(FROZEN_AT_MS);
    expect(makeUser().createdAt).toBe(FROZEN_AT_MS);
    expect(makeChat().updatedAt).toBe(FROZEN_AT_MS);
    expect(makeMessage().createdAt).toBe(FROZEN_AT_MS);
    expect(makeAsset().uploadedAt).toBe(FROZEN_AT_MS);
  });

  test("makeAsset defaults are fully-valid; distinct calls get distinct hashes (owner+hash unique-safe)", async () => {
    const a = makeAsset();
    const b = makeAsset();
    expect(a.kind).toBe("card");
    expect(a.hash).toHaveLength(64);
    expect(a.hash).not.toBe(b.hash);
    const bytes = makeAssetBytes(a.id);
    expect(a.hash).toBe(sha256Hex(bytes));
    expect(a.size).toBe(bytes.byteLength);
    const decoded = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    expect(a.width).toBe(decoded.info.width);
    expect(a.height).toBe(decoded.info.height);
  });

  test("blob-reference defaults use actual asset facts and malformed override IDs cannot bypass the output parser", () => {
    const row = makeAsset({}, createIdSource(createSeededIds().next));
    const ref = makeAssetBlobRef({}, createIdSource(createSeededIds().next));
    expect(ref).toEqual({ assetId: row.id, hash: row.hash, mime: row.mime, width: row.width, height: row.height });
    // The raw malformed override reproduces the retained CT input without branding it as a valid asset ID.
    expect(() => Reflect.apply(makeAssetBlobRef, undefined, [{ assetId: "asset_ct_attach" }])).toThrow();
  });

  test("makeCharacter stamps the PRODUCT'S contentHash, moves with card content, and yields to an override (#900)", () => {
    // The write-side derivation, not a lookalike: `verbs/create.ts` stamps `cardContentHash(card)` and TWO
    // readers recompute-and-compare it (`verbs/update.ts`'s `contentChanged`, which gates re-embedding, and
    // the refinery's belt-14 basis fence). The old default was `hash_<id>` — a value no write path can
    // produce, which makes `contentChanged` unconditionally true on any factory-seeded row.
    const id = createIdSource(createSeededIds().next).typeId(ID_PREFIX.character);
    const base = makeCharacter({ id, name: "Aria" });
    expect(base.contentHash).toBe(cardContentHash(base));
    expect(base.contentHash).toHaveLength(64);
    expect(base.contentHash).not.toBe(`hash_${base.id}`);

    // It follows the OVERRIDES, not just the defaults: an identity field the caller changed changes it, and
    // a non-identity column (D28: re-attribution must not change what a card IS) does not.
    const renamed = makeCharacter({ id, name: "Bolt" });
    expect(renamed.contentHash).not.toBe(base.contentHash);
    const restarred = makeCharacter({ id, name: "Aria", starred: true, creator: "someone" });
    expect(restarred.contentHash).toBe(base.contentHash);

    // An explicit hash still wins — a suite pinning a stale-basis arm keeps its value.
    expect(makeCharacter({ name: "Bolt", contentHash: base.contentHash }).contentHash).toBe(base.contentHash);
  });

  test("overrides shallow-merge over fully-valid defaults", () => {
    const row = makeCharacter({ name: "Aria", starred: true });
    expect(row.name).toBe("Aria");
    expect(row.starred).toBe(true);
    // Untouched defaults survive the merge.
    expect(row.greetings).toEqual([]);
    expect(row.synthetic).toBe(false);
  });

  test("character token denorm follows the real writer after nonempty content and greeting overrides", () => {
    const base = makeCharacter({ name: "Aria", description: "A patient archivist." });
    const greeted = makeCharacter({
      name: base.name,
      description: base.description,
      greetings: [{ text: "The archive is open. Bring every document you found, and we will reconstruct what happened." }],
    });
    expect(base.tokenSize).toBe(cardTokenSize(base));
    expect(base.tokenSize).toBeGreaterThan(0);
    expect(greeted.tokenSize).toBe(cardTokenSize(greeted));
    expect(greeted.tokenSize).toBeGreaterThan(base.tokenSize);
  });
});

describe("seed* — the FK chain on an empty db", () => {
  test("different default seed families share the user mint instead of colliding on independent user counters", async () => {
    const db = await freshDb();
    try {
      const persona = await seedPersona(db);
      const asset = await seedAsset(db);
      const character = await seedCharacter(db);
      expect(new Set([persona.ownerId, asset.ownerId, character.ownerId]).size).toBe(3);
      expect(await db.select().from(users)).toHaveLength(3);
    } finally {
      closeDb(db);
    }
  });

  test("seedCharacter auto-seeds its owner user (FK PRAGMA ON, no orphan insert)", async () => {
    const db = await freshDb();
    const row = await seedCharacter(db);
    const owners = await db.select().from(users);
    expect(owners).toHaveLength(1);
    expect(owners[0]?.id).toBe(row.ownerId);
    const cards = await db.select().from(characters).where(eq(characters.id, row.id));
    expect(cards).toHaveLength(1);
  });

  test("seedAsset auto-seeds its owner user (FK PRAGMA ON, no orphan insert)", async () => {
    const db = await freshDb();
    const row = await seedAsset(db);
    const owners = await db.select().from(users);
    expect(owners).toHaveLength(1);
    expect(owners[0]?.id).toBe(row.ownerId);
    expect(await db.select().from(assets).where(eq(assets.id, row.id))).toHaveLength(1);
  });

  test("an explicit ownerId is reused — no phantom extra user", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    await seedCharacter(db, { ownerId: owner.id });
    await seedPersona(db, { ownerId: owner.id });
    expect(await db.select().from(users)).toHaveLength(1);
  });

  test("seedChat is bare by default (D18 — membership-scoped, no ownerId to chain)", async () => {
    const db = await freshDb();
    const chat = await seedChat(db);
    expect(await db.select().from(chats).where(eq(chats.id, chat.id))).toHaveLength(1);
    expect(await db.select().from(chatParticipants)).toHaveLength(0);
    expect(chat.hostUserId).toBeUndefined();
    expect(chat.characterId).toBeUndefined();
  });

  test("withHost/withCharacter are explicit opt-ins carrying their ids back", async () => {
    const db = await freshDb();
    const chat = await seedChat(db, { withHost: true, withCharacter: true });
    const roster = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chat.id));
    expect(roster).toHaveLength(2);
    const host = roster.find((p) => p.kind === "human");
    expect(host?.role).toBe("host");
    expect(host?.userId).toBe(chat.hostUserId);
    const card = roster.find((p) => p.kind === "character");
    expect(card?.role).toBe("member");
    expect(card?.characterId).toBe(chat.characterId);
  });

  test("seedMessage performs the D26 dance: slot → variant idx 0 → selectedVariantId pointer", async () => {
    const db = await freshDb();
    const seeded = await seedMessage(db, { content: "hello there" });
    const [slot] = await db.select().from(messages).where(eq(messages.id, seeded.id));
    expect(slot?.selectedVariantId).toBe(seeded.variantId);
    const [variant] = await db.select().from(messageVariants).where(eq(messageVariants.id, seeded.variantId));
    expect(variant?.messageId).toBe(seeded.id);
    expect(variant?.idx).toBe(0);
    expect(variant?.content).toBe("hello there");
    // The auto-seeded chat exists (FK-clean).
    expect(await db.select().from(chats).where(eq(chats.id, seeded.chatId))).toHaveLength(1);
  });
});

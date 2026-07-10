// support/factories — self-test for the factory contract (core/Spine-Testing.md §4). Proves: make* is
// deterministic (stable-shape seeded ids, the shared frozen instant, shallow-merge overrides); seed*
// lands FK-clean on an EMPTY db (the user→owned-row chain auto-seeds); explicit relation ids are reused
// (no phantom extra rows); the chat `withX` opt-ins are explicit; and seedMessage performs the D26
// slot→variant→pointer dance.

import {
  assets,
  characters,
  chatParticipants,
  chats,
  messages,
  messageVariants,
  users,
} from "@orb/db";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { FROZEN_AT_MS } from "../clock.ts";
import { freshDb } from "../db.ts";
import { expect, test } from "../fixtures.ts";
import {
  makeAsset,
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

const CHARACTER_ID_SHAPE = /^character_\d{6}$/u;

describe("make* — pure, deterministic builders", () => {
  test("ids are seeded-counter shaped and distinct per call; timestamps pin to the frozen instant", () => {
    const a = makeCharacter();
    const b = makeCharacter();
    expect(a.id).toMatch(CHARACTER_ID_SHAPE);
    expect(b.id).toMatch(CHARACTER_ID_SHAPE);
    expect(a.id).not.toBe(b.id);
    expect(a.createdAt).toBe(FROZEN_AT_MS);
    expect(makeUser().createdAt).toBe(FROZEN_AT_MS);
    expect(makeChat().updatedAt).toBe(FROZEN_AT_MS);
    expect(makeMessage().createdAt).toBe(FROZEN_AT_MS);
    expect(makeAsset().uploadedAt).toBe(FROZEN_AT_MS);
  });

  test("makeAsset defaults are fully-valid; distinct calls get distinct hashes (owner+hash unique-safe)", () => {
    const a = makeAsset();
    const b = makeAsset();
    expect(a.kind).toBe("card");
    expect(a.hash).toHaveLength(64);
    expect(a.hash).not.toBe(b.hash);
  });

  test("overrides shallow-merge over fully-valid defaults", () => {
    const row = makeCharacter({ name: "Aria", starred: true });
    expect(row.name).toBe("Aria");
    expect(row.starred).toBe(true);
    // Untouched defaults survive the merge.
    expect(row.greetings).toEqual([]);
    expect(row.synthetic).toBe(false);
  });
});

describe("seed* — the FK chain on an empty db", () => {
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
    const roster = await db
      .select()
      .from(chatParticipants)
      .where(eq(chatParticipants.chatId, chat.id));
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
    const [variant] = await db
      .select()
      .from(messageVariants)
      .where(eq(messageVariants.id, seeded.variantId));
    expect(variant?.messageId).toBe(seeded.id);
    expect(variant?.idx).toBe(0);
    expect(variant?.content).toBe("hello there");
    // The auto-seeded chat exists (FK-clean).
    expect(await db.select().from(chats).where(eq(chats.id, seeded.chatId))).toHaveLength(1);
  });
});

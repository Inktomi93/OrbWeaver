import type { TagAttachedEntity, TagTargetRef } from "@orb/contracts/tag";
import { TAG_REACH_PREVIEW_LIMIT, TAG_TARGET_TYPES } from "@orb/contracts/tag";
import { characterTags, personaTags, presetTags, worldBookTags } from "@orb/db";
import { DomainForbiddenError } from "@orb/kit/errors";
import { createTagService } from "@orb/server/domain/tag";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeTagHarness, principal, seedCharacter, seedChat, seedPersona, seedPreset, seedTag, seedUser, seedWorldBook } from "../_support.ts";

test("every target kind returns an adopted destination and the caller reaches its reader", async () => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const harness = makeTagHarness(db);
  const calls: TagTargetRef[] = [];
  const svc = createTagService({
    ...harness.ctx,
    readAttachedEntity: (caller, target): Promise<TagAttachedEntity> => {
      expect(caller.userId).toBe(owner);
      calls.push(target);
      return Promise.resolve({ ...target, name: `Named ${target.targetType}` });
    },
  });
  const tagId = await seedTag(db, owner);
  const chatId = await seedChat(db);
  harness.allowChat(chatId);
  const targets: TagTargetRef[] = [
    { targetType: "character", targetId: await seedCharacter(db, owner) },
    { targetType: "chat", targetId: chatId },
    { targetType: "worldBook", targetId: await seedWorldBook(db, owner) },
    { targetType: "persona", targetId: await seedPersona(db, owner) },
    { targetType: "preset", targetId: await seedPreset(db, owner) },
  ];
  for (const target of targets) {
    await svc.attachTag({ principal: principal(owner), tagId, ...target });
    expect(await svc.listAttachedEntities({ principal: principal(owner), tagId, targetType: target.targetType })).toEqual({
      entities: [{ ...target, name: `Named ${target.targetType}` }],
      hasMore: false,
    });
  }
  expect(calls).toEqual(targets);
});

test("foreign labels and cross-owner junction targets do not expose destinations", async () => {
  const db = await freshDb();
  const alice = await seedUser(db, "user_alice");
  const bob = await seedUser(db, "user_bob");
  const svc = createTagService(makeTagHarness(db).ctx);
  const tagId = await seedTag(db, alice);
  await db.insert(characterTags).values({ tagId, characterId: await seedCharacter(db, bob), status: "accepted" });
  await db.insert(worldBookTags).values({ tagId, worldBookId: await seedWorldBook(db, bob) });
  await db.insert(personaTags).values({ tagId, personaId: await seedPersona(db, bob) });
  await db.insert(presetTags).values({ tagId, presetId: await seedPreset(db, bob) });
  for (const targetType of TAG_TARGET_TYPES) {
    expect(await svc.listAttachedEntities({ principal: principal(alice), tagId, targetType })).toEqual({ entities: [], hasMore: false });
    await expect(svc.listAttachedEntities({ principal: principal(bob), tagId, targetType })).rejects.toThrow();
  }
  const owned = await seedCharacter(db, alice, "character_owned");
  await svc.attachTag({ principal: principal(alice), tagId, targetType: "character", targetId: owned });
  expect((await svc.listAttachedEntities({ principal: principal(alice), tagId, targetType: "character" })).entities).toEqual([
    { targetType: "character", targetId: owned, name: owned },
  ]);
});

test("pending-only labels have no adopted doors and previews state their bound", async () => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const svc = createTagService(makeTagHarness(db).ctx);
  const tagId = await seedTag(db, owner);
  const pending = await seedCharacter(db, owner, "character_pending");
  await svc.attachTag({ principal: principal(owner), tagId, targetType: "character", targetId: pending, status: "pending" });
  expect(await svc.listAttachedEntities({ principal: principal(owner), tagId, targetType: "character" })).toEqual({ entities: [], hasMore: false });
  for (let index = 0; index <= TAG_REACH_PREVIEW_LIMIT; index += 1) {
    const characterId = await seedCharacter(db, owner, `character_${String(index).padStart(3, "0")}`);
    await svc.attachTag({ principal: principal(owner), tagId, targetType: "character", targetId: characterId });
  }
  const reach = await svc.listAttachedEntities({ principal: principal(owner), tagId, targetType: "character" });
  expect(reach.entities.map((entity) => entity.targetId)).toEqual(
    Array.from({ length: TAG_REACH_PREVIEW_LIMIT }, (_unused, index) => `character_${String(index).padStart(3, "0")}`),
  );
  expect(reach.hasMore).toBe(true);
});

test("revoked target authority removes its door and unrelated reader failures propagate", async () => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const harness = makeTagHarness(db);
  const tagId = await seedTag(db, owner);
  const chatId = await seedChat(db);
  harness.allowChat(chatId);
  const writer = createTagService(harness.ctx);
  await writer.attachTag({ principal: principal(owner), tagId, targetType: "chat", targetId: chatId });
  const revoked = createTagService({ ...harness.ctx, readAttachedEntity: () => Promise.reject(new DomainForbiddenError("membership revoked")) });
  expect(await revoked.listAttachedEntities({ principal: principal(owner), tagId, targetType: "chat" })).toEqual({ entities: [], hasMore: false });
  const broken = createTagService({ ...harness.ctx, readAttachedEntity: () => Promise.reject(new Error("database unavailable")) });
  await expect(broken.listAttachedEntities({ principal: principal(owner), tagId, targetType: "chat" })).rejects.toThrow("database unavailable");
});

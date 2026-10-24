// @subject packages/server/src/domain/settings/seeder/content.ts
// @subject packages/server/src/entry/boot/seed-user-content.ts
// @subject packages/server/src/domain/tag/verbs/seed-tag.ts

import { userSeedLedger } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { createReadSeededKeys } from "@orb/server/domain/settings";
import { expect, test } from "@orb/testkit/node";
import { refuseWrites } from "@orb/testkit/node/composed";
import { principal } from "@orb/testkit/node/helpers";
import { vi } from "vitest";
import { FIRST_CARD, PERSONA_ITEM } from "./content.fixtures.ts";

test("a refused real ledger write leaves the created card retryable without duplicating it", async ({ harness, db, app, services }) => {
  const user = await harness.actor();
  const actor = await principal(harness, user.id);
  await using refusal = await refuseWrites(db, { table: userSeedLedger, event: "INSERT", message: "ledger refused" });
  await expect(app.contentSeeder.ensureSeeded(actor)).resolves.toBeUndefined();
  const before = await services.character.findByHandle({ ownerId: user.id, handle: FIRST_CARD.handle });
  expect(before).not.toBeNull();
  expect(await createReadSeededKeys(databaseHandle(db))(user.id)).toEqual(new Set());
  await refusal.lift();
  await app.contentSeeder.ensureSeeded(actor);
  expect(await services.character.findByHandle({ ownerId: user.id, handle: FIRST_CARD.handle })).toEqual(before);
  expect([...(await createReadSeededKeys(databaseHandle(db))(user.id))]).toContain(FIRST_CARD.key);
});

test("same-user concurrent calls share the real pass while a second account receives its own card and ledger", async ({ harness, db, app, services }) => {
  const first = await harness.actor();
  const second = await harness.actor();
  const actor = await principal(harness, first.id);
  const neighbor = await principal(harness, second.id);
  const seedCard = vi.spyOn(app.characterSeeder, "seedCard");
  const pending = app.contentSeeder.ensureSeeded(actor);
  expect(app.contentSeeder.ensureSeeded(actor)).toBe(pending);
  await pending;
  await app.contentSeeder.ensureSeeded(neighbor);
  expect(seedCard.mock.calls.filter(([, handle]) => handle === FIRST_CARD.handle).map(([p]) => p)).toEqual([actor, neighbor]);
  expect([...(await createReadSeededKeys(databaseHandle(db))(first.id))]).toContain(FIRST_CARD.key);
  expect([...(await createReadSeededKeys(databaseHandle(db))(second.id))]).toContain(FIRST_CARD.key);
  expect(await services.character.findByHandle({ ownerId: second.id, handle: FIRST_CARD.handle })).not.toBeNull();
});

test("the real-stack persona false outcome leaves its key unrecorded but still settles this process's pass", async ({ harness, db, app, services }) => {
  const user = await harness.actor();
  const actor = await principal(harness, user.id);
  await app.contentSeeder.ensureSeeded(actor);
  expect(await services.persona.list({ principal: actor })).toEqual([]);
  const recorded = await createReadSeededKeys(databaseHandle(db))(user.id);
  expect([...recorded]).toContain(FIRST_CARD.key);
  expect([...recorded]).not.toContain(PERSONA_ITEM.key);
  const reads = vi.spyOn(services.settings, "getUserSettings");
  await app.contentSeeder.ensureSeeded(actor);
  expect(reads).not.toHaveBeenCalled();
});

// @subject packages/server/src/domain/settings/seeder/content.ts
// @subject packages/server/src/entry/boot/seed-user-content.ts
// @subject packages/server/src/domain/tag/verbs/seed-tag.ts

import "@orb/testkit/node/composed-real.ts";
import type { Db } from "@orb/db";
import { characterTags, tags, userSeedLedger } from "@orb/db";
import { SEED_MANIFEST } from "@orb/default-content";
import { createCharacterSeedStep, DEFAULT_CHARACTER_CARDS } from "@orb/server/domain/character";
import { createSeedPersonaWithCompletion } from "@orb/server/domain/persona";
import type { ContentSeedStep } from "@orb/server/domain/settings";
import { createReadSeededKeys, createSettingsComposedOps, createUserContentSeeder, recordSeededItemKeys } from "@orb/server/domain/settings";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { and, eq, sql } from "drizzle-orm";
import { vi } from "vitest";

const FIRST_CARD = SEED_MANIFEST.find((item) => item.kind === "character");
if (FIRST_CARD?.kind !== "character") {
  throw new Error("the canonical seed manifest has no character");
}
const PERSONA_ITEM = SEED_MANIFEST.find((item) => item.kind === "persona");
if (PERSONA_ITEM === undefined) {
  throw new Error("the canonical seed manifest has no persona");
}

/** Drive the real ledger owner with a real owner operation, not a fake ledger or a copied manifest interpreter. */
function ledgerPolicy(
  db: Db,
  now: () => number,
  settings: Parameters<typeof createSettingsComposedOps>[0],
  steps: readonly ContentSeedStep[],
): ReturnType<typeof createUserContentSeeder> {
  return createUserContentSeeder({
    enabled: () => true,
    steps,
    now,
    seededKeys: createReadSeededKeys(db),
    recordSeeded: (userId, keys, at) => recordSeededItemKeys(db, userId, keys, at),
    legacyLatches: createSettingsComposedOps(settings).legacyLatches,
  });
}

test("a recorded deleted card stays deleted across a cold seed; its real tag rows remain card/pending suggestions", async ({
  harness,
  db,
  app,
  services,
  clock,
}) => {
  const user = await seedUser(db);
  const actor = await principal(harness, user.id);
  await app.contentSeeder.ensureSeeded(actor);
  const card = await services.character.findByHandle({ ownerId: user.id, handle: FIRST_CARD.handle });
  if (card === null) {
    throw new Error("the real manifest seed did not create its first card");
  }
  const authored = DEFAULT_CHARACTER_CARDS.find((row) => row.input.handle === FIRST_CARD.handle);
  const attached = await db
    .select({ name: tags.name, source: tags.source, ownerId: tags.ownerId, status: characterTags.status })
    .from(characterTags)
    .innerJoin(tags, eq(tags.id, characterTags.tagId))
    .where(eq(characterTags.characterId, card.characterId));
  expect(attached.map((row) => row.name).toSorted()).toEqual(authored?.tags.toSorted());
  expect(attached.length).toBeGreaterThan(0);
  expect(attached.every((row) => row.source === "card" && row.status === "pending" && row.ownerId === user.id)).toBe(true);
  await services.character.remove({ principal: actor, characterId: card.characterId });
  const cold = ledgerPolicy(db, clock.now, services.settings, [
    {
      key: FIRST_CARD.key,
      seed: createCharacterSeedStep((p, handle) => app.characterSeeder.seedCard(p, handle), FIRST_CARD.handle),
    },
  ]);
  await cold.ensureSeeded(actor);
  expect(await services.character.findByHandle({ ownerId: user.id, handle: FIRST_CARD.handle })).toBeNull();
  expect(
    await db
      .select()
      .from(userSeedLedger)
      .where(and(eq(userSeedLedger.userId, user.id), eq(userSeedLedger.itemKey, FIRST_CARD.key))),
  ).toHaveLength(1);
});

test("a refused real ledger write leaves the created card retryable without duplicating it", async ({ harness, db, app, services, clock }) => {
  const user = await seedUser(db);
  const actor = await principal(harness, user.id);
  const step = { key: FIRST_CARD.key, seed: createCharacterSeedStep((p, handle) => app.characterSeeder.seedCard(p, handle), FIRST_CARD.handle) };
  const policy = ledgerPolicy(db, clock.now, services.settings, [step]);
  await db.run(sql`CREATE TRIGGER refuse_seed_record BEFORE INSERT ON user_seed_ledger BEGIN SELECT RAISE(ABORT, 'ledger refused'); END`);
  await expect(policy.ensureSeeded(actor)).resolves.toBeUndefined();
  const before = await services.character.findByHandle({ ownerId: user.id, handle: FIRST_CARD.handle });
  expect(before).not.toBeNull();
  expect(await createReadSeededKeys(db)(user.id)).toEqual(new Set());
  await db.run(sql`DROP TRIGGER refuse_seed_record`);
  await policy.ensureSeeded(actor);
  expect(await services.character.findByHandle({ ownerId: user.id, handle: FIRST_CARD.handle })).toEqual(before);
  expect(await createReadSeededKeys(db)(user.id)).toEqual(new Set([FIRST_CARD.key]));
});

test("same-user concurrent calls share the real pass while a second account receives its own card and ledger", async ({
  harness,
  db,
  app,
  services,
  clock,
}) => {
  const first = await seedUser(db);
  const second = await seedUser(db);
  const actor = await principal(harness, first.id);
  const neighbor = await principal(harness, second.id);
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const realStep = createCharacterSeedStep((p, handle) => app.characterSeeder.seedCard(p, handle), FIRST_CARD.handle);
  const seed = vi.fn<ContentSeedStep["seed"]>(async (p) => {
    await held;
    return realStep(p);
  });
  const policy = ledgerPolicy(db, clock.now, services.settings, [{ key: FIRST_CARD.key, seed }]);
  const pending = policy.ensureSeeded(actor);
  try {
    expect(policy.ensureSeeded(actor)).toBe(pending);
  } finally {
    release();
  }
  await pending;
  await policy.ensureSeeded(neighbor);
  expect(seed.mock.calls.map(([p]) => p)).toEqual([actor, neighbor]);
  expect(await createReadSeededKeys(db)(first.id)).toEqual(new Set([FIRST_CARD.key]));
  expect(await createReadSeededKeys(db)(second.id)).toEqual(new Set([FIRST_CARD.key]));
  expect(await services.character.findByHandle({ ownerId: second.id, handle: FIRST_CARD.handle })).not.toBeNull();
});

test("the real-stack persona false outcome leaves its key unrecorded but still settles this process's pass", async ({ harness, db, app, services, clock }) => {
  const user = await seedUser(db);
  const actor = await principal(harness, user.id);
  const settingsOps = createSettingsComposedOps(services.settings);
  const seed = createSeedPersonaWithCompletion({ ensureSeeded: (p) => app.personaSeeder.ensureSeeded(p), isSeeded: settingsOps.personaSeeded });
  const policy = ledgerPolicy(db, clock.now, services.settings, [{ key: PERSONA_ITEM.key, legacyLatch: "persona", seed }]);
  await policy.ensureSeeded(actor);
  expect(await services.persona.list({ principal: actor })).toEqual([]);
  expect(await createReadSeededKeys(db)(user.id)).toEqual(new Set());
  const reads = vi.spyOn(services.settings, "getUserSettings");
  await policy.ensureSeeded(actor);
  expect(reads).not.toHaveBeenCalled();
});

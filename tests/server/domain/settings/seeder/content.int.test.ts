// @subject packages/server/src/domain/settings/seeder/content.ts
// @subject packages/server/src/entry/boot/seed-user-content.ts
// @subject packages/server/src/domain/tag/verbs/seed-tag.ts

import { userSeedLedger } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { createCharacterSeedStep } from "@orb/server/domain/character";
import { createSeedPersonaWithCompletion } from "@orb/server/domain/persona";
import type { ContentSeedStep } from "@orb/server/domain/settings";
import { createReadSeededKeys, createSettingsComposedOps } from "@orb/server/domain/settings";
import { expect, test } from "@orb/testkit/node";
import { refuseWrites } from "@orb/testkit/node/composed";
import { principal } from "@orb/testkit/node/helpers";
import { vi } from "vitest";
import { FIRST_CARD, ledgerPolicy, PERSONA_ITEM } from "./content.fixtures.ts";

test("a refused real ledger write leaves the created card retryable without duplicating it", async ({ harness, db, app, services, clock }) => {
  const user = await harness.actor();
  const actor = await principal(harness, user.id);
  const step = { key: FIRST_CARD.key, seed: createCharacterSeedStep((p, handle) => app.characterSeeder.seedCard(p, handle), FIRST_CARD.handle) };
  const policy = ledgerPolicy(db, clock.now, services.settings, [step]);
  await using refusal = await refuseWrites(db, { table: userSeedLedger, event: "INSERT", message: "ledger refused" });
  await expect(policy.ensureSeeded(actor)).resolves.toBeUndefined();
  const before = await services.character.findByHandle({ ownerId: user.id, handle: FIRST_CARD.handle });
  expect(before).not.toBeNull();
  expect(await createReadSeededKeys(databaseHandle(db))(user.id)).toEqual(new Set());
  await refusal.lift();
  await policy.ensureSeeded(actor);
  expect(await services.character.findByHandle({ ownerId: user.id, handle: FIRST_CARD.handle })).toEqual(before);
  expect(await createReadSeededKeys(databaseHandle(db))(user.id)).toEqual(new Set([FIRST_CARD.key]));
});

test("same-user concurrent calls share the real pass while a second account receives its own card and ledger", async ({
  harness,
  db,
  app,
  services,
  clock,
}) => {
  const first = await harness.actor();
  const second = await harness.actor();
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
  expect(await createReadSeededKeys(databaseHandle(db))(first.id)).toEqual(new Set([FIRST_CARD.key]));
  expect(await createReadSeededKeys(databaseHandle(db))(second.id)).toEqual(new Set([FIRST_CARD.key]));
  expect(await services.character.findByHandle({ ownerId: second.id, handle: FIRST_CARD.handle })).not.toBeNull();
});

test("the real-stack persona false outcome leaves its key unrecorded but still settles this process's pass", async ({ harness, db, app, services, clock }) => {
  const user = await harness.actor();
  const actor = await principal(harness, user.id);
  const settingsOps = createSettingsComposedOps(services.settings);
  const seed = createSeedPersonaWithCompletion({ ensureSeeded: (p) => app.personaSeeder.ensureSeeded(p), isSeeded: settingsOps.personaSeeded });
  const policy = ledgerPolicy(db, clock.now, services.settings, [{ key: PERSONA_ITEM.key, legacyLatch: "persona", seed }]);
  await policy.ensureSeeded(actor);
  expect(await services.persona.list({ principal: actor })).toEqual([]);
  expect(await createReadSeededKeys(databaseHandle(db))(user.id)).toEqual(new Set());
  const reads = vi.spyOn(services.settings, "getUserSettings");
  await policy.ensureSeeded(actor);
  expect(reads).not.toHaveBeenCalled();
});

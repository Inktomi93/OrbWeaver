// @subject packages/server/src/domain/persona/seeder/default.ts
// @subject packages/server/src/domain/persona/verbs/find-seeded-default.ts
// @subject packages/server/src/domain/settings/verbs/seed-policy.ts

import { readSeedAvatar } from "@orb/default-content";
import { createSeedAvatarOps } from "@orb/server/domain/assets";
import { createDefaultPersonaSeeder, createFindSeededDefault } from "@orb/server/domain/persona";
import { createPersonaSeedSettings } from "@orb/server/domain/settings";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { sql } from "drizzle-orm";

test("a real-stack seed performs no persona or latch write; automation creates the unchanged authored artifact", async ({ harness, db, app, services }) => {
  const user = await seedUser(db);
  const actor = await principal(harness, user.id);
  await app.personaSeeder.ensureSeeded(actor);
  expect(await services.persona.list({ principal: actor })).toEqual([]);
  const untouched = (await services.settings.getUserSettings({ principal: actor })).config;
  expect(untouched.onboarding.defaultPersonaSeeded).toBe(false);
  expect(untouched.seeds.defaultPersonaId).toBeNull();
  const latch = createPersonaSeedSettings(services.settings);
  const automated = createDefaultPersonaSeeder({
    autoSeedEnabled: () => true,
    createPersona: (args) => services.persona.create(args),
    ...createSeedAvatarOps({
      readAvatar: readSeedAvatar,
      store: (args) => services.assets.store(args),
      addToGallery: (args) => services.assets.addToGallery(args),
    }).persona,
    findSeededDefault: createFindSeededDefault((args) => services.persona.list(args)),
    ...latch,
  });
  await automated.ensureSeeded(actor);
  const rows = await services.persona.list({ principal: actor });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ name: "Traveler", title: "Your first persona", description: "", metadata: { seededDefault: true } });
  expect(rows[0]?.avatarAssetId).not.toBeNull();
  const config = (await services.settings.getUserSettings({ principal: actor })).config;
  expect(config.seeds.defaultPersonaId).toBe(rows[0]?.id);
  expect(config.seeds.currentPersonaId).toBe(rows[0]?.id);
  expect(config.onboarding.defaultPersonaSeeded).toBe(true);
});

test("an automation stack leaves the first-run ask intact for exactly the accounts the policy declines", async ({ harness, db, services }) => {
  const asker = await principal(harness, (await seedUser(db)).id);
  const other = await principal(harness, (await seedUser(db)).id);
  const seeder = createDefaultPersonaSeeder({
    autoSeedEnabled: (who) => who.userId !== asker.userId,
    createPersona: (args) => services.persona.create(args),
    storeAvatar: () => Promise.resolve(null),
    findSeededDefault: createFindSeededDefault((args) => services.persona.list(args)),
    ...createPersonaSeedSettings(services.settings),
  });
  await seeder.ensureSeeded(asker);
  await seeder.ensureSeeded(other);
  expect(await services.persona.list({ principal: asker })).toEqual([]);
  expect((await services.settings.getUserSettings({ principal: asker })).config.onboarding.defaultPersonaSeeded).toBe(false);
  expect(await services.persona.list({ principal: other })).toHaveLength(1);
});

test("a lost persona latch heals only its own artifact and independently preserves the user's explicit pick", async ({ harness, db, services }) => {
  const user = await seedUser(db);
  const stranger = await seedUser(db);
  const actor = await principal(harness, user.id);
  const neighbor = await principal(harness, stranger.id);
  await services.persona.create({ principal: neighbor, input: { name: "Foreign artifact", description: "", metadata: { seededDefault: true } } });
  const mine = await services.persona.create({ principal: actor, input: { name: "Traveler", description: "my authored identity" } });
  const find = createFindSeededDefault((args) => services.persona.list(args));
  expect(await find(actor)).toBeNull();
  const survivor = await services.persona.create({ principal: actor, input: { name: "Traveler", description: "", metadata: { seededDefault: true } } });
  await services.settings.updateUserSettingsSection({ principal: actor, input: { section: "seeds", patch: { defaultPersonaId: mine.id } } });
  const seeder = createDefaultPersonaSeeder({
    autoSeedEnabled: () => true,
    createPersona: (args) => services.persona.create(args),
    storeAvatar: () => Promise.reject(new Error("an artifact heal must not store art")),
    findSeededDefault: find,
    ...createPersonaSeedSettings(services.settings),
  });
  await seeder.ensureSeeded(actor);
  expect(await services.persona.list({ principal: actor })).toHaveLength(2);
  const config = (await services.settings.getUserSettings({ principal: actor })).config;
  expect(config.seeds.defaultPersonaId).toBe(mine.id);
  expect(config.seeds.currentPersonaId).toBe(survivor.id);
  expect(config.onboarding.defaultPersonaSeeded).toBe(true);
});

test("a real database refusal of the completion latch leaves pointers landed and the seed retryable", async ({ harness, db, services }) => {
  const user = await seedUser(db);
  const actor = await principal(harness, user.id);
  const persona = await services.persona.create({ principal: actor, input: { name: "Traveler", description: "", metadata: { seededDefault: true } } });
  const latch = createPersonaSeedSettings(services.settings);
  await services.settings.getUserSettings({ principal: actor });
  await db.run(
    sql`CREATE TRIGGER refuse_persona_seed_latch BEFORE UPDATE OF config ON user_settings WHEN json_extract(NEW.config, '$.onboarding.defaultPersonaSeeded') = 1 BEGIN SELECT RAISE(ABORT, 'latch refused'); END`,
  );
  await expect(latch.markSeeded(actor, persona.id)).rejects.toThrow();
  const partial = (await services.settings.getUserSettings({ principal: actor })).config;
  expect(partial.onboarding.defaultPersonaSeeded).toBe(false);
  expect(partial.seeds.defaultPersonaId).toBe(persona.id);
  expect(partial.seeds.currentPersonaId).toBe(persona.id);
  await db.run(sql`DROP TRIGGER refuse_persona_seed_latch`);
  await latch.markSeeded(actor, persona.id);
  expect(await latch.isSeeded(actor)).toBe(true);
});

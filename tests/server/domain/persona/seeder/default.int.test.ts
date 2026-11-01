// @subject packages/server/src/domain/persona/seeder/default.ts
// @subject packages/server/src/domain/persona/verbs/find-seeded-default.ts
// @subject packages/server/src/domain/settings/verbs/seed-policy.ts

import { closeDb, userSettings } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createFindSeededDefault } from "@orb/server/domain/persona";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, freshDb, refuseWrites } from "@orb/testkit/node/composed";
import { principal } from "@orb/testkit/node/helpers";
import { vi } from "vitest";
import { z } from "zod";

// An automation-started stack: the one posture whose persona seeder creates the default instead of asking.
const AUTOMATION_STACK = { ["E2E_HARNESS"]: "on" } as const;

test("a real-stack seed performs no persona or latch write; automation creates the unchanged authored artifact", async ({ harness, app, services }) => {
  const user = await harness.actor();
  const actor = await principal(harness, user.id);
  await app.contentSeeder.ensureSeeded(actor);
  expect(await services.persona.list({ principal: actor })).toEqual([]);
  const untouched = (await services.settings.getUserSettings({ principal: actor })).config;
  expect(untouched.onboarding.defaultPersonaSeeded).toBe(false);
  expect(untouched.seeds.defaultPersonaId).toBeNull();
  await using automated = await createServerHarness({ env: AUTOMATION_STACK });
  const subject = await principal(automated, (await automated.actor()).id);
  await automated.app.contentSeeder.ensureSeeded(subject);
  const rows = await automated.services.persona.list({ principal: subject });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ name: "Traveler", title: "Your first persona", description: "", metadata: { seededDefault: true } });
  expect(rows[0]?.avatarAssetId).not.toBeNull();
  const config = (await automated.services.settings.getUserSettings({ principal: subject })).config;
  expect(config.seeds.defaultPersonaId).toBe(rows[0]?.id);
  expect(config.seeds.currentPersonaId).toBe(rows[0]?.id);
  expect(config.onboarding.defaultPersonaSeeded).toBe(true);
});

test("an automation stack leaves the first-run ask intact for exactly the accounts the policy declines", async () => {
  const askerHandle = castId<Handle>("first-run-asker");
  await using root = await createServerHarness({ env: { ...AUTOMATION_STACK, ["E2E_FIRST_RUN_ASK_HANDLES"]: askerHandle } });
  const asker = await principal(root, (await root.actor({ handle: askerHandle })).id);
  const other = await principal(root, (await root.actor()).id);
  await root.app.contentSeeder.ensureSeeded(asker);
  await root.app.contentSeeder.ensureSeeded(other);
  expect(await root.services.persona.list({ principal: asker })).toEqual([]);
  expect((await root.services.settings.getUserSettings({ principal: asker })).config.onboarding.defaultPersonaSeeded).toBe(false);
  expect(await root.services.persona.list({ principal: other })).toHaveLength(1);
});

test("a lost persona latch heals only its own artifact and independently preserves the user's explicit pick", async () => {
  await using root = await createServerHarness({ env: AUTOMATION_STACK });
  const { services } = root;
  const actor = await principal(root, (await root.actor()).id);
  const neighbor = await principal(root, (await root.actor()).id);
  await services.persona.create({ principal: neighbor, input: { name: "Foreign artifact", description: "", metadata: { seededDefault: true } } });
  const mine = await services.persona.create({ principal: actor, input: { name: "Traveler", description: "my authored identity" } });
  expect(await createFindSeededDefault((args) => services.persona.list(args))(actor)).toBeNull();
  const survivor = await services.persona.create({ principal: actor, input: { name: "Traveler", description: "", metadata: { seededDefault: true } } });
  await services.settings.updateUserSettingsSection({ principal: actor, input: { section: "seeds", patch: { defaultPersonaId: mine.id } } });
  // A fresh account's seed stores the shipped persona art, which names the bytes the heal path must not store.
  const fresh = await principal(root, (await root.actor()).id);
  await root.app.contentSeeder.ensureSeeded(fresh);
  const freshAvatar = (await services.persona.list({ principal: fresh }))[0]?.avatarAssetId;
  const art = freshAvatar === null || freshAvatar === undefined ? undefined : await services.assets.assetCasRefById(freshAvatar);
  if (art === undefined) {
    throw new Error("the fresh seed stored no persona art");
  }
  const store = vi.spyOn(services.assets, "store");
  await root.app.contentSeeder.ensureSeeded(actor);
  expect(
    z
      .array(z.object({ hash: z.string() }))
      .parse(await Promise.all(store.mock.results.map((result): unknown => result.value)))
      .map(({ hash }) => hash),
  ).not.toContain(art.hash);
  expect(await services.persona.list({ principal: actor })).toHaveLength(2);
  const config = (await services.settings.getUserSettings({ principal: actor })).config;
  expect(config.seeds.defaultPersonaId).toBe(mine.id);
  expect(config.seeds.currentPersonaId).toBe(survivor.id);
  expect(config.onboarding.defaultPersonaSeeded).toBe(true);
});

test("a real database refusal of the completion latch leaves pointers landed and the next process's seed completes it", async () => {
  await using resources = new AsyncDisposableStack();
  const db = await freshDb();
  resources.defer(() => closeDb(db));
  await using root = await createServerHarness({ db, env: AUTOMATION_STACK });
  const { services } = root;
  const actor = await principal(root, (await root.actor()).id);
  const persona = await services.persona.create({ principal: actor, input: { name: "Traveler", description: "", metadata: { seededDefault: true } } });
  await services.settings.getUserSettings({ principal: actor });
  await using refusal = await refuseWrites(root.db, {
    table: userSettings,
    event: "UPDATE",
    columns: [userSettings.config],
    when: "json_extract(NEW.config, '$.onboarding.defaultPersonaSeeded') = 1",
    message: "latch refused",
  });
  await root.app.contentSeeder.ensureSeeded(actor);
  const partial = (await services.settings.getUserSettings({ principal: actor })).config;
  expect(partial.onboarding.defaultPersonaSeeded).toBe(false);
  expect(partial.seeds.defaultPersonaId).toBe(persona.id);
  expect(partial.seeds.currentPersonaId).toBe(persona.id);
  await refusal.lift();
  // The content pass settles per process, so the retry is the next boot's.
  await root[Symbol.asyncDispose]();
  await using next = await createServerHarness({ db, ownerId: root.ownerId, env: AUTOMATION_STACK });
  await next.app.contentSeeder.ensureSeeded(actor);
  expect((await next.services.settings.getUserSettings({ principal: actor })).config.onboarding.defaultPersonaSeeded).toBe(true);
  expect(await next.services.persona.list({ principal: actor })).toHaveLength(1);
});

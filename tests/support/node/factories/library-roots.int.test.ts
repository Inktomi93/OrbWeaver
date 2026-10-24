// @subject packages/server/src/domain/character/verbs/create.ts
// @subject tests/support/node/factories/asset.ts
// @subject tests/support/node/factories/rows/character.ts
// @subject tests/support/node/factories/rows/persona.ts
// @subject tests/support/node/factories/rows/preset.ts
// @subject tests/support/node/factories/rows/asset.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { createPersonaSchema, personaDetailSchema } from "@orb/contracts/persona";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { assets, characters, personas, presets } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { cardTokenSize } from "@orb/server/domain/character";
import { cardContentHash } from "@orb/server/primitives/serde/card";
import { eq } from "drizzle-orm";
import { createFrozenClock } from "../../iso/clock.ts";
import { makePromptConfig } from "../../iso/preset-config.ts";
import { seedCorpusLibraries } from "../corpus-seed.ts";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { makeAssetBytes } from "./asset.ts";
import { seedAssetRows, seedCharacterRows, seedPersonaRows, seedPresetRows } from "./rows.ts";

test("actual character birth persists the injected clock on both business stamps", async () => {
  const clock = createFrozenClock(1_100_000_000_123);
  await using root = await createServerHarness({ clock });
  const principal = await root.principalFor(root.ownerId);
  const created = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "birth-clock", name: "Clock witness", description: "The ledger keeper." }),
  });
  const row = await root.db.select().from(characters).where(eq(characters.id, created.id)).get();
  expect(row).toMatchObject({ id: created.id, ownerId: principal.userId, createdAt: clock.now(), updatedAt: clock.now() });
});

test("stored asset capture preserves actual CAS bytes, owner-local dedup and refusal before index effects", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const bytes = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  const params = { principal, bytes, kind: "avatar", mime: "image/png", enforceMagic: true } as const;
  const first = await seedAssetRows(root, params);
  root.clock.advance(2000);
  const repeated = await seedAssetRows(root, { ...params, kind: "gallery" });
  expect(first.stored.created).toBe(true);
  expect(repeated.stored).toEqual({ ...first.stored, created: false });
  expect(repeated.row).toEqual(first.row);
  expect(first.row).toMatchObject({ id: first.stored.assetId, ownerId: root.ownerId, hash: first.stored.hash, width: 8, height: 8 });
  expect(Array.from((await root.app.assets.readOwnedAssetBytes(principal, first.row.id)).bytes)).toEqual(Array.from(bytes));
  const other = await root.actor();
  const otherPrincipal = await root.principalFor(other.id);
  const separate = await seedAssetRows(root, { ...params, principal: otherPrincipal });
  expect(separate.row.id).not.toBe(first.row.id);
  expect(separate.row).toMatchObject({ ownerId: other.id, hash: first.row.hash, uploadedAt: root.clock.now() });
  const before = await root.db.select().from(assets).orderBy(assets.id);
  await expect(seedAssetRows(root, { ...params, maxBytes: bytes.byteLength - 1 })).rejects.toThrow("over the");
  expect(await root.db.select().from(assets).orderBy(assets.id)).toEqual(before);
});

test("created card and persona captures retain writer denorms, metadata and their actual avatar-joined projections", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const avatar = await seedAssetRows(root, {
    principal,
    bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
    mime: "image/png",
    kind: "avatar",
  });
  const character = await seedCharacterRows(root, {
    principal,
    input: createCharacterSchema.parse({
      handle: "created-root",
      name: "Ledger keeper",
      description: "The keeper preserves every orbital witness.",
      avatarAssetId: avatar.row.id,
      greetings: [{ text: "Bring the orbital ledger." }],
    }),
  });
  expect(character.row).toMatchObject({ id: character.view.id, ownerId: root.ownerId, avatarAssetId: avatar.row.id, importHash: null, importTextHash: null });
  expect(character.row.contentHash).toBe(cardContentHash(character.row));
  expect(character.row.tokenSize).toBe(cardTokenSize(character.row));
  expect(character.view.avatarHash).toBe(avatar.row.hash);
  expect(await root.services.character.get({ principal, characterId: character.row.id })).toEqual(character.view);
  expect(await root.db.select().from(characters).where(eq(characters.id, character.row.id)).get()).toEqual(character.row);
  const persona = await seedPersonaRows(root, {
    principal,
    input: createPersonaSchema.parse({
      name: "Keeper's witness",
      description: "I record the keeper's testimony.",
      avatarAssetId: avatar.row.id,
      metadata: { sourceCharacterId: character.row.id, swapMacros: true, inject: { depth: 3, role: "system" } },
    }),
  });
  expect(persona.row).toMatchObject({
    id: persona.view.id,
    ownerId: root.ownerId,
    metadata: { sourceCharacterId: character.row.id, swapMacros: true, inject: { depth: 3, role: "system" } },
    createdAt: root.clock.now(),
    updatedAt: root.clock.now(),
  });
  expect(persona.view.avatarHash).toBe(avatar.row.hash);
  expect(await root.services.persona.get({ principal, personaId: persona.row.id })).toEqual(persona.view);
  expect(await root.db.select().from(personas).where(eq(personas.id, persona.row.id)).get()).toEqual(persona.row);
  const drifted = { ...persona.view };
  Reflect.deleteProperty(drifted, "avatarHash");
  expect(() => personaDetailSchema.parse(drifted)).toThrow("avatarHash");
});

test("routed preset captures preserve canonical defaults, custom config, name de-collision and born-here lineage", async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const first = await seedPresetRows(root, root.ownerId, { name: "Keeper's arrangement", kind: "custom" });
  const config = makePromptConfig({ params: { temperature: 0.4 } });
  const second = await seedPresetRows(root, root.ownerId, { name: first.view.name, kind: "custom", config });
  expect(first.row.config).toEqual(DEFAULT_PROMPT_CONFIG);
  expect(first.row.schemaVersion).toBe(DEFAULT_PROMPT_CONFIG.schemaVersion);
  expect(second.row.name).not.toBe(first.row.name);
  expect(second.row.id).not.toBe(first.row.id);
  expect(second.row.config).toEqual(config);
  expect(second.row.schemaVersion).toBe(config.schemaVersion);
  for (const produced of [first, second]) {
    expect(produced.row).toMatchObject({ ownerId: root.ownerId, forkedFrom: null, createdAt: root.clock.now(), updatedAt: root.clock.now() });
    expect(produced.view.isSystemDefault).toBe(false);
    expect(await caller.preset.get({ id: produced.row.id })).toEqual(produced.view);
    expect(await root.db.select().from(presets).where(eq(presets.id, produced.row.id)).get()).toEqual(produced.row);
  }
});

test("shared library roots expose complete canonical rows while retaining existing outward views and relations", async () => {
  await using root = await createServerHarness();
  const library = await seedCorpusLibraries(root);
  expect(library.rows.character.id).toBe(library.character.id);
  expect(library.rows.persona.id).toBe(library.persona.id);
  expect(library.rows.preset.id).toBe(library.preset.id);
  expect(library.rows.asset.id).toBe(library.asset.assetId);
  expect(library.snapshot.characterId).toBe(library.rows.character.id);
  expect(library.characterPersona).toMatchObject({ characterId: library.rows.character.id, personaId: library.rows.persona.id });
  expect(library.gallery.assetId).toBe(library.rows.asset.id);
  expect(library.rows).toEqual({
    asset: await root.db.select().from(assets).where(eq(assets.id, library.asset.assetId)).get(),
    character: await root.db.select().from(characters).where(eq(characters.id, library.character.id)).get(),
    persona: await root.db.select().from(personas).where(eq(personas.id, library.persona.id)).get(),
    preset: await root.db.select().from(presets).where(eq(presets.id, library.preset.id)).get(),
  });
});

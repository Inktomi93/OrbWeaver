// @subject tests/support/node/factories/persona.ts
// @subject tests/support/node/factories/preset.ts
// @subject tests/support/node/factories/roster-preset.ts
// @subject tests/support/node/factories/tag.ts
import "../composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import { personaDetailSchema } from "@orb/contracts/persona";
import { parsePresetFile, presetDetailSchema, presetImportOutcomeSchema } from "@orb/contracts/preset";
import { createRosterPresetSchema, rosterPresetViewSchema } from "@orb/contracts/roster-preset";
import { createTagSchema, pruneUnusedResultSchema, tagViewSchema } from "@orb/contracts/tag";
import { auditLogs, characterTags, personas, presets, tags } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { ensureSystemDefaultPreset } from "@orb/server/domain/preset";
import { eq } from "drizzle-orm";
import { makePromptConfig } from "../../iso/preset-config.ts";
import { CORPUS_LIBRARY_RULE_PRESET } from "../corpus-library-views.ts";
import { seedCorpusLibraries } from "../corpus-seed.ts";
import { expect, test } from "../fixtures.ts";
import type { ServerTestHarness } from "../server.ts";
import { createServerHarness } from "../server.ts";
import { makeAssetBytes, seedStoredAsset } from "./asset.ts";
import { seedCreatedCharacter } from "./character.ts";
import { seedPersonaFromCharacter } from "./persona.ts";
import { seedCreatedPreset, seedImportedPreset, seedUpdatedPreset } from "./preset.ts";
import { seedRosterPreset } from "./roster-preset.ts";
import { seedCharacterTag, seedCreatedTag, seedPersonaTag, seedTag, seedTagPrune } from "./tag.ts";

async function exportedPreset(root: ServerTestHarness, name: string): Promise<string> {
  const descriptor = root.app.portability.find((entity) => entity.kind === "preset");
  if (descriptor === undefined) {
    throw new Error("the actual preset export descriptor is missing");
  }
  for await (const file of descriptor.exportAll(root.ownerId)) {
    const text = new TextDecoder().decode(file.bytes);
    const parsed = parsePresetFile(JSON.parse(text));
    if (parsed.ok && parsed.name === name) {
      return text;
    }
  }
  throw new Error("the actual preset export omitted its source row");
}

test("character-derived personas retain native one-pass macro inversion, provenance and avatar projections", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const avatar = await seedStoredAsset(root, {
    principal,
    kind: "avatar",
    mime: "image/png",
    bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
  });
  const source = await seedCreatedCharacter(root, {
    principal,
    input: createCharacterSchema.parse({
      handle: "persona-source",
      name: "Keeper",
      description: "{{char}} greets {{user}} beside {{unchanged}}.",
      avatarAssetId: avatar.row.id,
    }),
  });
  const params = { principal, characterId: source.row.id };
  const swapped = await seedPersonaFromCharacter(root, { ...params, swapMacros: true });
  const unchanged = await seedPersonaFromCharacter(root, { ...params, swapMacros: false });
  expect(swapped.view.description).toBe("{{user}} greets {{char}} beside {{unchanged}}.");
  expect(unchanged.view.description).toBe(source.row.description);
  expect(swapped.row.id).not.toBe(unchanged.row.id);
  expect(swapped.row).toMatchObject({
    ownerId: root.ownerId,
    metadata: { sourceCharacterId: source.row.id, swapMacros: true },
    createdAt: root.clock.now(),
    updatedAt: root.clock.now(),
  });
  expect(unchanged.row.metadata).toMatchObject({ sourceCharacterId: source.row.id, swapMacros: false });
  expect(swapped.view.avatarHash).toBe(avatar.row.hash);
  expect(swapped.row).toEqual(await root.db.select().from(personas).where(eq(personas.id, swapped.view.id)).get());
  expect(await root.services.persona.get({ principal, personaId: swapped.row.id })).toEqual(swapped.view);
  expect(personaDetailSchema.parse(swapped.view)).toEqual(swapped.view);
  const drifted = structuredClone(swapped.view);
  Reflect.deleteProperty(drifted, "avatarHash");
  expect(personaDetailSchema.safeParse(drifted).success).toBe(false);
});

test("preset update captures the actual fork identity, convergence and explicit branch without changing the source", async () => {
  await using root = await createServerHarness();
  await ensureSystemDefaultPreset(root.db, root.clock.now);
  const caller = await root.internalCallerFor(root.ownerId);
  const source = (await caller.preset.list()).find((row) => row.isSystemDefault);
  if (source === undefined) {
    throw new Error("the native system preset seeder produced no default");
  }
  const before = await root.db.select().from(presets).where(eq(presets.id, source.id)).get();
  const first = await seedUpdatedPreset(root, root.ownerId, { id: source.id, config: makePromptConfig({ params: { temperature: 0.4 } }) });
  root.clock.advance(1000);
  const converged = await seedUpdatedPreset(root, root.ownerId, { id: source.id, config: makePromptConfig({ params: { temperature: 0.7 } }) });
  const branch = await seedUpdatedPreset(root, root.ownerId, { id: source.id, fork: { mode: "new", name: first.view.name } });
  expect(first.row.id).not.toBe(source.id);
  expect(converged.row.id).toBe(first.row.id);
  expect(converged.row.config.params.temperature).toBe(0.7);
  expect(converged.row.updatedAt).toBe(root.clock.now());
  expect(branch.row.id).not.toBe(first.row.id);
  expect(branch.row.name).not.toBe(first.row.name);
  for (const produced of [converged, branch]) {
    expect(produced.row).toMatchObject({
      id: produced.view.id,
      ownerId: root.ownerId,
      forkedFrom: source.id,
      schemaVersion: produced.row.config.schemaVersion,
    });
    expect(produced.view.isSystemDefault).toBe(false);
    expect(await caller.preset.get({ id: produced.row.id })).toEqual(produced.view);
  }
  expect(await root.db.select().from(presets).where(eq(presets.id, source.id)).get()).toEqual(before);
  expect(presetDetailSchema.parse(branch.view)).toEqual(branch.view);
  const drifted = structuredClone(branch.view);
  Reflect.deleteProperty(drifted, "forkedFrom");
  expect(presetDetailSchema.safeParse(drifted).success).toBe(false);
});

test("genuine preset export/import captures additive collision, content reuse and refusal without inventing rows", async () => {
  await using root = await createServerHarness();
  const source = await seedCreatedPreset(root, root.ownerId, {
    name: "Imported keeper",
    kind: "custom",
    config: makePromptConfig({ params: { temperature: 0.4 } }),
  });
  const text = await exportedPreset(root, source.view.name);
  const actor = await root.actor();
  const collision = await seedCreatedPreset(root, actor.id, {
    name: source.view.name,
    kind: "custom",
    config: makePromptConfig({ params: { temperature: 0.2 } }),
  });
  const imported = await seedImportedPreset(root, actor.id, { fileText: text });
  const repeated = await seedImportedPreset(root, actor.id, { fileText: text });
  expect(imported.outcome).toMatchObject({ ok: true, created: true, presetId: imported.row?.id, renamedFrom: source.view.name });
  expect(imported.row).toMatchObject({ ownerId: actor.id, config: source.row.config, forkedFrom: null });
  expect(imported.row?.id).not.toBe(collision.row.id);
  expect(imported.row?.name).not.toBe(collision.row.name);
  expect(repeated.outcome).toMatchObject({ ok: true, created: false, presetId: imported.row?.id });
  expect(repeated.row).toEqual(imported.row);
  expect(await root.db.select().from(presets).where(eq(presets.id, collision.row.id)).get()).toEqual(collision.row);
  const beforeRows = await root.db.select().from(presets).orderBy(presets.id);
  const beforeAudit = await root.db.select().from(auditLogs).orderBy(auditLogs.id);
  const refused = await seedImportedPreset(root, actor.id, { fileText: "{" });
  expect(refused.outcome.ok).toBe(false);
  expect(refused.row).toBeUndefined();
  expect(await root.db.select().from(presets).orderBy(presets.id)).toEqual(beforeRows);
  expect(await root.db.select().from(auditLogs).orderBy(auditLogs.id)).toEqual(beforeAudit);
  expect(presetImportOutcomeSchema.parse(imported.outcome)).toEqual(imported.outcome);
  const drifted = structuredClone(imported.outcome);
  Reflect.deleteProperty(drifted, "ok");
  expect(presetImportOutcomeSchema.safeParse(drifted).success).toBe(false);
});

test("roster creation retains its actual normalized and joined view alongside canonical member and rule rows", async () => {
  await using root = await createServerHarness();
  const library = await seedCorpusLibraries(root);
  const principal = await root.principalFor(root.ownerId);
  const second = await seedCreatedCharacter(root, {
    principal,
    input: createCharacterSchema.parse({
      handle: "roster-second",
      name: "Second keeper",
      description: "A second keeper.",
      avatarAssetId: library.asset.assetId,
    }),
  });
  const produced = await seedRosterPreset(root, {
    principal,
    input: createRosterPresetSchema.parse({
      name: "Joined keeper party",
      anchorPersonaId: library.persona.id,
      rules: [{ rulePresetId: CORPUS_LIBRARY_RULE_PRESET, knobs: {} }],
      members: [
        { kind: "character", characterId: second.row.id, position: 41, talkativeness: 0.25 },
        { kind: "character", characterId: library.character.id, position: 9, disabled: true },
      ],
    }),
  });
  expect(produced.view).toEqual(await root.services.rosterPreset.get({ principal, presetId: produced.preset.id }));
  expect(produced.view.members.map((row) => [row.characterId, row.position, row.name])).toEqual([
    [library.character.id, 0, library.character.name],
    [second.row.id, 1, second.view.name],
  ]);
  expect(produced.members.map((row) => [row.characterId, row.position])).toEqual(produced.view.members.map((row) => [row.characterId, row.position]));
  expect(produced.view.members).toMatchObject([
    { disabled: true, talkativeness: null },
    { disabled: false, talkativeness: 0.25 },
  ]);
  expect(produced.view.members[1]?.avatarHash).toBe(library.asset.hash);
  expect(produced.view.rules.map((rule) => rule.rulePresetId)).toEqual([CORPUS_LIBRARY_RULE_PRESET]);
  expect(produced.view.rules[0]?.knobs).toEqual(produced.rules[0]?.knobs);
  expect(Object.keys(produced.rules[0]?.knobs ?? {}).length).toBeGreaterThan(0);
  expect(rosterPresetViewSchema.parse(produced.view)).toEqual(produced.view);
  const drifted = structuredClone(produced.view);
  Reflect.deleteProperty(drifted, "members");
  expect(rosterPresetViewSchema.safeParse(drifted).success).toBe(false);
});

test("tag creation and isolated owner-wide pruning preserve pending and adopted references with actual native counts", async () => {
  await using root = await createServerHarness();
  const library = await seedCorpusLibraries(root);
  const principal = await root.principalFor(root.ownerId);
  const pending = await seedCreatedTag(root, { principal, input: createTagSchema.parse({ name: "  Pending   witness  " }) });
  const adopted = await seedCreatedTag(root, { principal, input: createTagSchema.parse({ name: "Adopted witness" }) });
  const orphan = await seedCreatedTag(root, { principal, input: createTagSchema.parse({ name: "Orphan witness" }) });
  const rowOnly = await seedTag(root, { principal, input: createTagSchema.parse({ name: "Row-only witness" }) });
  expect(pending.view).toMatchObject({
    name: "Pending witness",
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: null,
    isHiddenOnCard: false,
  });
  expect(pending.row.id).toBe(pending.view.id);
  expect(pending.row).toEqual(await root.db.select().from(tags).where(eq(tags.id, pending.view.id)).get());
  await seedCharacterTag(root, { principal, characterId: library.character.id, tagId: pending.row.id, status: "pending" });
  await seedPersonaTag(root, { principal, personaId: library.persona.id, tagId: adopted.row.id });
  const beforeConflict = await root.db.select().from(tags).orderBy(tags.id);
  await expect(seedCreatedTag(root, { principal, input: createTagSchema.parse({ name: "pending witness" }) })).rejects.toThrow();
  expect(await root.db.select().from(tags).orderBy(tags.id)).toEqual(beforeConflict);
  const foreign = await root.actor();
  const foreignTag = await seedTag(root, {
    principal: await root.principalFor(foreign.id),
    input: createTagSchema.parse({ name: "Foreign orphan" }),
  });
  const pruned = await seedTagPrune(root, { principal });
  expect(pruned.result).toEqual({ removed: 2 });
  expect(pruned.before.map((row) => row.id)).toContain(orphan.row.id);
  expect(pruned.after.map((row) => row.id)).toEqual(expect.arrayContaining([pending.row.id, adopted.row.id, library.tag.id]));
  expect(pruned.after.map((row) => row.id)).not.toContain(orphan.row.id);
  expect(pruned.after.map((row) => row.id)).not.toContain(rowOnly.id);
  expect(await root.db.select().from(characterTags).where(eq(characterTags.tagId, pending.row.id)).get()).toMatchObject({ status: "pending" });
  expect(await root.db.select().from(tags).where(eq(tags.id, foreignTag.id)).get()).toEqual(foreignTag);
  expect((await seedTagPrune(root, { principal })).result).toEqual({ removed: 0 });
  expect(tagViewSchema.parse(pending.view)).toEqual(pending.view);
  expect(pruneUnusedResultSchema.parse(pruned.result)).toEqual(pruned.result);
  const drifted = structuredClone(pruned.result);
  Reflect.deleteProperty(drifted, "removed");
  expect(pruneUnusedResultSchema.safeParse(drifted).success).toBe(false);
});

test("additional library producer captures preserve prior default, converged fork and existing outward preset rows", async () => {
  await using root = await createServerHarness();
  await ensureSystemDefaultPreset(root.db, root.clock.now);
  const caller = await root.internalCallerFor(root.ownerId);
  const system = (await caller.preset.list()).find((row) => row.isSystemDefault);
  if (system === undefined) {
    throw new Error("the actual system seed is missing");
  }
  const earlier = await seedUpdatedPreset(root, root.ownerId, { id: system.id, config: makePromptConfig({ params: { temperature: 0.3 } }) });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: earlier.row.id } });
  const beforeRows = await root.db.select().from(presets).orderBy(presets.id);
  const beforeSettings = await caller.settings.getUserSettings();
  const library = await seedCorpusLibraries(root);
  for (const row of beforeRows) {
    expect(await root.db.select().from(presets).where(eq(presets.id, row.id)).get()).toEqual(row);
  }
  expect(await caller.settings.getUserSettings()).toEqual(beforeSettings);
  expect(library.branchedPreset.row.id).not.toBe(earlier.row.id);
  expect(library.derivedPersona.row.metadata).toMatchObject({ sourceCharacterId: library.character.id, swapMacros: true });
  expect(library.roster.view.id).toBe(library.roster.preset.id);
  expect(library.createdTag.row).toEqual(library.tag);
  expect(await root.db.select().from(presets).where(eq(presets.id, library.preset.id)).get()).toEqual(library.rows.preset);
});

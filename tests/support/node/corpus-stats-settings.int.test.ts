// @subject tests/support/node/corpus-stats-settings.ts
// @subject packages/server/src/domain/settings/verbs/duplicate-theme.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_USER_SETTINGS, USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import { assertReferentialIntegrity } from "@orb/db";
import { bootDatabaseHandle } from "@orb/db/wiring-boot";
import { databaseHandle } from "@orb/db/wiring-driver";
import { seedThemes } from "@orb/server/entry/boot";
import { seedCorpusActors } from "./corpus-actors.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import { seedCorpusLibraries } from "./corpus-seed.ts";
import { seedCorpusStatsSettings } from "./corpus-stats-settings.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("native stats preserve nonzero retained history and user preferences survive owned theme lifecycle and refused foreign writes", async () => {
  const execution = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The ledger keeper preserves the measured native witness.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    usage: { promptTokens: 40, completionTokens: 15 },
  });
  await using root = await createServerHarness({ providerFetch: execution.execute });
  const actors = await seedCorpusActors(root);
  await seedThemes({ db: bootDatabaseHandle(databaseHandle(root.db)), now: root.clock.now });
  const libraries = await seedCorpusLibraries(root);
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({
    section: "seeds",
    patch: { currentPersonaId: libraries.persona.id, defaultPersonaId: libraries.persona.id },
  });
  const room = await caller.chat.startChat({ characterIds: [libraries.character.id], opening: "none" });
  await caller.chat.setGroupConfig({ chatId: room.chat.id, config: { output: "per-speaker", cardScope: "scoped", policy: "list" } });
  const otherCharacter = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "stats-second-ranked", name: "Stats second ranked", description: "A separate owned native room seat." }),
  });
  const otherRoom = await caller.chat.startChat({ characterIds: [otherCharacter.id], opening: "none" });
  const principal = await root.principalFor(root.ownerId);
  const turn = await root.services.chat.send({ principal, chatId: room.chat.id, content: "Preserve a native stats witness." });
  const assistant = turn.messages.find((message) => message.role === "assistant");
  if (assistant === undefined || turn.aborted) {
    throw new Error("native stats control has no actual assistant generation");
  }
  const otherTurn = await root.services.chat.send({ principal, chatId: otherRoom.chat.id, content: "Preserve the second ranked witness." });
  expect(otherTurn.aborted).toBe(false);
  const swipe = await root.services.chat.swipe({ principal, chatId: room.chat.id, messageId: assistant.id });
  expect(swipe.aborted).toBe(false);
  const result = await seedCorpusStatsSettings(root, {
    characterId: libraries.character.id,
    personaId: libraries.persona.id,
    foreignUserId: actors.secondUserId,
  });
  const stats = result.stats;
  expect(result.absent.overview.output).toBeNull();
  expect(result.absent.wrapped.output).toBeNull();
  expect(result.absent.freshness.output).toEqual({ computedAt: null, stale: false, hasData: false });
  expect(result.computedEmpty.output).toMatchObject({ owners: 1, characters: 0, buckets: 0, models: 0 });
  expect(result.emptyAfter.overview.output).toMatchObject({ characters: 0, chats: 0, userTurns: 0, assistantTurns: 0, tokensOut: null });
  expect(result.emptyAfter.freshness.output).toEqual({ computedAt: result.computedEmpty.output.computedAt, stale: false, hasData: true });
  expect(result.emptyAfter.timeseries.output).toEqual([]);
  expect(result.emptyAfter.byModel.output).toEqual([]);
  expect(result.emptyAfter.momentum.output).toEqual([]);
  expect(result.reconciled.output).toEqual(result.repeated.output);
  expect(result.rows.owner).toMatchObject({ ownerId: root.ownerId, userTurns: 2, assistantTurns: 2, swipes: 1 });
  expect(stats.overview.output).toMatchObject({ userTurns: 2, assistantTurns: 2, swipes: 1, tokensOutProvenance: "measured" });
  expect(stats.overview.output?.tokensOut).toBeGreaterThan(0);
  expect(stats.character.output).toMatchObject({ characterId: libraries.character.id, assistantTurns: 1, swipes: 1 });
  expect(stats.character.output?.tokensOut).toBeGreaterThan(0);
  expect(stats.leaderboard.output.total).toBe(2);
  expect(stats.capped.output.rows).toHaveLength(1);
  expect(stats.capped.output.total).toBe(stats.leaderboard.output.total);
  expect(stats.searched.output).toMatchObject({ total: 1, rows: [{ characterId: libraries.character.id }] });
  expect(stats.missingSearch.output).toEqual({ rows: [], total: 0 });
  expect(stats.sorts.map((capture) => capture.input?.sort)).toEqual(["assistantTurns", "totalGenTimeMs", "swipes", "lastActivityAt"]);
  expect(stats.boundary.output).toEqual([stats.timeseries.output[0]]);
  expect(stats.outside.output).toEqual([]);
  expect(stats.byModel.output.find((model) => model.model === CORPUS_TEXT_MODEL)).toMatchObject({
    model: CORPUS_TEXT_MODEL,
    provider: "custom-openai",
    generations: 3,
    charactersUsedWith: 2,
    tokensIn: 120,
    tokensOut: 45,
    tokensOutProvenance: "measured",
  });
  expect(stats.modelCapped.output).toHaveLength(1);
  expect(stats.freshness.output).toEqual({ computedAt: result.reconciled.output.computedAt, stale: false, hasData: true });
  expect(stats.personas.output.find((persona) => persona.personaId === libraries.persona.id)).toMatchObject({
    chatCount: 2,
    messageCount: 4,
    tokensOutProvenance: "measured",
  });
  expect(stats.characterPersonas.output.find((persona) => persona.personaId === libraries.persona.id)).toMatchObject({ chatCount: 1, messageCount: 2 });
  expect(stats.wrapped.output).toMatchObject({ replies: 2, swipes: 1, topCharacter: { assistantTurns: 1 } });
  expect(stats.momentum.output).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ characterId: libraries.character.id, replies: 1 }),
      expect.objectContaining({ characterId: otherCharacter.id, replies: 1 }),
    ]),
  );
  expect(stats.latency.owner.output.avgGenMs).not.toBeNull();
  expect(stats.latency.character.output).toEqual(stats.latency.owner.output);
  expect(stats.latency.model.output).toEqual(stats.latency.owner.output);
  expect(Object.values(stats.latency.missing.output)).toEqual(Array.from({ length: 6 }, () => null));
  expect(result.afterRepeat.overview.output).toEqual(stats.overview.output);
  expect(result.afterRepeat.character.output).toEqual(stats.character.output);
  expect(result.afterRepeat.byModel.output).toEqual(stats.byModel.output);
  expect(result.afterRepeat.timeseries.output).toEqual(stats.timeseries.output);
  expect(result.foreign.turn.aborted).toBe(false);
  expect(result.foreign.turn.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(result.foreign.rows.owner).toMatchObject({ userTurns: 1, assistantTurns: 1, swipes: 0 });
  expect(result.foreign.latency.output.avgGenMs).not.toBeNull();
  expect(result.foreign.latency.output.avgTtftMs).not.toBeNull();
  expect(result.foreign.projection.rowsAfter.owner).toEqual(result.foreign.rows.owner);
  expect(result.foreign.projection.ownerCharacter.output).toBeNull();
  expect(result.foreign.projection.foreignCharacter.output).toBeNull();
  expect(result.foreign.projection.personas.output.find((persona) => persona.personaId === libraries.persona.id)).toMatchObject({
    chatCount: 0,
    messageCount: 0,
    tokensOut: null,
  });
  expect(Object.values(result.foreign.projection.latency.output)).toEqual(Array.from({ length: 6 }, () => null));

  const settings = result.settings;
  expect(result.absent.row).toBeUndefined();
  expect(result.absent.settings.output).toMatchObject({
    updatedAt: 0,
    schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
    configUnreadable: null,
    config: DEFAULT_USER_SETTINGS,
  });
  expect(settings.sourceRead.output).toEqual(settings.source.output);
  expect(settings.source.output.css).not.toBeNull();
  expect(settings.duplicate.output.id).not.toBe(settings.source.output.id);
  expect(settings.duplicate.output).toMatchObject({
    name: `${settings.source.output.name} copy`,
    override: settings.source.output.override,
    css: settings.source.output.css,
    isSeed: false,
    isDefault: false,
  });
  expect(settings.duplicateAgain.output.name).toBe(`${settings.source.output.name} copy 2`);
  expect(settings.updated.output.css).toBe(settings.source.output.css);
  expect(settings.clearedCss.output.css).toBeNull();
  expect(settings.seedRead?.output).toMatchObject({ isSeed: true, isDefault: true });
  expect(settings.seedCopy?.output).toMatchObject({ isSeed: false, isDefault: false, override: settings.seedRead?.output.override });
  expect(settings.selected.output.config.theme.selectedThemeId).toBe(settings.source.output.id);
  expect(settings.appearance.output.config.appearance.fontScale).toBe(1.2);
  expect(settings.appearance.output.config.theme.selectedThemeId).toBe(settings.source.output.id);
  expect(settings.echo.output.config).toEqual(settings.appearance.output.config);
  expect(settings.loaded).toEqual(settings.echo.output.config);
  expect(settings.cleared.output.config.theme.selectedThemeId).toBeNull();
  expect(settings.restored.output.config).toEqual(settings.before.output.config);
  expect(settings.imported.output).toMatchObject({ created: true, renamedFrom: null });
  expect(settings.importedThemes.output.some((theme) => theme.name === settings.imported.output.name)).toBe(true);
  expect(settings.importedAgain.output).toMatchObject({ created: false });
  const importedSource = settings.importedThemes.output.find((theme) => theme.name === settings.source.output.name);
  expect(importedSource).toBeDefined();
  expect(importedSource?.id).not.toBe(settings.source.output.id);
  expect(importedSource).toMatchObject({ override: settings.source.output.override, css: settings.source.output.css, isSeed: false });
  expect(settings.collision.output).toMatchObject({ created: true, renamedFrom: settings.source.output.name });
  expect(settings.collision.output.name).not.toBe(settings.source.output.name);
  expect(settings.collisionAgain.output).toEqual({ created: false, name: settings.collision.output.name, renamedFrom: null });
  expect(settings.removed.output).toBeUndefined();
  expect(settings.stImported.output).toEqual({ created: true, name: "Corpus ST palette (SillyTavern)", renamedFrom: null });
  expect(settings.stRepeated.output).toEqual({ created: false, name: settings.stImported.output.name, renamedFrom: null });
  expect(settings.resetBefore.output.config.appearance.fontScale).toBe(1.3);
  expect(settings.reset.output.config).toEqual(DEFAULT_USER_SETTINGS);
  expect(settings.resetRead.output).toEqual(settings.reset.output);
  for (const key of ["foreignGet", "foreignDuplicate", "foreignUpdate", "foreignDelete", "deletedGet", "deletedAgain", "seedUpdate"] as const) {
    expect(result.failures[key]).toMatchObject({ code: "NOT_FOUND" });
  }
  expect(result.failures.nameConflict).toMatchObject({ code: "CONFLICT" });
  for (const key of ["malformedImport", "unsafeCss", "overLimit"] as const) {
    expect(result.failures[key]).toMatchObject({ code: "BAD_REQUEST" });
  }
  expect(result.afterRefusals).toEqual(result.beforeRefusals);
  expect(result.persisted.source).toMatchObject({ id: settings.source.output.id, ownerId: root.ownerId, css: settings.source.output.css });
  expect(result.persisted.settings?.config).toEqual(settings.before.output.config);
  await assertReferentialIntegrity(root.db);
});

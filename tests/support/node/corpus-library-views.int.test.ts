// @subject tests/support/node/corpus-library-views.ts
// @subject tests/support/node/factories/embedding-generation.ts
// @subject packages/server/src/domain/regex/verbs/attachments/apply-scope-order.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { automationRuleUpdateSchema } from "@orb/contracts/automation";
import { CHAT_WARNING_CODES } from "@orb/contracts/chat";
import { DOCUMENT_SCOPE_SOURCES } from "@orb/contracts/databank";
import { healthResponseSchema } from "@orb/contracts/diagnostics";
import { TAG_TARGET_TYPES } from "@orb/contracts/tag";
import { assertReferentialIntegrity } from "@orb/db";
import { hydrateCorpusWire, parseCorpusWire, serializeCorpusWire } from "../iso/corpus.ts";
import { createCorpusReadResponder, createCorpusViewerReadResponder } from "../iso/corpus-read-responder.ts";
import { CORPUS_LIBRARY_RULE_PRESET, seedCorpusLibraryViews } from "./corpus-library-views.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import { captureCookieAuth, captureCorpusReads, seedCorpusActors, seedCorpusLibraries } from "./corpus-seed.ts";
import { seedUserCredential } from "./factories/credentials.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("native library projections retain canonical usage, ordering, intake and repeated lifecycle identities without crossing owner scope", async () => {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The native library keeper preserves its witness.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({
    providerFetch: wire.execute,
    secretBoxKey: randomBytes(32),
    authConfig: { mode: "local", fallback: "deny" },
  });
  const actors = await seedCorpusActors(root);
  const library = await seedCorpusLibraries(root);
  const result = await seedCorpusLibraryViews(root, library, actors);
  expect(result.publication.relations.viewerUserId).toBe(root.ownerId);
  const world = result.world;
  expect(world.ordered).toMatchObject({
    input: { bookId: world.book.id, orderedEntryIds: [world.second.id, world.first.id, world.second.id] },
    output: { reordered: 2 },
  });
  expect(world.orderedEntries.output.map((entry) => entry.id)).toEqual([world.second.id, world.first.id]);
  expect(world.persisted.entries.map((entry) => [entry.id, entry.priority])).toEqual([
    [world.first.id, 1],
    [world.second.id, 2],
  ]);
  expect(world.demoted.output).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: world.book.id, role: "auxiliary" }),
      expect.objectContaining({ id: world.replacement.id, role: "primary" }),
    ]),
  );
  expect(world.detail.output).toMatchObject({ id: library.world.book.id, name: library.world.book.name });
  expect(world.usage.output.find((book) => book.id === library.world.book.id)).toMatchObject({
    entryCount: 1,
    usage: { characters: 1, personas: 1, chats: 1, global: true, total: 4 },
  });
  expect(world.targets.output).toEqual({ characters: [{ characterId: library.character.id, role: "primary" }], personaIds: [library.persona.id] });
  for (const capture of [world.characterBooks, world.personaBooks, world.globalBooks, world.chatBooks]) {
    expect(capture.output.map((book) => book.id)).toContain(library.world.book.id);
  }
  expect(world.inheritedBooks.input).toEqual({ chatId: library.room.chat.id, includeInherited: true });
  expect(world.inheritedBooks.output.some((book) => book.id === library.world.book.id && book.inherited !== undefined)).toBe(true);
  expect(world.entry.output).toMatchObject({ id: world.first.id, worldBookId: world.book.id, priority: 1 });
  expect(world.imported.output).toMatchObject({ created: true, renamedFrom: world.book.name });
  expect(world.imported.output.name).not.toBe(world.book.name);
  expect(world.repeated.output).toEqual({ created: false, name: world.imported.output.name, renamedFrom: null });
  expect(world.deleted.output).toEqual({ deleted: true });

  const regex = result.regex;
  expect(regex.before.output.map((script) => script.id)).toEqual([regex.first.id, regex.second.id]);
  expect(regex.ordered.output).toEqual({ reordered: 2 });
  expect(regex.after.output.map((script) => script.id)).toEqual([regex.second.id, regex.first.id]);
  expect(regex.persisted.chat.map((row) => [row.regexScriptId, row.position])).toEqual([
    [regex.first.id, 1],
    [regex.second.id, 0],
  ]);
  expect(regex.usage.output).toMatchObject({
    presets: [{ id: library.preset.id, name: library.preset.name }],
    characters: [{ id: library.character.id, name: library.character.name }],
    rooms: [{ id: library.room.chat.id }],
  });
  for (const capture of [regex.global, regex.character, regex.preset]) {
    expect(capture.output.map((script) => script.id)).toContain(regex.first.id);
  }
  expect(regex.displayOff.output).toEqual([]);
  expect(regex.displayOn.output.map((script) => script.id)).toEqual(expect.arrayContaining([regex.first.id, regex.second.id]));
  expect(regex.imported.output).toEqual({ created: true });
  expect(regex.repeated.output).toEqual({ created: false });
  expect(regex.bulk.output).toEqual({ affected: 1 });
  expect(regex.detached.output).toEqual({ detached: true });
  expect(regex.detachedAgain.output).toEqual({ detached: false });
  expect(regex.deleted.output).toEqual({ deleted: true });

  const tags = result.tags;
  expect(tags.before.output.find((tag) => tag.id === tags.tag.id)).toMatchObject({ usage: { characters: 0, total: 4 }, pendingSuggestions: 1 });
  expect(tags.pending.output.map((tag) => tag.id)).toContain(tags.tag.id);
  expect(tags.accepted).toMatchObject({ characterId: library.character.id, tagId: tags.tag.id, status: "accepted" });
  expect(tags.usage.output.find((tag) => tag.id === tags.tag.id)).toMatchObject({
    usage: { characters: 1, chats: 1, worldBooks: 1, personas: 1, presets: 1, total: 5 },
    pendingSuggestions: 0,
  });
  expect(tags.vocabulary.output.find((tag) => tag.id === tags.tag.id)?.characters).toBe(1);
  const targets = {
    character: library.character.id,
    chat: library.room.chat.id,
    worldBook: library.world.book.id,
    persona: library.persona.id,
    preset: library.preset.id,
  };
  expect(tags.reaches.map((capture) => capture.input.targetType)).toEqual([...TAG_TARGET_TYPES]);
  for (const capture of tags.reaches) {
    expect(capture.output).toMatchObject({ entities: [{ targetType: capture.input.targetType, targetId: targets[capture.input.targetType] }], hasMore: false });
  }
  expect(tags.pendingAfter.output.map((tag) => tag.id)).not.toContain(tags.tag.id);
  expect(tags.pendingAfter.output.map((tag) => tag.id)).toContain(library.tag.id);

  expect(result.persona.connected.output.map((persona) => persona.id)).toContain(library.persona.id);
  expect(result.persona.characters.output).toEqual([{ id: library.character.id, name: library.character.name }]);
  expect(result.persona.duplicate.output.id).not.toBe(library.persona.id);
  expect(result.persona.duplicate.output.description).toBe(library.persona.description);
  expect(result.persona.imported.output.id).not.toBe(result.persona.duplicate.output.id);
  expect(result.persona.repeated.output).toEqual(result.persona.imported.output);
  expect(result.persona.disconnected.output).toEqual({ disconnected: false });
  expect(result.persona.deleted.output).toEqual({ deleted: true, newDefaultPersonaId: null });

  const roster = result.roster;
  expect(roster.persisted.members.map((member) => [member.characterId, member.position])).toEqual([
    [roster.addedCharacter.id, 0],
    [library.character.id, 1],
  ]);
  expect(roster.detail.output.members.map((member) => member.characterId)).toEqual([roster.addedCharacter.id, library.character.id]);
  expect(roster.applied.output).toEqual({
    added: [roster.addedCharacter.id],
    alreadyPresent: [library.character.id],
    skipped: [],
    configApplied: true,
    rulesMinted: [CORPUS_LIBRARY_RULE_PRESET],
    rulesAlreadyPresent: [],
    rulesSkipped: [],
  });
  expect(roster.appliedAgain.output).toEqual({
    added: [],
    alreadyPresent: [roster.addedCharacter.id, library.character.id],
    skipped: [],
    configApplied: true,
    rulesMinted: [],
    rulesAlreadyPresent: [CORPUS_LIBRARY_RULE_PRESET],
    rulesSkipped: [],
  });
  expect(roster.list.output.find((row) => row.id === roster.persisted.preset.id)).toMatchObject({ characterCount: 2, hasGroupConfig: true });
  expect(roster.persisted.rules).toMatchObject([{ presetId: roster.persisted.preset.id, rulePresetId: CORPUS_LIBRARY_RULE_PRESET, position: 0 }]);
  const capturedRule = roster.persisted.rules[0];
  if (capturedRule === undefined) {
    throw new Error("native roster omitted its admitted rule-template row");
  }
  expect(Object.keys(capturedRule.knobs).length).toBeGreaterThan(0);
  expect(roster.ruleCatalog.output.find((preset) => preset.id === CORPUS_LIBRARY_RULE_PRESET)).toMatchObject({ scope: "chat", spends: false, ruleCount: 1 });
  expect(roster.firstRules.output).toMatchObject([
    { chatId: roster.room.chat.id, enabled: true, rulePresetId: CORPUS_LIBRARY_RULE_PRESET, rulePresetKnobs: capturedRule.knobs },
  ]);
  expect(roster.repeatedRules.output).toEqual(roster.firstRules.output);
  const originalSeat = roster.room.chat.participants.find((seat) => seat.characterId === library.character.id);
  const keptSeat = roster.chat.output.participants.find((seat) => seat.characterId === library.character.id);
  const addedSeat = roster.chat.output.participants.find((seat) => seat.characterId === roster.addedCharacter.id);
  if (originalSeat === undefined || keptSeat === undefined || addedSeat === undefined) {
    throw new Error("native additive roster lost an existing or newly admitted seat");
  }
  expect(keptSeat.id).toBe(originalSeat.id);
  expect(keptSeat).toMatchObject({ talkativeness: 0.75, disabled: false });
  expect(addedSeat).toMatchObject({ talkativeness: 0.25, disabled: true });
  expect(roster.chat.output.participants.filter((seat) => seat.kind === "human").map((seat) => seat.userId)).toEqual([root.ownerId]);
  expect(roster.chat.output.group).toMatchObject({ policy: "list", cardScope: "scoped", output: "per-speaker" });
  expect(result.preset.active.output).toEqual({ isUserDefault: true, gmRooms: [] });
  expect(result.preset.restoredDefault).toBe(result.preset.previous);
  expect(result.preset.effective.output).toMatchObject({ presetId: library.preset.id, model: CORPUS_TEXT_MODEL });
  expect(result.preset.detail.output.configUnreadable).toBeNull();
  expect(result.preset.restored.output).toEqual(result.preset.inactive.output);
  expect(result.preset.restored).not.toBe(result.preset.inactive);
  expect(result.preset.effective.output.qualityMapping).toBeNull();
  expect(result.preset.effective.output.knobs).not.toHaveProperty("effort");
  expect(result.preset.effective.output.cacheWarnings.length).toBeGreaterThan(0);
  const foreignCaller = await root.internalCallerFor(actors.secondUserId);
  await expect(foreignCaller.preset.get(result.preset.detail.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(foreignCaller.preset.resolveEffective(result.preset.effective.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(foreignCaller.automation.listRules(roster.repeatedRules.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await foreignCaller.preset.list()).some((preset) => preset.id === library.preset.id)).toBe(false);
  const ownForeignPreset = await foreignCaller.preset.create({ name: "Foreign effective witness", kind: "custom" });
  await expect(foreignCaller.preset.resolveEffective({ ...result.preset.effective.input, id: ownForeignPreset.id })).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });

  const documents = result.documents;
  expect(documents.created.output).toMatchObject({ outcome: "created", ingest: "queued", document: { chunkCount: 0 } });
  expect(documents.intake).toHaveLength(1);
  expect(documents.settledIntake).toMatchObject([{ kind: "databank-ingest", status: "succeeded", result: { documents: 1, failed: [] } }]);
  expect(documents.chunks.length).toBeGreaterThan(0);
  expect(documents.chunks.every((row) => row.documentId === documents.created.output.document.id && row.contentHash.length === 64)).toBe(true);
  expect(documents.chunks.map((row) => Array.from(row.embedding))).toEqual(documents.chunks.map(() => [...CORPUS_EMBEDDING_VECTOR]));
  expect(documents.repeated.output).toMatchObject({ outcome: "duplicate", ingest: "skipped", document: { id: documents.created.output.document.id } });
  expect(documents.repeatedChunks).toEqual(documents.chunks);
  expect(documents.jobs).toMatchObject([{ status: "succeeded", result: { chunksUpserted: 0, chunksNoop: documents.chunks.length, failed: [] } }]);
  expect(documents.detail.output.extractedText).toBe(documents.created.input.text);
  expect(documents.metadata.output).not.toHaveProperty("extractedText");
  expect(documents.list.output).toMatchObject({ totalCount: 1, items: [{ id: documents.created.output.document.id, chunkCount: documents.chunks.length }] });
  expect(documents.global.output).toContain(documents.created.output.document.id);
  expect(documents.attachments.output).toMatchObject({ global: true, characters: [{ id: library.character.id }], chats: [{ id: library.room.chat.id }] });
  expect(documents.active.output.find((document) => document.id === library.document.id)?.sources).toEqual([...DOCUMENT_SCOPE_SOURCES]);
  expect(documents.gallery.output).toMatchObject([{ galleryItemId: library.gallery.id, assetId: library.asset.assetId, hash: library.asset.hash }]);
  expect(documents.assets.output.some((asset) => asset.assetId === library.asset.assetId)).toBe(true);
  expect(documents.blobs.output).toMatchObject([{ assetId: library.asset.assetId, hash: library.asset.hash, mime: "image/png", width: 8, height: 8 }]);
  expect(result.refusals.foreignBlobs).toEqual([]);
  expect(result.refusals.errors.slice(0, 11)).toEqual(Array.from({ length: 11 }, () => expect.objectContaining({ code: "NOT_FOUND" })));
  expect(result.refusals.errors.slice(11)).toEqual(Array.from({ length: 3 }, () => expect.objectContaining({ code: "BAD_REQUEST" })));
  expect(result.refusals.after).toEqual(result.refusals.before);
  expect(wire.requests).toContain("POST /v1/embeddings");
  await assertReferentialIntegrity(root.db);
  const authentication = await captureCookieAuth(root, actors.owner, "native-library-publication-password");
  const reads = await captureCorpusReads(root, { soloChatId: library.room.chat.id, groupChatId: library.room.chat.id, documentId: library.document.id });
  const base = hydrateCorpusWire({ auth: authentication.auth, reads, health: healthResponseSchema.parse(await (await root.http.request("/healthz")).json()) });
  const worldInfoLibrary = {
    viewerUserId: root.ownerId,
    ids: {
      libraryBookId: library.world.book.id,
      orderedBookId: world.book.id,
      entryId: world.first.id,
      demotedCharacterId: world.character.id,
      characterId: library.character.id,
      personaId: library.persona.id,
      chatId: library.room.chat.id,
    },
    reads: {
      orderedEntries: world.orderedEntries,
      demoted: world.demoted,
      books: world.books,
      detail: world.detail,
      usage: world.usage,
      targets: world.targets,
      entry: world.entry,
      characterBooks: world.characterBooks,
      personaBooks: world.personaBooks,
      globalBooks: world.globalBooks,
      chatBooks: world.chatBooks,
      inheritedBooks: world.inheritedBooks,
    },
  };
  const regexLibrary = {
    viewerUserId: root.ownerId,
    ids: { scriptId: regex.first.id, characterId: library.character.id, presetId: library.preset.id, chatId: library.room.chat.id },
    reads: {
      before: regex.before,
      after: regex.after,
      displayOff: regex.displayOff,
      displayOn: regex.displayOn,
      list: regex.list,
      usage: regex.usage,
      global: regex.global,
      character: regex.character,
      preset: regex.preset,
    },
  };
  const libraryRelations = {
    ...result.publication.relations,
    ids: { ...result.publication.relations.ids, presetId: library.preset.id, connectionId: actors.connections.text.id },
    reads: {
      ...result.publication.relations.reads,
      presetDetail: result.preset.detail,
      presetList: result.preset.list,
      presetInactive: result.preset.inactive,
      presetActive: result.preset.active,
      presetRestored: result.preset.restored,
      presetEffective: result.preset.effective,
      rulesFirst: roster.firstRules,
      rulesRepeated: roster.repeatedRules,
    },
  };
  expect.soft(result.publication.relations).toEqual(libraryRelations);
  const captured = { ...base, worldInfoLibrary, regexLibrary, libraryRelations };
  const parsed = parseCorpusWire(serializeCorpusWire(captured, authentication.secrets));
  expect(parsed.worldInfoLibrary).toEqual(worldInfoLibrary);
  expect(parsed.regexLibrary).toEqual(regexLibrary);
  expect(parsed.libraryRelations).toEqual(libraryRelations);
  expect(libraryRelations.reads.rosterChat.output.viewerUserId).toBe(root.ownerId);
  const relabeled = structuredClone(captured);
  Object.assign(relabeled.libraryRelations, { viewerUserId: actors.secondUserId });
  expect.soft(() => serializeCorpusWire(relabeled, authentication.secrets)).toThrow("relation identity mismatch");
  const published = serializeCorpusWire(captured, authentication.secrets);
  const viewerMarker = `"libraryRelations":{"viewerUserId":${JSON.stringify(root.ownerId)}`;
  expect(published.split(viewerMarker)).toHaveLength(2);
  const relabeledPublished = published.replace(viewerMarker, `"libraryRelations":{"viewerUserId":${JSON.stringify(actors.secondUserId)}`);
  expect.soft(() => parseCorpusWire(relabeledPublished)).toThrow("relation identity mismatch");
  expect(libraryRelations.reads).toEqual({
    tagPending: tags.pending,
    tagPendingAfter: tags.pendingAfter,
    tagBefore: tags.before,
    tagUsage: tags.usage,
    tagList: tags.list,
    tagVocabulary: tags.vocabulary,
    characterReach: tags.reaches[0],
    chatReach: tags.reaches[1],
    worldBookReach: tags.reaches[2],
    personaReach: tags.reaches[3],
    presetReach: tags.reaches[4],
    personaConnected: result.persona.connected,
    personaCharacters: result.persona.characters,
    rosterDetail: roster.detail,
    rosterList: roster.list,
    rosterApplied: roster.applied,
    rosterAppliedAgain: roster.appliedAgain,
    rosterChat: roster.chat,
    ruleCatalog: roster.ruleCatalog,
    presetDetail: result.preset.detail,
    presetList: result.preset.list,
    presetInactive: result.preset.inactive,
    presetActive: result.preset.active,
    presetRestored: result.preset.restored,
    presetEffective: result.preset.effective,
    rulesFirst: roster.firstRules,
    rulesRepeated: roster.repeatedRules,
  });
  for (const index of Object.values(libraryRelations.reads).keys()) {
    const malformed = structuredClone(captured);
    const read = Object.values(malformed.libraryRelations.reads)[index];
    if (read === undefined) {
      throw new Error("native library publication lost its selected request");
    }
    Object.assign(read, { input: null });
    expect(() => serializeCorpusWire(hydrateCorpusWire(malformed), authentication.secrets)).toThrow("publication recipe");
  }
  const tagSnapshot = { viewerUserId: libraryRelations.viewerUserId, read: libraryRelations.reads.characterReach };
  const tagRespond = createCorpusViewerReadResponder("tag.listAttachedEntities", root.ownerId, tagSnapshot);
  expect(tagRespond(tagSnapshot.read.input)).toEqual(tags.reaches[0]?.output);
  expect(() => tagRespond(libraryRelations.reads.personaReach.input)).toThrow("Uncaptured corpus read");
  expect(() => createCorpusViewerReadResponder("tag.listAttachedEntities", actors.secondUserId, tagSnapshot)).toThrow("snapshot viewer does not match");
  expect(() => createCorpusReadResponder("tag.listPendingSuggestions", [tags.pending, tags.pendingAfter])).toThrow("Conflicting corpus captures");
  expect(() => createCorpusReadResponder("tag.listTagsWithUsage", [tags.before, tags.usage])).toThrow("Conflicting corpus captures");
  expect(() => createCorpusReadResponder("rosterPreset.applyToChat", [roster.applied, roster.appliedAgain])).toThrow("Conflicting corpus captures");
  expect(() => createCorpusReadResponder("preset.listUsage", [result.preset.inactive, result.preset.active])).toThrow("Conflicting corpus captures");
  const effectiveSnapshot = { viewerUserId: libraryRelations.viewerUserId, read: libraryRelations.reads.presetEffective };
  const effectiveRespond = createCorpusViewerReadResponder("preset.resolveEffective", root.ownerId, effectiveSnapshot);
  expect(effectiveRespond(result.preset.effective.input)).toEqual(result.preset.effective.output);
  expect(() => effectiveRespond({ id: library.preset.id })).toThrow("Uncaptured corpus read");
  expect(() => createCorpusViewerReadResponder("preset.resolveEffective", actors.secondUserId, effectiveSnapshot)).toThrow("snapshot viewer does not match");
  const rulesSnapshot = { viewerUserId: libraryRelations.viewerUserId, read: libraryRelations.reads.rulesRepeated };
  expect(createCorpusViewerReadResponder("automation.listRules", root.ownerId, rulesSnapshot)(roster.repeatedRules.input)).toEqual(roster.repeatedRules.output);
  expect(() => createCorpusViewerReadResponder("automation.listRules", actors.secondUserId, rulesSnapshot)).toThrow("snapshot viewer does not match");
  const driftedPreset = structuredClone(captured);
  Reflect.deleteProperty(driftedPreset.libraryRelations.reads.presetDetail.output, "configUnreadable");
  expect(() => serializeCorpusWire(driftedPreset, authentication.secrets)).toThrow("configUnreadable");
  const wrongWarningAxis = structuredClone(captured);
  const warning = wrongWarningAxis.libraryRelations.reads.presetEffective.output.cacheWarnings[0];
  assert(warning !== undefined, "native effective preset omitted its cache-warning witness");
  Object.assign(warning, { code: CHAT_WARNING_CODES[0] });
  expect(() => serializeCorpusWire(wrongWarningAxis, authentication.secrets)).toThrow("cacheWarnings");
  const swappedPreset = structuredClone(captured);
  Object.assign(swappedPreset.libraryRelations.reads.presetEffective.output, { presetId: ownForeignPreset.id });
  expect(() => serializeCorpusWire(swappedPreset, authentication.secrets)).toThrow("relation identity mismatch");
  const swappedRule = structuredClone(captured);
  const rule = swappedRule.libraryRelations.reads.rulesRepeated.output[0];
  if (rule === undefined) {
    throw new Error("native live-rule publication omitted its minted witness");
  }
  Object.assign(rule, { chatId: library.room.chat.id });
  expect(() => serializeCorpusWire(swappedRule, authentication.secrets)).toThrow("relation identity mismatch");
  const effectiveMarker = `"presetId":${JSON.stringify(library.preset.id)},"model":`;
  expect(published.split(effectiveMarker)).toHaveLength(2);
  expect(() => parseCorpusWire(published.replace(effectiveMarker, `"presetId":${JSON.stringify(ownForeignPreset.id)},"model":`))).toThrow(
    "relation identity mismatch",
  );
  const ruleMarker = `"rulesRepeated":[{"id":${JSON.stringify(rule.id)},"chatId":${JSON.stringify(roster.room.chat.id)}`;
  expect(published.split(ruleMarker)).toHaveLength(2);
  expect(() =>
    parseCorpusWire(published.replace(ruleMarker, `"rulesRepeated":[{"id":${JSON.stringify(rule.id)},"chatId":${JSON.stringify(library.room.chat.id)}`)),
  ).toThrow("relation identity mismatch");
  const liveRule = roster.repeatedRules.output[0];
  assert(liveRule !== undefined, "native live-rule publication omitted its enabled witness");
  const ruleCaller = await root.internalCallerFor(root.ownerId);
  await ruleCaller.automation.setRuleEnabled({ ruleId: liveRule.id, enabled: false });
  const disabledRules = { input: roster.repeatedRules.input, output: await ruleCaller.automation.listRules(roster.repeatedRules.input) };
  expect(disabledRules.output.find((entry) => entry.id === liveRule.id)?.enabled).toBe(false);
  expect(() => createCorpusReadResponder("automation.listRules", [roster.repeatedRules, disabledRules])).toThrow("Conflicting corpus captures");
  await ruleCaller.automation.setRuleEnabled({ ruleId: liveRule.id, enabled: true });
  const driftedRelations = structuredClone(captured);
  Reflect.deleteProperty(driftedRelations.libraryRelations.reads.rosterApplied.output, "rulesMinted");
  expect(() => serializeCorpusWire(driftedRelations, authentication.secrets)).toThrow("rulesMinted");
  const driftedUsage = structuredClone(captured);
  const usageWitness = driftedUsage.libraryRelations.reads.tagUsage.output.find((tag) => tag.id === tags.tag.id);
  if (usageWitness === undefined) {
    throw new Error("native tag publication omitted its produced usage witness");
  }
  Reflect.deleteProperty(usageWitness, "pendingSuggestions");
  expect(() => serializeCorpusWire(driftedUsage, authentication.secrets)).toThrow("pendingSuggestions");
  const swappedRelations = structuredClone(captured);
  Object.assign(swappedRelations.libraryRelations.ids, { rosterChatId: library.room.chat.id });
  expect(() => serializeCorpusWire(swappedRelations, authentication.secrets)).toThrow("relation identity mismatch");
  const swappedReach = structuredClone(captured);
  Object.assign(swappedReach.libraryRelations.reads.characterReach, { output: libraryRelations.reads.personaReach.output });
  expect(() => serializeCorpusWire(swappedReach, authentication.secrets)).toThrow("relation identity mismatch");
  expect(result.publication.worldInfo).toEqual(worldInfoLibrary);
  expect(result.publication.regex).toEqual(regexLibrary);
  expect(parsed.reads).toEqual(base.reads);
  const worldSnapshot = { viewerUserId: worldInfoLibrary.viewerUserId, read: worldInfoLibrary.reads.inheritedBooks };
  const respond = createCorpusViewerReadResponder("worldInfo.listForChat", root.ownerId, worldSnapshot);
  expect(respond(worldSnapshot.read.input)).toEqual(world.inheritedBooks.output);
  expect(() => respond(world.chatBooks.input)).toThrow("Uncaptured corpus read");
  expect(() => respond({ chatId: library.room.chat.id, includeInherited: false })).toThrow("Uncaptured corpus read");
  expect(() => createCorpusViewerReadResponder("worldInfo.listForChat", actors.secondUserId, worldSnapshot)).toThrow("snapshot viewer does not match");
  const regexSnapshot = { viewerUserId: regexLibrary.viewerUserId, read: regexLibrary.reads.after };
  expect(createCorpusViewerReadResponder("regex.listForChat", root.ownerId, regexSnapshot)(regex.after.input)).toEqual(regex.after.output);
  expect(() => createCorpusViewerReadResponder("regex.listForChat", actors.secondUserId, regexSnapshot)).toThrow("snapshot viewer does not match");
  expect(() => createCorpusReadResponder("regex.listForChat", [regex.before, regex.after])).toThrow("Conflicting corpus captures");
  expect(() => createCorpusReadResponder("regex.listRoomDisplayScripts", [regex.displayOff, regex.displayOn])).toThrow("Conflicting corpus captures");
  const changedWorld = structuredClone(captured);
  Object.assign(changedWorld.worldInfoLibrary.reads.inheritedBooks, { input: world.chatBooks.input });
  expect(() => serializeCorpusWire(hydrateCorpusWire(changedWorld), authentication.secrets)).toThrow("publication recipe");
  Object.assign(changedWorld.worldInfoLibrary.reads.inheritedBooks, { input: world.inheritedBooks.input });
  Object.assign(changedWorld.worldInfoLibrary.reads.books, { input: null });
  expect(() => serializeCorpusWire(hydrateCorpusWire(changedWorld), authentication.secrets)).toThrow("publication recipe");
  Object.assign(changedWorld.worldInfoLibrary.reads.books, { input: { limit: 1 } });
  expect(() => serializeCorpusWire(changedWorld, authentication.secrets)).toThrow("publication recipe");
  const changedRegex = structuredClone(captured);
  Object.assign(changedRegex.regexLibrary.reads.after, { input: { chatId: result.roster.room.chat.id } });
  expect(() => serializeCorpusWire(hydrateCorpusWire(changedRegex), authentication.secrets)).toThrow("publication recipe");
  Object.assign(changedRegex.regexLibrary.reads.after, { input: null });
  expect(() => serializeCorpusWire(hydrateCorpusWire(changedRegex), authentication.secrets)).toThrow("publication recipe");
  const mismatched = structuredClone(captured);
  Object.assign(mismatched.worldInfoLibrary.ids, { libraryBookId: world.book.id });
  expect(() => serializeCorpusWire(mismatched, authentication.secrets)).toThrow("identity mismatch");
  const drifted = structuredClone(captured);
  Reflect.deleteProperty(drifted.worldInfoLibrary.reads.entry.output, "priority");
  expect(() => serializeCorpusWire(drifted, authentication.secrets)).toThrow("priority");
  const regexDrift = structuredClone(captured);
  Reflect.deleteProperty(regexDrift.regexLibrary.reads.usage.output, "rooms");
  expect(() => serializeCorpusWire(regexDrift, authentication.secrets)).toThrow("rooms");
  const secret = 'native-library-"credential"\\959';
  const credential = await seedUserCredential(root, { principal: actors.owner, provider: "custom-openai", key: secret });
  const secrets = [...authentication.secrets, secret, credential.row.ciphertext, credential.row.iv, credential.row.tag];
  expect(parseCorpusWire(serializeCorpusWire(captured, secrets))).toEqual(parsed);
  const caller = await root.internalCallerFor(root.ownerId);
  for (const spelling of [secret, JSON.stringify(secret), JSON.stringify({ echo: secret })]) {
    await caller.worldInfo.updateEntry({ entryId: world.first.id, input: { content: spelling } });
    const output = await caller.worldInfo.getEntry(world.entry.input);
    expect(output.content).toBe(spelling);
    const echoed = structuredClone(captured);
    Object.assign(echoed.worldInfoLibrary.reads.entry, { output });
    expect(() => serializeCorpusWire(echoed, secrets)).toThrow("Corpus publication contains private material");
    await caller.preset.update({ id: library.preset.id, name: spelling });
    const presetDetail = await caller.preset.get(result.preset.detail.input);
    expect(presetDetail.name).toBe(spelling);
    const echoedPreset = structuredClone(captured);
    Object.assign(echoedPreset.libraryRelations.reads.presetDetail, { output: presetDetail });
    expect(() => serializeCorpusWire(echoedPreset, secrets)).toThrow("Corpus publication contains private material");
    const mintedRule = roster.repeatedRules.output[0];
    if (mintedRule === undefined) {
      throw new Error("native live-rule publication omitted its editable witness");
    }
    await caller.automation.updateRule(
      automationRuleUpdateSchema.parse({
        ...Object.fromEntries(Object.keys(automationRuleUpdateSchema.shape).map((key) => [key, Reflect.get(mintedRule, key)])),
        ruleId: mintedRule.id,
        name: spelling,
      }),
    );
    const liveRules = await caller.automation.listRules(roster.repeatedRules.input);
    expect(liveRules.find((entry) => entry.id === mintedRule.id)?.name).toBe(spelling);
    Object.assign(echoedPreset.libraryRelations.reads.rulesRepeated, { output: liveRules });
    Object.assign(echoedPreset.libraryRelations.reads.presetDetail, { output: result.preset.detail.output });
    expect(() => serializeCorpusWire(echoedPreset, secrets)).toThrow("Corpus publication contains private material");
    await caller.tag.updateTag({ tagId: tags.tag.id, patch: { name: spelling } });
    const tagList = await caller.tag.listTags();
    expect(tagList.find((tag) => tag.id === tags.tag.id)?.name).toBe(spelling);
    const echoedRelations = structuredClone(captured);
    Object.assign(echoedRelations.libraryRelations.reads.tagList, { output: tagList });
    expect(() => serializeCorpusWire(echoedRelations, secrets)).toThrow("Corpus publication contains private material");
    await caller.persona.update({ personaId: library.persona.id, input: { name: spelling } });
    const connected = await caller.persona.listConnectedToCharacter(result.persona.connected.input);
    expect(connected.find((persona) => persona.id === library.persona.id)?.name).toBe(spelling);
    Object.assign(echoedRelations.libraryRelations.reads.tagList, { output: tags.list.output });
    Object.assign(echoedRelations.libraryRelations.reads.personaConnected, { output: connected });
    expect(() => serializeCorpusWire(echoedRelations, secrets)).toThrow("Corpus publication contains private material");
    await caller.regex.updateScript({ scriptId: regex.first.id, input: { name: spelling } });
    const scripts = await caller.regex.listScripts();
    expect(scripts.find((script) => script.id === regex.first.id)?.name).toBe(spelling);
    Object.assign(echoed.regexLibrary.reads.list, { output: scripts });
    Object.assign(echoed.worldInfoLibrary.reads.entry, { output: world.entry.output });
    expect(() => serializeCorpusWire(echoed, secrets)).toThrow("Corpus publication contains private material");
  }
  Object.assign(drifted.worldInfoLibrary.reads.entry.output, { [secret]: true });
  expect(() => serializeCorpusWire(drifted, secrets)).toThrow("Corpus publication contains private material");
  Object.assign(regexDrift.regexLibrary.reads.usage.output, { [secret]: true });
  expect(() => serializeCorpusWire(regexDrift, secrets)).toThrow("Corpus publication contains private material");
  Object.assign(driftedRelations.libraryRelations.reads.rosterApplied.output, { [secret]: true });
  expect(() => serializeCorpusWire(driftedRelations, secrets)).toThrow("Corpus publication contains private material");
  Object.assign(driftedPreset.libraryRelations.reads.presetDetail.output, { [secret]: true });
  expect(() => serializeCorpusWire(driftedPreset, secrets)).toThrow("Corpus publication contains private material");
  Object.assign(wrongWarningAxis.libraryRelations.reads.presetEffective.output, { [secret]: true });
  expect(() => serializeCorpusWire(wrongWarningAxis, secrets)).toThrow("Corpus publication contains private material");
  Object.assign(rule, { [secret]: true });
  expect(() => serializeCorpusWire(swappedRule, secrets)).toThrow("Corpus publication contains private material");
  expect(parseCorpusWire(serializeCorpusWire(base, secrets))).toEqual(base);
});

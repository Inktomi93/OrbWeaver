// Native library operations retain their exact wire captures; private rows never enter the portable envelope.
import { ASSET_LIST_LIMIT_MAX } from "@orb/contracts/assets";
import type { RulePresetId } from "@orb/contracts/automation";
import { createCharacterSchema } from "@orb/contracts/character";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { createRosterPresetSchema } from "@orb/contracts/roster-preset";
import { createTagSchema, TAG_TARGET_TYPES } from "@orb/contracts/tag";
import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import {
  auditLogs,
  characterPersonas,
  characterTags,
  documents as documentCanon,
  personas,
  presets,
  rosterPresetMembers,
  rosterPresetRules,
  rosterPresets,
  tags as tagCanon,
  worldBooks,
  worldEntries,
} from "@orb/db";
import { deriveRegexTierFlags } from "@orb/kit/regex";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { CorpusRead, CorpusRegexLibrary, CorpusWorldInfoLibrary } from "../iso/corpus.ts";
import type { seedCorpusActors, seedCorpusLibraries } from "./corpus-seed.ts";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import type { AuditLogRow } from "./factories/credentials.ts";
import { captureDocumentChunks } from "./factories/embedding-generation.ts";
import {
  captureRegexRows,
  seedCharacterRegexScript,
  seedChatRegexScript,
  seedGlobalRegexScript,
  seedPresetRegexScript,
  seedRegexScript,
} from "./factories/regex.ts";
import { seedRosterPreset } from "./factories/roster-preset.ts";
import { seedCharacterTag, seedChatTag, seedPersonaTag, seedPresetTag, seedTag, seedWorldBookTag } from "./factories/tag.ts";
import { captureWorldBookRows, seedCharacterBook, seedWorldBook, seedWorldEntry } from "./factories/world-info.ts";
import type { TrpcInput, TrpcProcedurePath, TrpcWireOutput } from "./route-trpc.ts";
import type { ServerTestHarness } from "./server.ts";

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type Library = Awaited<ReturnType<typeof seedCorpusLibraries>>;
type Actors = Awaited<ReturnType<typeof seedCorpusActors>>;

export const CORPUS_LIBRARY_RULE_PRESET = "openerChips" satisfies RulePresetId;

interface WorldViews {
  readonly character: Awaited<ReturnType<Caller["character"]["create"]>>;
  readonly book: Awaited<ReturnType<typeof seedWorldBook>>;
  readonly first: Awaited<ReturnType<typeof seedWorldEntry>>;
  readonly second: Awaited<ReturnType<typeof seedWorldEntry>>;
  readonly replacement: Awaited<ReturnType<typeof seedWorldBook>>;
  readonly ordered: CorpusRead<"worldInfo.applyEntryOrder">;
  readonly orderedEntries: CorpusRead<"worldInfo.listEntries">;
  readonly demoted: CorpusRead<"worldInfo.listForCharacter">;
  readonly exported: CorpusRead<"worldInfo.exportBook">;
  readonly collision: Awaited<ReturnType<Caller["worldInfo"]["createBook"]>>;
  readonly imported: CorpusRead<"worldInfo.importFile">;
  readonly repeated: CorpusRead<"worldInfo.importFile">;
  readonly deleted: CorpusRead<"worldInfo.removeBook">;
  readonly persisted: Awaited<ReturnType<typeof captureWorldBookRows>>;
  readonly books: CorpusRead<"worldInfo.listBooks">;
  readonly detail: CorpusRead<"worldInfo.getBook">;
  readonly usage: CorpusRead<"worldInfo.listBooksWithUsage">;
  readonly targets: CorpusRead<"worldInfo.listAttachmentsForBook">;
  readonly entry: CorpusRead<"worldInfo.getEntry">;
  readonly characterBooks: CorpusRead<"worldInfo.listForCharacter">;
  readonly personaBooks: CorpusRead<"worldInfo.listForPersona">;
  readonly globalBooks: CorpusRead<"worldInfo.listGlobal">;
  readonly chatBooks: CorpusRead<"worldInfo.listForChat">;
  readonly inheritedBooks: CorpusRead<"worldInfo.listForChat">;
}

interface RegexViews {
  readonly scripts: readonly Awaited<ReturnType<typeof seedRegexScript>>[];
  readonly first: Awaited<ReturnType<typeof seedRegexScript>>;
  readonly second: Awaited<ReturnType<typeof seedRegexScript>>;
  readonly before: CorpusRead<"regex.listForChat">;
  readonly ordered: CorpusRead<"regex.applyScopeOrder">;
  readonly after: CorpusRead<"regex.listForChat">;
  readonly displayOff: CorpusRead<"regex.listRoomDisplayScripts">;
  readonly displayOn: CorpusRead<"regex.listRoomDisplayScripts">;
  readonly exported: CorpusRead<"regex.exportScript">;
  readonly imported: CorpusRead<"regex.importScriptFile">;
  readonly repeated: CorpusRead<"regex.importScriptFile">;
  readonly bulk: CorpusRead<"regex.bulkSetEnabled">;
  readonly detached: CorpusRead<"regex.detachFromChat">;
  readonly detachedAgain: CorpusRead<"regex.detachFromChat">;
  readonly deleted: CorpusRead<"regex.removeScript">;
  readonly persisted: Awaited<ReturnType<typeof captureRegexRows>>;
  readonly list: CorpusRead<"regex.listScripts">;
  readonly usage: CorpusRead<"regex.listScriptUsage">;
  readonly global: CorpusRead<"regex.listGlobal">;
  readonly character: CorpusRead<"regex.listForCharacter">;
  readonly preset: CorpusRead<"regex.listForPreset">;
}

interface TagViews {
  readonly tag: Awaited<ReturnType<typeof seedTag>>;
  readonly pending: CorpusRead<"tag.listPendingSuggestions">;
  readonly before: CorpusRead<"tag.listTagsWithUsage">;
  readonly accepted: Awaited<ReturnType<typeof seedCharacterTag>>;
  readonly list: CorpusRead<"tag.listTags">;
  readonly usage: CorpusRead<"tag.listTagsWithUsage">;
  readonly vocabulary: CorpusRead<"tag.listTagFilterVocabulary">;
  readonly reaches: readonly CorpusRead<"tag.listAttachedEntities">[];
  readonly pendingAfter: CorpusRead<"tag.listPendingSuggestions">;
}

interface PersonaViews {
  readonly duplicate: CorpusRead<"persona.duplicate">;
  readonly exported: CorpusRead<"persona.export">;
  readonly imported: CorpusRead<"persona.import">;
  readonly repeated: CorpusRead<"persona.import">;
  readonly disconnected: CorpusRead<"persona.disconnectFromCharacter">;
  readonly deleted: CorpusRead<"persona.remove">;
  readonly connected: CorpusRead<"persona.listConnectedToCharacter">;
  readonly characters: CorpusRead<"persona.listConnectedCharacters">;
}

interface RosterViews {
  readonly addedCharacter: Awaited<ReturnType<Caller["character"]["create"]>>;
  readonly room: Awaited<ReturnType<Caller["chat"]["startChat"]>>;
  readonly persisted: Awaited<ReturnType<typeof seedRosterPreset>>;
  readonly detail: CorpusRead<"rosterPreset.get">;
  readonly applied: CorpusRead<"rosterPreset.applyToChat">;
  readonly appliedAgain: CorpusRead<"rosterPreset.applyToChat">;
  readonly ruleCatalog: CorpusRead<"automation.listRulePresets">;
  readonly firstRules: CorpusRead<"automation.listRules">;
  readonly repeatedRules: CorpusRead<"automation.listRules">;
  readonly list: CorpusRead<"rosterPreset.list">;
  readonly chat: CorpusRead<"chat.getChat">;
}

interface PresetViews {
  readonly detail: CorpusRead<"preset.get">;
  readonly inactive: CorpusRead<"preset.listUsage">;
  readonly active: CorpusRead<"preset.listUsage">;
  readonly previous: TrpcWireOutput<"settings.getUserSettings">["config"]["seeds"]["defaultPresetId"];
  readonly restoredDefault: PresetViews["previous"];
  readonly list: CorpusRead<"preset.list">;
  readonly effective: CorpusRead<"preset.resolveEffective">;
}

interface DocumentViews {
  readonly created: CorpusRead<"databank.createFromText"> & { readonly output: Awaited<ReturnType<Caller["databank"]["createFromText"]>> };
  readonly intake: Awaited<ReturnType<Caller["workloads"]["list"]>>;
  readonly settledIntake: Awaited<ReturnType<typeof settleCorpusWorkloads>>;
  readonly repeated: CorpusRead<"databank.createFromText">;
  readonly chunks: Awaited<ReturnType<typeof captureDocumentChunks>>;
  readonly reindexed: CorpusRead<"databank.reindex">;
  readonly jobs: Awaited<ReturnType<typeof settleCorpusWorkloads>>;
  readonly repeatedChunks: Awaited<ReturnType<typeof captureDocumentChunks>>;
  readonly detail: CorpusRead<"databank.get">;
  readonly metadata: CorpusRead<"databank.get">;
  readonly list: CorpusRead<"databank.list">;
  readonly health: CorpusRead<"databank.bankHealth">;
  readonly global: CorpusRead<"databank.listGlobal">;
  readonly attachments: CorpusRead<"databank.listAttachments">;
  readonly active: CorpusRead<"databank.listActiveForChat">;
  readonly assets: CorpusRead<"assets.listOwned">;
  readonly gallery: CorpusRead<"assets.listGallery">;
  readonly blobs: CorpusRead<"assets.resolveBlobRefs">;
}

interface CapturedEffects {
  readonly world: Awaited<ReturnType<typeof captureWorldBookRows>>;
  readonly regex: Awaited<ReturnType<typeof captureRegexRows>>;
  readonly chunks: Awaited<ReturnType<typeof captureDocumentChunks>>;
  readonly audit: readonly AuditLogRow[];
  readonly canon: {
    readonly books: readonly (typeof worldBooks.$inferSelect)[];
    readonly entries: readonly (typeof worldEntries.$inferSelect)[];
    readonly documents: readonly (typeof documentCanon.$inferSelect)[];
    readonly tags: readonly (typeof tagCanon.$inferSelect)[];
    readonly characterTags: readonly (typeof characterTags.$inferSelect)[];
    readonly personas: readonly (typeof personas.$inferSelect)[];
    readonly personaRelations: readonly (typeof characterPersonas.$inferSelect)[];
    readonly presets: readonly (typeof presets.$inferSelect)[];
    readonly rosters: readonly (typeof rosterPresets.$inferSelect)[];
    readonly members: readonly (typeof rosterPresetMembers.$inferSelect)[];
    readonly rules: readonly (typeof rosterPresetRules.$inferSelect)[];
  };
}

interface LibraryViews {
  readonly publication: { readonly worldInfo: CorpusWorldInfoLibrary; readonly regex: CorpusRegexLibrary };
  readonly world: WorldViews;
  readonly regex: RegexViews;
  readonly tags: TagViews;
  readonly persona: PersonaViews;
  readonly roster: RosterViews;
  readonly preset: PresetViews;
  readonly documents: DocumentViews;
  readonly refusals: {
    readonly errors: readonly (Error | undefined)[];
    readonly foreignBlobs: TrpcWireOutput<"assets.resolveBlobRefs">;
    readonly before: CapturedEffects;
    readonly after: CapturedEffects;
  };
}

async function read<P extends TrpcProcedurePath>(input: TrpcInput<P>, invoke: (input: TrpcInput<P>) => Promise<TrpcWireOutput<P>>): Promise<CorpusRead<P>> {
  return { input, output: await invoke(input) };
}

async function refused<T>(operation: Promise<T>): Promise<Error | undefined> {
  try {
    await operation;
    return undefined;
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    return error;
  }
}

async function effects(root: ServerTestHarness, world: WorldViews, regex: RegexViews, document: DocumentViews): Promise<CapturedEffects> {
  const [bookRows, entryRows, documentRows, tagRows, tagRelations, personaRows, personaRelations, presetRows, rosterRows, memberRows, ruleRows] =
    await Promise.all([
      root.db.select().from(worldBooks).orderBy(worldBooks.id),
      root.db.select().from(worldEntries).orderBy(worldEntries.id),
      root.db.select().from(documentCanon).orderBy(documentCanon.id),
      root.db.select().from(tagCanon).orderBy(tagCanon.id),
      root.db.select().from(characterTags).orderBy(characterTags.characterId, characterTags.tagId),
      root.db.select().from(personas).orderBy(personas.id),
      root.db.select().from(characterPersonas).orderBy(characterPersonas.characterId, characterPersonas.personaId),
      root.db.select().from(presets).orderBy(presets.id),
      root.db.select().from(rosterPresets).orderBy(rosterPresets.id),
      root.db.select().from(rosterPresetMembers).orderBy(rosterPresetMembers.presetId, rosterPresetMembers.characterId),
      root.db.select().from(rosterPresetRules).orderBy(rosterPresetRules.presetId, rosterPresetRules.rulePresetId),
    ]);
  return {
    world: await captureWorldBookRows(root.db, world.book.id),
    regex: await captureRegexRows(
      root.db,
      regex.scripts.map((script) => script.id),
    ),
    chunks: await captureDocumentChunks(root.db, document.created.output.document.id),
    audit: await root.db.select().from(auditLogs).orderBy(auditLogs.id),
    canon: {
      books: bookRows,
      entries: entryRows,
      documents: documentRows,
      tags: tagRows,
      characterTags: tagRelations,
      personas: personaRows,
      personaRelations,
      presets: presetRows,
      rosters: rosterRows,
      members: memberRows,
      rules: ruleRows,
    },
  };
}

async function worldViews(root: ServerTestHarness, library: Library, caller: Caller, other: Caller): Promise<WorldViews> {
  const principal = await root.principalFor(root.ownerId);
  const character = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "library-lifecycle",
      name: "Library lifecycle keeper",
      description: "Keeps the native library's ordered history.",
    }),
  });
  const book = await seedWorldBook(root.db, root.services.worldInfo.createBook, {
    principal,
    input: createBookSchema.parse({ name: "Native lifecycle ledger" }),
  });
  const first = await seedWorldEntry(root.db, root.services.worldInfo.createEntry, {
    principal,
    bookId: book.id,
    input: createEntrySchema.parse({ title: "Outer archive", content: "The outer archive preserves the first witness.", keys: ["archive"] }),
  });
  const second = await seedWorldEntry(root.db, root.services.worldInfo.createEntry, {
    principal,
    bookId: book.id,
    input: createEntrySchema.parse({ title: "Inner archive", content: "The inner archive preserves the second witness.", keys: ["witness"] }),
  });
  await seedCharacterBook(root.db, root.services.worldInfo.attachToCharacter, { principal, characterId: character.id, bookId: book.id, role: "primary" });
  const ordered = await read<"worldInfo.applyEntryOrder">(
    { bookId: book.id, orderedEntryIds: [second.id, first.id, second.id] },
    caller.worldInfo.applyEntryOrder,
  );
  const orderedEntries = await read<"worldInfo.listEntries">({ bookId: book.id }, caller.worldInfo.listEntries);
  const replacement = await seedWorldBook(root.db, root.services.worldInfo.createBook, {
    principal,
    input: createBookSchema.parse({ name: "Native replacement ledger" }),
  });
  await seedCharacterBook(root.db, root.services.worldInfo.attachToCharacter, {
    principal,
    characterId: character.id,
    bookId: replacement.id,
    role: "primary",
  });
  const demoted = await read<"worldInfo.listForCharacter">({ characterId: character.id }, caller.worldInfo.listForCharacter);
  const exported = await read<"worldInfo.exportBook">({ bookId: book.id }, caller.worldInfo.exportBook);
  const collision = await other.worldInfo.createBook({ input: createBookSchema.parse({ name: book.name }) });
  await other.worldInfo.createEntry({
    bookId: collision.id,
    input: createEntrySchema.parse({ title: "Foreign archive", content: "The other owner preserves different native canon." }),
  });
  const imported = await read<"worldInfo.importFile">(exported.output, other.worldInfo.importFile);
  const repeated = await read<"worldInfo.importFile">(exported.output, other.worldInfo.importFile);
  const disposable = await caller.worldInfo.duplicateBook({ bookId: replacement.id });
  const deleted = await read<"worldInfo.removeBook">({ bookId: disposable.id }, caller.worldInfo.removeBook);
  return {
    character,
    book,
    first,
    second,
    replacement,
    ordered,
    orderedEntries,
    demoted,
    exported,
    collision,
    imported,
    repeated,
    deleted,
    persisted: await captureWorldBookRows(root.db, book.id),
    books: await read<"worldInfo.listBooks">(undefined, caller.worldInfo.listBooks),
    detail: await read<"worldInfo.getBook">({ bookId: library.world.book.id }, caller.worldInfo.getBook),
    usage: await read<"worldInfo.listBooksWithUsage">(undefined, caller.worldInfo.listBooksWithUsage),
    targets: await read<"worldInfo.listAttachmentsForBook">({ bookId: library.world.book.id }, caller.worldInfo.listAttachmentsForBook),
    entry: await read<"worldInfo.getEntry">({ entryId: first.id }, caller.worldInfo.getEntry),
    characterBooks: await read<"worldInfo.listForCharacter">({ characterId: library.character.id }, caller.worldInfo.listForCharacter),
    personaBooks: await read<"worldInfo.listForPersona">({ personaId: library.persona.id }, caller.worldInfo.listForPersona),
    globalBooks: await read<"worldInfo.listGlobal">(undefined, caller.worldInfo.listGlobal),
    chatBooks: await read<"worldInfo.listForChat">({ chatId: library.room.chat.id }, caller.worldInfo.listForChat),
    inheritedBooks: await read<"worldInfo.listForChat">({ chatId: library.room.chat.id, includeInherited: true }, caller.worldInfo.listForChat),
  };
}

async function regexViews(root: ServerTestHarness, library: Library, caller: Caller, other: Caller): Promise<RegexViews> {
  const principal = await root.principalFor(root.ownerId);
  const scripts: Awaited<ReturnType<typeof seedRegexScript>>[] = [];
  const placement = ["DISPLAY"] as const;
  for (const [index, replacement] of ["archivist", "witness"].entries()) {
    scripts.push(
      await seedRegexScript(root.db, root.services.regex.createScript, {
        principal,
        input: createRegexScriptSchema.parse({
          name: `Native display ledger ${index}`,
          findRegex: "ledger",
          replaceString: replacement,
          placement,
          ...deriveRegexTierFlags(placement),
        }),
      }),
    );
  }
  const [first, second] = scripts;
  if (first === undefined || second === undefined) {
    throw new Error("native ordered script population omitted a real script");
  }
  await seedGlobalRegexScript(root.db, root.services.regex.attachGlobal, { principal, scriptId: first.id });
  await seedCharacterRegexScript(root.db, root.services.regex.attachToCharacter, { principal, characterId: library.character.id, scriptId: first.id });
  await seedPresetRegexScript(root.db, root.services.regex.attachToPreset, { principal, presetId: library.preset.id, scriptId: first.id });
  for (const script of scripts) {
    await seedChatRegexScript(root.db, root.services.regex.attachToChat, { principal, chatId: library.room.chat.id, scriptId: script.id });
  }
  const before = await read<"regex.listForChat">({ chatId: library.room.chat.id }, caller.regex.listForChat);
  const ordered = await read<"regex.applyScopeOrder">(
    { scope: { kind: "chat", chatId: library.room.chat.id }, orderedScriptIds: [second.id, first.id] },
    caller.regex.applyScopeOrder,
  );
  const after = await read<"regex.listForChat">({ chatId: library.room.chat.id }, caller.regex.listForChat);
  const displayOff = await read<"regex.listRoomDisplayScripts">({ chatId: library.room.chat.id }, caller.regex.listRoomDisplayScripts);
  await caller.chat.setHostDisplayScripts({ chatId: library.room.chat.id, enabled: true });
  const displayOn = await read<"regex.listRoomDisplayScripts">({ chatId: library.room.chat.id }, caller.regex.listRoomDisplayScripts);
  await caller.chat.setHostDisplayScripts({ chatId: library.room.chat.id, enabled: false });
  const exported = await read<"regex.exportScript">({ scriptId: first.id }, caller.regex.exportScript);
  const imported = await read<"regex.importScriptFile">({ fileText: exported.output.fileText }, other.regex.importScriptFile);
  const repeated = await read<"regex.importScriptFile">({ fileText: exported.output.fileText }, other.regex.importScriptFile);
  const disposable = await caller.regex.duplicateScript({ scriptId: second.id });
  const bulk = await read<"regex.bulkSetEnabled">({ scriptIds: [disposable.id], enabled: false }, caller.regex.bulkSetEnabled);
  await caller.regex.attachToChat({ chatId: library.room.chat.id, scriptId: disposable.id });
  const detached = await read<"regex.detachFromChat">({ chatId: library.room.chat.id, scriptId: disposable.id }, caller.regex.detachFromChat);
  const detachedAgain = await read<"regex.detachFromChat">({ chatId: library.room.chat.id, scriptId: disposable.id }, caller.regex.detachFromChat);
  const deleted = await read<"regex.removeScript">({ scriptId: disposable.id }, caller.regex.removeScript);
  return {
    scripts,
    first,
    second,
    before,
    ordered,
    after,
    displayOff,
    displayOn,
    exported,
    imported,
    repeated,
    bulk,
    detached,
    detachedAgain,
    deleted,
    persisted: await captureRegexRows(
      root.db,
      scripts.map((script) => script.id),
    ),
    list: await read<"regex.listScripts">(undefined, caller.regex.listScripts),
    usage: await read<"regex.listScriptUsage">({ scriptId: first.id }, caller.regex.listScriptUsage),
    global: await read<"regex.listGlobal">(undefined, caller.regex.listGlobal),
    character: await read<"regex.listForCharacter">({ characterId: library.character.id }, caller.regex.listForCharacter),
    preset: await read<"regex.listForPreset">({ presetId: library.preset.id }, caller.regex.listForPreset),
  };
}

async function tagViews(root: ServerTestHarness, library: Library, caller: Caller): Promise<TagViews> {
  const principal = await root.principalFor(root.ownerId);
  const tag = await seedTag(root.db, root.services.tag.createTag, {
    principal,
    input: createTagSchema.parse({ name: "Native lifecycle label", source: "auto" }),
  });
  await seedCharacterTag(root.db, root.services.tag.attachTag, { principal, characterId: library.character.id, tagId: tag.id, status: "pending" });
  await seedChatTag(root.db, root.services.tag.attachTag, { principal, chatId: library.room.chat.id, tagId: tag.id });
  await seedWorldBookTag(root.db, root.services.tag.attachTag, { principal, worldBookId: library.world.book.id, tagId: tag.id });
  await seedPersonaTag(root.db, root.services.tag.attachTag, { principal, personaId: library.persona.id, tagId: tag.id });
  await seedPresetTag(root.db, root.services.tag.attachTag, { principal, presetId: library.preset.id, tagId: tag.id });
  const pending = await read<"tag.listPendingSuggestions">({ characterId: library.character.id }, caller.tag.listPendingSuggestions);
  const before = await read<"tag.listTagsWithUsage">(undefined, caller.tag.listTagsWithUsage);
  const accepted = await seedCharacterTag(root.db, root.services.tag.attachTag, { principal, characterId: library.character.id, tagId: tag.id });
  return {
    tag,
    pending,
    before,
    accepted,
    list: await read<"tag.listTags">(undefined, caller.tag.listTags),
    usage: await read<"tag.listTagsWithUsage">(undefined, caller.tag.listTagsWithUsage),
    vocabulary: await read<"tag.listTagFilterVocabulary">(undefined, caller.tag.listTagFilterVocabulary),
    reaches: await Promise.all(
      TAG_TARGET_TYPES.map((targetType) => read<"tag.listAttachedEntities">({ tagId: tag.id, targetType }, caller.tag.listAttachedEntities)),
    ),
    pendingAfter: await read<"tag.listPendingSuggestions">({ characterId: library.character.id }, caller.tag.listPendingSuggestions),
  };
}

async function personaViews(library: Library, caller: Caller, other: Caller): Promise<PersonaViews> {
  const duplicate = await read<"persona.duplicate">({ personaId: library.persona.id }, caller.persona.duplicate);
  const exported = await read<"persona.export">({ personaId: duplicate.output.id }, caller.persona.export);
  const imported = await read<"persona.import">({ fileText: exported.output.fileText }, other.persona.import);
  const repeated = await read<"persona.import">({ fileText: exported.output.fileText }, other.persona.import);
  const disconnected = await read<"persona.disconnectFromCharacter">(
    { personaId: duplicate.output.id, characterId: library.character.id },
    caller.persona.disconnectFromCharacter,
  );
  const deleted = await read<"persona.remove">({ personaId: duplicate.output.id }, caller.persona.remove);
  return {
    duplicate,
    exported,
    imported,
    repeated,
    disconnected,
    deleted,
    connected: await read<"persona.listConnectedToCharacter">({ characterId: library.character.id }, caller.persona.listConnectedToCharacter),
    characters: await read<"persona.listConnectedCharacters">({ personaId: library.persona.id }, caller.persona.listConnectedCharacters),
  };
}

async function rosterViews(root: ServerTestHarness, library: Library, caller: Caller): Promise<RosterViews> {
  const principal = await root.principalFor(root.ownerId);
  const addedCharacter = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "library-roster",
      name: "Native roster witness",
      description: "Preserves its own seat in the native library party.",
    }),
  });
  const room = await caller.chat.startChat({ characterIds: [library.character.id], opening: "none" });
  const ruleCatalog = await read<"automation.listRulePresets">(undefined, caller.automation.listRulePresets);
  const input = createRosterPresetSchema.parse({
    name: "Native library party",
    anchorPersonaId: library.persona.id,
    groupConfig: { policy: "list", cardScope: "scoped", output: "per-speaker" },
    members: [
      { kind: "character", characterId: addedCharacter.id, position: 9, talkativeness: 0.25, disabled: true },
      { kind: "character", characterId: library.character.id, position: 41, talkativeness: 0.75, disabled: false },
    ],
    rules: [{ rulePresetId: CORPUS_LIBRARY_RULE_PRESET, knobs: {} }],
  });
  const persisted = await seedRosterPreset(root.db, root.services.rosterPreset.create, { principal, input });
  const detail = await read<"rosterPreset.get">({ presetId: persisted.preset.id }, caller.rosterPreset.get);
  const applied = await read<"rosterPreset.applyToChat">(
    { presetId: persisted.preset.id, chatId: room.chat.id, timeZone: UTC_TIME_ZONE },
    caller.rosterPreset.applyToChat,
  );
  const firstRules = await read<"automation.listRules">({ chatId: room.chat.id }, caller.automation.listRules);
  const appliedAgain = await read<"rosterPreset.applyToChat">(applied.input, caller.rosterPreset.applyToChat);
  const repeatedRules = await read<"automation.listRules">({ chatId: room.chat.id }, caller.automation.listRules);
  return {
    addedCharacter,
    room,
    persisted,
    detail,
    applied,
    appliedAgain,
    ruleCatalog,
    firstRules,
    repeatedRules,
    list: await read<"rosterPreset.list">(undefined, caller.rosterPreset.list),
    chat: await read<"chat.getChat">({ chatId: room.chat.id }, caller.chat.getChat),
  };
}

async function presetViews(library: Library, actors: Actors, caller: Caller): Promise<PresetViews> {
  const settings = await caller.settings.getUserSettings();
  const previous = settings.config.seeds.defaultPresetId;
  const detail = await read<"preset.get">({ id: library.preset.id }, caller.preset.get);
  const inactive = await read<"preset.listUsage">({ id: library.preset.id }, caller.preset.listUsage);
  let active: CorpusRead<"preset.listUsage">;
  try {
    await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: library.preset.id } });
    active = await read<"preset.listUsage">({ id: library.preset.id }, caller.preset.listUsage);
  } finally {
    await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: previous } });
  }
  return {
    detail,
    inactive,
    active,
    previous,
    restoredDefault: (await caller.settings.getUserSettings()).config.seeds.defaultPresetId,
    list: await read<"preset.list">(undefined, caller.preset.list),
    effective: await read<"preset.resolveEffective">(
      { id: library.preset.id, target: { kind: "connection", connectionId: actors.connections.text.id } },
      caller.preset.resolveEffective,
    ),
  };
}

async function documentViews(root: ServerTestHarness, library: Library, caller: Caller): Promise<DocumentViews> {
  const input = {
    name: "Native lifecycle source",
    text: "The native archive records an intact intake and its independently preserved witness.",
    destination: { kind: "global" as const },
  };
  const created = { input, output: await caller.databank.createFromText(input) };
  const id = created.output.document.id;
  const intake = (await caller.workloads.list()).filter((job) => !job.poison && job.kind === "databank-ingest" && job.params.documentId === id);
  if (intake.length !== 1) {
    throw new Error("native document intake has no unique admitted queue receipt");
  }
  const settledIntake = await settleCorpusWorkloads(root, caller, intake);
  const chunks = await captureDocumentChunks(root.db, id);
  const repeated = await read<"databank.createFromText">(input, caller.databank.createFromText);
  const reindexInput = { scope: { kind: "document" as const, documentId: id }, mode: "chunk-embed" as const };
  const reindexed = { input: reindexInput, output: await caller.databank.reindex(reindexInput) };
  const jobs = await settleCorpusWorkloads(root, caller, [{ id: reindexed.output.workloadId }]);
  return {
    created,
    intake,
    settledIntake,
    repeated,
    chunks,
    reindexed,
    jobs,
    repeatedChunks: await captureDocumentChunks(root.db, id),
    detail: await read<"databank.get">({ id, includeText: true }, caller.databank.get),
    metadata: await read<"databank.get">({ id }, caller.databank.get),
    list: await read<"databank.list">({ search: "Native lifecycle source", limit: 1 }, caller.databank.list),
    health: await read<"databank.bankHealth">(undefined, caller.databank.bankHealth),
    global: await read<"databank.listGlobal">(undefined, caller.databank.listGlobal),
    attachments: await read<"databank.listAttachments">({ id: library.document.id }, caller.databank.listAttachments),
    active: await read<"databank.listActiveForChat">({ chatId: library.room.chat.id }, caller.databank.listActiveForChat),
    assets: await read<"assets.listOwned">({ kind: "gallery", limit: ASSET_LIST_LIMIT_MAX }, caller.assets.listOwned),
    gallery: await read<"assets.listGallery">({ subjectCharacterId: library.character.id, limit: ASSET_LIST_LIMIT_MAX }, caller.assets.listGallery),
    blobs: await read<"assets.resolveBlobRefs">({ assetIds: [library.asset.assetId] }, caller.assets.resolveBlobRefs),
  };
}

/** Produce missing library projections through actual writers/readers without changing earlier corpus cohorts. */
export async function seedCorpusLibraryViews(root: ServerTestHarness, library: Library, actors: Actors): Promise<LibraryViews> {
  const caller = await root.internalCallerFor(root.ownerId);
  const other = await root.internalCallerFor(actors.secondUserId);
  const world = await worldViews(root, library, caller, other);
  const regex = await regexViews(root, library, caller, other);
  const tags = await tagViews(root, library, caller);
  const persona = await personaViews(library, caller, other);
  const roster = await rosterViews(root, library, caller);
  const preset = await presetViews(library, actors, caller);
  const documents = await documentViews(root, library, caller);
  await root.settleBackground();
  const before = await effects(root, world, regex, documents);
  const errors = await Promise.all([
    refused(other.worldInfo.getBook({ bookId: world.book.id })),
    refused(other.worldInfo.listAttachmentsForBook({ bookId: world.book.id })),
    refused(other.regex.listScriptUsage({ scriptId: regex.first.id })),
    refused(other.regex.applyScopeOrder({ scope: { kind: "chat", chatId: library.room.chat.id }, orderedScriptIds: [regex.second.id, regex.first.id] })),
    refused(other.tag.listAttachedEntities({ tagId: tags.tag.id, targetType: "character" })),
    refused(other.persona.listConnectedCharacters({ personaId: library.persona.id })),
    refused(other.rosterPreset.get({ presetId: roster.persisted.preset.id })),
    refused(other.rosterPreset.applyToChat({ presetId: roster.persisted.preset.id, chatId: roster.room.chat.id, timeZone: UTC_TIME_ZONE })),
    refused(other.preset.listUsage({ id: library.preset.id })),
    refused(other.databank.listAttachments({ id: library.document.id })),
    refused(other.databank.listActiveForChat({ chatId: library.room.chat.id })),
    refused(caller.worldInfo.importFile({ fileText: "{" })),
    refused(caller.regex.importScriptFile({ fileText: "{" })),
    refused(caller.persona.import({ fileText: "{" })),
  ]);
  const foreignBlobs = await other.assets.resolveBlobRefs({ assetIds: [library.asset.assetId] });
  const after = await effects(root, world, regex, documents);
  await root.settleBackground();
  const viewer = await caller.sessions.me();
  return {
    world,
    regex,
    tags,
    persona,
    roster,
    preset,
    documents,
    refusals: { errors, foreignBlobs, before, after },
    publication: {
      worldInfo: {
        viewerUserId: viewer.userId,
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
      },
      regex: {
        viewerUserId: viewer.userId,
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
      },
    },
  };
}

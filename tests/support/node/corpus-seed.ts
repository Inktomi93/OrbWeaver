import { createCharacterSchema } from "@orb/contracts/character";
import { createPersonaSchema } from "@orb/contracts/persona";
import { parsePresetFile } from "@orb/contracts/preset";
import { createRosterPresetSchema } from "@orb/contracts/roster-preset";
import { createTagSchema } from "@orb/contracts/tag";
import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { ChatId, DocumentId, PersonaId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { DEFAULT_CHARACTER_CARDS } from "@orb/server/domain/character";
import { seedDefaultPreset, seedThemes } from "@orb/server/entry/boot";
import type { SeedDemoResult } from "@orb/tooling/seed";
import { loadDemoSeed } from "@orb/tooling/seed";
import type { CorpusWire } from "../iso/corpus.ts";
import { corpusReadInput } from "../iso/corpus.ts";
import { makeAssetBytes } from "./factories/asset.ts";
import type { AutomationRuleRow } from "./factories/automation.ts";
import {
  captureAutomationExecution,
  captureAutomationRule,
  captureGlobalVariable,
  seedAutomationOwnerBudget,
  seedAutomationRun,
  seedGlobalVariable,
} from "./factories/rows/automation.ts";
import { seedCharacterHistory, seedCharacterPersona } from "./factories/rows/character.ts";
import { seedCharacterDocument, seedChatDocument, seedDocument, seedGlobalDocument } from "./factories/rows/databank.ts";
import { captureDocumentChunks } from "./factories/rows/embedding-generation.ts";
import { seedGalleryItem } from "./factories/rows/gallery.ts";
import { seedPersonaFromCharacter } from "./factories/rows/persona.ts";
import { seedImportedPreset, seedUpdatedPreset } from "./factories/rows/preset.ts";
import { captureRegexRows } from "./factories/rows/regex.ts";
import { captureRosterRows, seedRosterPreset } from "./factories/rows/roster-preset.ts";
import type { CapturedCookieAuthRows } from "./factories/rows/sessions.ts";
import { captureCookieAuthRows } from "./factories/rows/sessions.ts";
import { seedUserContentLedger } from "./factories/rows/settings.ts";
import { seedStatsRows } from "./factories/rows/stats.ts";
import { seedCharacterTag, seedChatTag, seedPersonaTag, seedPresetTag, seedWorldBookTag } from "./factories/rows/tag.ts";
import {
  captureWorldBookRows,
  seedCharacterBook,
  seedChatBook,
  seedGlobalBook,
  seedPersonaBook,
  seedWorldBook,
  seedWorldEntry,
} from "./factories/rows/world-info.ts";
import {
  captureTurnRows,
  seedAssetRows,
  seedAutomationRuleRows,
  seedAutomationTestFiresRows,
  seedCharacterRows,
  seedCreatedTagRows,
  seedPersonaRows,
  seedPresetRows,
} from "./factories/rows.ts";
import type { createServerHarness } from "./server.ts";

export { captureCookieAuth } from "./corpus-auth.ts";
export { seedOidcCorpus } from "./corpus-oidc.ts";

type ServerHarness = Awaited<ReturnType<typeof createServerHarness>>;
type CorpusCaller = Awaited<ReturnType<ServerHarness["internalCallerFor"]>>;

export interface SeededCorpusLibraries {
  readonly derivedPersona: Awaited<ReturnType<typeof seedPersonaFromCharacter>>;
  readonly branchedPreset: Awaited<ReturnType<typeof seedUpdatedPreset>>;
  readonly importedPreset: Awaited<ReturnType<typeof seedImportedPreset>>;
  readonly roster: Awaited<ReturnType<typeof seedRosterPreset>>;
  readonly createdTag: Awaited<ReturnType<typeof seedCreatedTagRows>>;
  readonly rows: {
    readonly asset: Awaited<ReturnType<typeof seedAssetRows>>["row"];
    readonly character: Awaited<ReturnType<typeof seedCharacterRows>>["row"];
    readonly persona: Awaited<ReturnType<typeof seedPersonaRows>>["row"];
    readonly preset: Awaited<ReturnType<typeof seedPresetRows>>["row"];
  };
  readonly character: Awaited<ReturnType<ServerHarness["services"]["character"]["create"]>>;
  readonly persona: Awaited<ReturnType<ServerHarness["services"]["persona"]["create"]>>;
  readonly preset: Awaited<ReturnType<CorpusCaller["preset"]["create"]>>;
  readonly room: Awaited<ReturnType<ServerHarness["services"]["chat"]["startChat"]>>;
  readonly history: Awaited<ReturnType<typeof seedCharacterHistory>>;
  readonly snapshot: Awaited<ReturnType<typeof seedCharacterHistory>>["row"];
  readonly characterPersona: Awaited<ReturnType<typeof seedCharacterPersona>>;
  readonly asset: Awaited<ReturnType<ServerHarness["app"]["assets"]["store"]>>;
  readonly gallery: Awaited<ReturnType<typeof seedGalleryItem>>;
  readonly world: Awaited<ReturnType<typeof captureWorldBookRows>>;
  readonly document: Awaited<ReturnType<typeof seedDocument>>;
  readonly documents: {
    readonly character: Awaited<ReturnType<typeof seedCharacterDocument>>;
    readonly chat: Awaited<ReturnType<typeof seedChatDocument>>;
    readonly global: Awaited<ReturnType<typeof seedGlobalDocument>>;
  };
  readonly tag: Awaited<ReturnType<typeof seedCreatedTagRows>>["row"];
  readonly tags: {
    readonly character: Awaited<ReturnType<typeof seedCharacterTag>>;
    readonly chat: Awaited<ReturnType<typeof seedChatTag>>;
    readonly persona: Awaited<ReturnType<typeof seedPersonaTag>>;
    readonly preset: Awaited<ReturnType<typeof seedPresetTag>>;
    readonly world: Awaited<ReturnType<typeof seedWorldBookTag>>;
  };
}

/** Shared library canon and relations come from actual owner operations; capture never substitutes FK or stamp policy. */
export async function seedCorpusLibraries(root: ServerHarness): Promise<SeededCorpusLibraries> {
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const createdCharacter = await seedCharacterRows(root, {
    principal,
    input: createCharacterSchema.parse({ handle: "corpus-library", name: "The ledger archivist", description: "An archivist preserving the orbital ledger." }),
  });
  const character = createdCharacter.view;
  const createdPersona = await seedPersonaRows(root, {
    principal,
    input: createPersonaSchema.parse({ name: "The ledger keeper", description: "Keeper of the orbital ledger." }),
  });
  const persona = createdPersona.view;
  const createdPreset = await seedPresetRows(root, root.ownerId, { name: "Corpus library preset", kind: "custom" });
  const preset = createdPreset.view;
  const room = await root.services.chat.startChat({ principal, characterIds: [character.id], opening: "none" });
  const history = await seedCharacterHistory(root, {
    principal,
    characterId: character.id,
    label: "Corpus library baseline",
  });
  const snapshot = history.row;
  const characterPersona = await seedCharacterPersona(root, {
    principal,
    characterId: character.id,
    personaId: persona.id,
  });
  const storedAsset = await seedAssetRows(root, {
    principal,
    kind: "gallery",
    mime: "image/png",
    bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
  });
  const asset = storedAsset.stored;
  const gallery = await seedGalleryItem(root, { principal, assetId: asset.assetId, subjectCharacterId: character.id });
  const book = await seedWorldBook(root, { principal, input: createBookSchema.parse({ name: "Orbital ledger canon" }) });
  await seedWorldEntry(root, {
    principal,
    bookId: book.id,
    input: createEntrySchema.parse({ title: "The orbital loom", content: "The loom records every completed ledger scene.", keys: ["loom"] }),
  });
  await seedCharacterBook(root, { principal, characterId: character.id, bookId: book.id, role: "primary" });
  await seedChatBook(root, { principal, chatId: room.chat.id, bookId: book.id });
  await seedGlobalBook(root, { principal, bookId: book.id });
  await seedPersonaBook(root, { principal, personaId: persona.id, bookId: book.id });
  const world = await captureWorldBookRows(root.db, book.id);
  const document = await seedDocument(root, {
    principal,
    name: "Orbital ledger source",
    text: "The orbital ledger preserves the witness names and the completed loom scenes.",
  });
  const documents = {
    character: await seedCharacterDocument(root, {
      principal,
      characterId: character.id,
      documentId: document.id,
    }),
    chat: await seedChatDocument(root, { principal, chatId: room.chat.id, documentId: document.id }),
    global: await seedGlobalDocument(root, { principal, documentId: document.id }),
  };
  const createdTag = await seedCreatedTagRows(root, {
    principal,
    input: createTagSchema.parse({ name: "Orbital ledger", source: "auto" }),
  });
  const tag = createdTag.row;
  const tags = {
    character: await seedCharacterTag(root, { principal, characterId: character.id, tagId: tag.id, status: "pending" }),
    chat: await seedChatTag(root, { principal, chatId: room.chat.id, tagId: tag.id }),
    persona: await seedPersonaTag(root, { principal, personaId: persona.id, tagId: tag.id }),
    preset: await seedPresetTag(root, { principal, presetId: preset.id, tagId: tag.id }),
    world: await seedWorldBookTag(root, { principal, worldBookId: book.id, tagId: tag.id }),
  };
  const derivedPersona = await seedPersonaFromCharacter(root, {
    principal,
    characterId: character.id,
    swapMacros: true,
  });
  let source = (await caller.preset.list()).find((row) => row.isSystemDefault);
  if (source === undefined) {
    await seedDefaultPreset({ db: databaseHandle(root.db), now: root.clock.now });
    source = (await caller.preset.list()).find((row) => row.isSystemDefault);
  }
  if (source === undefined) {
    throw new Error("native library corpus has no production-seeded system preset");
  }
  // Explicit new authorship leaves any earlier converged fork and active configuration untouched.
  const branchedPreset = await seedUpdatedPreset(root, root.ownerId, {
    id: source.id,
    fork: { mode: "new", name: "Corpus library branch" },
  });
  const descriptor = root.app.portability.find((entity) => entity.kind === "preset");
  if (descriptor === undefined) {
    throw new Error("native library corpus has no preset export descriptor");
  }
  let fileText: string | undefined;
  for await (const file of descriptor.exportAll(root.ownerId)) {
    const text = new TextDecoder().decode(file.bytes);
    const parsed = parsePresetFile(JSON.parse(text));
    if (parsed.ok && parsed.name === branchedPreset.view.name) {
      fileText = text;
      break;
    }
  }
  if (fileText === undefined) {
    throw new Error("native preset export omitted the produced library branch");
  }
  const importedPreset = await seedImportedPreset(root, root.ownerId, { fileText });
  const roster = await seedRosterPreset(root, {
    principal,
    input: createRosterPresetSchema.parse({
      name: "Corpus library roster",
      anchorPersonaId: derivedPersona.view.id,
      members: [{ kind: "character", characterId: character.id, position: 9 }],
    }),
  });
  return {
    rows: { asset: storedAsset.row, character: createdCharacter.row, persona: createdPersona.row, preset: createdPreset.row },
    history,
    derivedPersona,
    branchedPreset,
    importedPreset,
    roster,
    createdTag,
    character,
    persona,
    preset,
    room,
    snapshot,
    characterPersona,
    asset,
    gallery,
    world,
    document,
    documents,
    tag,
    tags,
  };
}

const AUTOMATION_GATE_KEY = "corpusAssetAutomationEnabled";
const AUTOMATION_COUNTER_KEY = "corpusAssetEvents";
const AUTOMATION_OWNER_CAP = 2;

export interface SeededCorpusAutomation {
  readonly budget: Awaited<ReturnType<typeof seedAutomationOwnerBudget>>;
  readonly globalRule: AutomationRuleRow;
  readonly dry: Awaited<ReturnType<typeof seedAutomationTestFiresRows>>;
  readonly firstMiss: Awaited<ReturnType<typeof captureAutomationCounter>>;
  readonly firstHit: Awaited<ReturnType<typeof captureAutomationCounter>>;
  readonly secondMiss: Awaited<ReturnType<typeof captureAutomationCounter>>;
  readonly secondHit: Awaited<ReturnType<typeof captureAutomationCounter>>;
  readonly rateLimited: Awaited<ReturnType<typeof captureAutomationCounter>>;
  readonly manual: Awaited<ReturnType<typeof seedAutomationRun>>;
  readonly completed: Awaited<ReturnType<typeof captureAutomationCounter>>;
  readonly analysisRule: AutomationRuleRow;
  readonly analysis: Awaited<ReturnType<typeof seedAutomationRun>>;
}

async function captureAutomationCounter(
  root: ServerHarness,
  ruleId: AutomationRuleRow["id"],
): Promise<{
  readonly execution: Awaited<ReturnType<typeof captureAutomationExecution>>;
  readonly variable: NonNullable<Awaited<ReturnType<typeof captureGlobalVariable>>>;
}> {
  const [execution, variable] = await Promise.all([
    captureAutomationExecution(root.db, ruleId),
    captureGlobalVariable(root.db, root.ownerId, AUTOMATION_COUNTER_KEY),
  ]);
  if (variable === undefined) {
    throw new Error("actual corpus automation counter has no canonical owner/key row");
  }
  return { execution, variable };
}

/** Drive actual watched asset events, manual consent and a hosted analysis pass; private state never becomes portable wire. */
export async function seedCorpusAutomation(root: ServerHarness, chatId: ChatId): Promise<SeededCorpusAutomation> {
  const principal = await root.principalFor(root.ownerId);
  const automation = root.services.automation;
  const budget = await seedAutomationOwnerBudget(root, { principal, maxFiresPerHour: AUTOMATION_OWNER_CAP });
  await seedGlobalVariable(root, { principal, key: AUTOMATION_COUNTER_KEY, value: "0" });
  const gate = { principal, key: AUTOMATION_GATE_KEY };
  await seedGlobalVariable(root, { ...gate, value: "no" });
  const globalRule = await seedAutomationRuleRows(root, {
    principal,
    chatId: null,
    name: "Corpus owned asset counter",
    trigger: { bus: "domain", type: "asset.created" },
    predicateCel: `has(global.${AUTOMATION_GATE_KEY}) && global.${AUTOMATION_GATE_KEY} == "yes"`,
    timeZone: UTC_TIME_ZONE,
    actions: [{ type: "set_variable", scope: "global", key: AUTOMATION_COUNTER_KEY, op: "inc" }],
  });
  const params = { principal, ruleId: globalRule.id };
  const dry = await seedAutomationTestFiresRows(root, params);
  await automation.setRuleEnabled({ ...params, enabled: true });
  const watchedAsset = async (): Promise<Awaited<ReturnType<typeof captureAutomationCounter>>> => {
    await root.app.assets.store({ principal, kind: "gallery", mime: "image/png", bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)) });
    await root.settleBackground();
    return captureAutomationCounter(root, globalRule.id);
  };
  const firstMiss = await watchedAsset();
  await automation.setGlobalVariable({ ...gate, value: "yes" });
  const firstHit = await watchedAsset();
  await automation.setGlobalVariable({ ...gate, value: "no" });
  const secondMiss = await watchedAsset();
  await automation.setGlobalVariable({ ...gate, value: "yes" });
  const secondHit = await watchedAsset();
  const rateLimited = await watchedAsset();
  const manual = await seedAutomationRun(root, params);
  const completed = await captureAutomationCounter(root, globalRule.id);

  await root.services.chat.commitMessage({ principal, chatId, content: "The keeper preserves the completed orbital ledger." });
  const analysisRule = await seedAutomationRuleRows(root, {
    principal,
    chatId,
    name: "Corpus private ledger direction",
    trigger: { bus: "chat", type: "messageCommitted" },
    predicateCel: "false",
    timeZone: UTC_TIME_ZONE,
    actions: [{ type: "run_analysis", brief: "Preserve the orbital ledger's direction.", routes: { steer: { apply: "direct" } } }],
  });
  await automation.setRuleEnabled({ principal, ruleId: analysisRule.id, enabled: true });
  const analysis = await seedAutomationRun(root, { principal, ruleId: analysisRule.id });
  if (analysis.result.outcome !== "fired" || analysis.state === undefined) {
    throw new Error("actual corpus analysis produced no completed private state", { cause: analysis.result });
  }
  const storedGlobal = await captureAutomationRule(root.db, globalRule.id);
  const storedAnalysis = await captureAutomationRule(root.db, analysisRule.id);
  if (storedGlobal === undefined || storedAnalysis === undefined) {
    throw new Error("actual corpus automation rule vanished before capture");
  }
  return {
    budget,
    globalRule: storedGlobal,
    dry,
    firstMiss,
    firstHit,
    secondMiss,
    secondHit,
    rateLimited,
    manual,
    completed,
    analysisRule: storedAnalysis,
    analysis,
  };
}

export interface SeedSyntheticCorpusOptions {
  readonly secondUserId?: Awaited<ReturnType<ServerHarness["app"]["sessions"]["ensureUser"]>>;
  readonly ownerPassword: string;
  readonly log: (message: string) => void;
}

interface CorpusReadIdentities {
  readonly soloChatId: ChatId;
  readonly groupChatId: ChatId;
  readonly documentId: DocumentId;
  readonly personaIds?: readonly PersonaId[];
}

/** Capture the current completed graph state using genuine operation-returned identities. */
export async function captureCorpusReads(root: ServerHarness, identities: CorpusReadIdentities): Promise<CorpusWire["reads"]> {
  const caller = await root.internalCallerFor(root.ownerId);
  const absentInput = corpusReadInput.absent();
  const soloInput = corpusReadInput.chat({ id: identities.soloChatId });
  const groupInput = corpusReadInput.chat({ id: identities.groupChatId });
  const documentInput = corpusReadInput.document({ id: identities.documentId });
  const documentListInput = corpusReadInput.documentList();
  const ownerLatencyInput = corpusReadInput.ownerLatency();
  return {
    "sessions.me": [{ input: absentInput, output: await caller.sessions.me(absentInput) }],
    "settings.getUserSettings": [{ input: absentInput, output: await caller.settings.getUserSettings(absentInput) }],
    "settings.listThemes": [{ input: absentInput, output: await caller.settings.listThemes(absentInput) }],
    "character.list": [{ input: absentInput, output: await caller.character.list(absentInput) }],
    "character.count": [{ input: absentInput, output: await caller.character.count(absentInput) }],
    "persona.list": [{ input: absentInput, output: await caller.persona.list(absentInput) }],
    "persona.get": await Promise.all(
      (identities.personaIds ?? []).map(async (personaId) => {
        const input = corpusReadInput.persona({ id: personaId });
        return { input, output: await caller.persona.get(input) };
      }),
    ),
    "chat.listChats": [{ input: absentInput, output: await caller.chat.listChats(absentInput) }],
    "chat.countChats": [{ input: absentInput, output: await caller.chat.countChats(absentInput) }],
    "chat.getChat": [
      { input: soloInput, output: await caller.chat.getChat(soloInput) },
      { input: groupInput, output: await caller.chat.getChat(groupInput) },
    ],
    "databank.get": [{ input: documentInput, output: await caller.databank.get(documentInput) }],
    "databank.list": [{ input: documentListInput, output: await caller.databank.list(documentListInput) }],
    "databank.bankHealth": [{ input: absentInput, output: await caller.databank.bankHealth(absentInput) }],
    "notifications.list": [{ input: absentInput, output: await caller.notifications.list(absentInput) }],
    "tag.listPendingSuggestions": [{ input: absentInput, output: await caller.tag.listPendingSuggestions(absentInput) }],
    "worldInfo.countBooks": [{ input: absentInput, output: await caller.worldInfo.countBooks(absentInput) }],
    "regex.countScripts": [{ input: absentInput, output: await caller.regex.countScripts(absentInput) }],
    "rosterPreset.count": [{ input: absentInput, output: await caller.rosterPreset.count(absentInput) }],
    "automation.getOwnerBudgets": [{ input: absentInput, output: await caller.automation.getOwnerBudgets(absentInput) }],
    "stats.overview": [{ input: absentInput, output: await caller.stats.overview(absentInput) }],
    "stats.wrapped": [{ input: absentInput, output: await caller.stats.wrapped(absentInput) }],
    "stats.byModel": [{ input: absentInput, output: await caller.stats.byModel(absentInput) }],
    "stats.latency": [{ input: ownerLatencyInput, output: await caller.stats.latency(ownerLatencyInput) }],
    "stats.personaUsage": [{ input: absentInput, output: await caller.stats.personaUsage(absentInput) }],
    "stats.timeseries": [{ input: absentInput, output: await caller.stats.timeseries(absentInput) }],
    "stats.leaderboard": [{ input: absentInput, output: await caller.stats.leaderboard(absentInput) }],
    "stats.freshness": [{ input: absentInput, output: await caller.stats.freshness(absentInput) }],
    "stats.momentum": [{ input: absentInput, output: await caller.stats.momentum(absentInput) }],
  };
}

interface SyntheticCorpus {
  readonly ownerId: ServerHarness["ownerId"];
  readonly secrets: readonly string[];
  readonly identities: CorpusReadIdentities;
  readonly bootCharacters: readonly NonNullable<Awaited<ReturnType<ServerHarness["services"]["character"]["findByHandle"]>>>[];
  readonly seed: SeedDemoResult;
  readonly rows: {
    readonly documentChunks: Awaited<ReturnType<typeof captureDocumentChunks>>;
    readonly soloMessages: Awaited<ReturnType<typeof captureTurnRows>>;
    readonly groupMessages: Awaited<ReturnType<typeof captureTurnRows>>;
    readonly worldInfo: Awaited<ReturnType<typeof captureWorldBookRows>>;
    readonly regex: Awaited<ReturnType<typeof captureRegexRows>>;
    readonly rosters: Awaited<ReturnType<typeof captureRosterRows>>;
    readonly seedLedger: Awaited<ReturnType<typeof seedUserContentLedger>>;
    readonly ownerStats: Awaited<ReturnType<typeof seedStatsRows>>;
    readonly secondUserStats: Awaited<ReturnType<typeof seedStatsRows>>;
    readonly loginBuckets: CapturedCookieAuthRows["loginBuckets"];
  };
  readonly auth: CorpusWire["auth"];
  readonly reads: CorpusWire["reads"];
}

/** Uses the caller's graph; raw execution and its lifetime remain owned by the actual server harness. */
export async function seedSyntheticCorpus(root: ServerHarness, options: SeedSyntheticCorpusOptions): Promise<SyntheticCorpus> {
  const owner = await root.principalFor(root.ownerId);
  await seedDefaultPreset({ db: databaseHandle(root.db), now: root.clock.now });
  await seedThemes({ db: databaseHandle(root.db), now: root.clock.now });
  const seedLedger = await seedUserContentLedger(root, owner);

  // The demo's optional CLI branches cannot certify a corpus whose required boot content is missing.
  const bootCharacters = await Promise.all(
    DEFAULT_CHARACTER_CARDS.map(async (card) => {
      const produced = await root.services.character.findByHandle({ ownerId: root.ownerId, handle: card.input.handle });
      if (produced === null) {
        throw new Error(`synthetic corpus lacks the production-seeded character ${card.input.handle}`);
      }
      return produced;
    }),
  );
  const { seedDemoContent } = await loadDemoSeed();
  const seed = await seedDemoContent({
    ...(options.secondUserId === undefined ? {} : { secondUserId: options.secondUserId }),
    built: root.app,
    services: root.services,
    owner,
    ownerId: root.ownerId,
    principalFor: root.principalFor,
    runTurn: async (send) => {
      const result = await send();
      if (result.aborted || result.messages.length === 0) {
        throw new Error("synthetic corpus turn produced no completed required seed message");
      }
      return result;
    },
    log: options.log,
  });
  if (seed.solo === null || seed.group === null || seed.soloTurn === null || seed.groupTurn === null) {
    throw new Error("synthetic corpus did not produce both required demo rooms and turns");
  }
  if (seed.worldBook === null || seed.regexTiers === null) {
    throw new Error("synthetic corpus did not produce required world-info and regex library outcomes");
  }
  if (seed.ingest.failed.length > 0) {
    throw new Error("synthetic corpus document ingestion failed", { cause: seed.ingest.failed });
  }
  await root.settleBackground();
  const soloMessages = await captureTurnRows(root.db, seed.soloTurn);
  const groupMessages = await captureTurnRows(root.db, seed.groupTurn);
  const worldInfo = await captureWorldBookRows(root.db, seed.worldBook.id);
  const regex = await captureRegexRows(root.db, [
    seed.regexTiers.findReplace.id,
    seed.regexTiers.displayOnly.id,
    seed.regexTiers.promptOnly.id,
    seed.presetRegex.id,
  ]);
  const rosters = await captureRosterRows(
    root.db,
    seed.rosters.map((roster) => roster.id),
  );
  const producedDocumentChunks = await captureDocumentChunks(root.db, seed.document.document.id);
  if (producedDocumentChunks.length === 0) {
    throw new Error("synthetic corpus document ingestion produced no canonical embedded chunks");
  }

  const { auth, loginBuckets, secrets } = await captureCookieAuthRows(root, owner, options.ownerPassword);
  await root.settleBackground();
  const ownerStats = await seedStatsRows(root, root.ownerId);
  const secondUserStats = await seedStatsRows(root, seed.secondUserId);
  const identities = { soloChatId: seed.solo.chat.id, groupChatId: seed.group.chat.id, documentId: seed.document.document.id };

  return {
    ownerId: root.ownerId,
    secrets,
    identities,
    bootCharacters,
    seed,
    // Vector rows remain Node data; ISO/browser publication uses the actual secret-free wire captures.
    rows: {
      documentChunks: producedDocumentChunks,
      soloMessages,
      groupMessages,
      worldInfo,
      regex,
      rosters,
      seedLedger,
      ownerStats,
      secondUserStats,
      loginBuckets,
    },
    auth,
    // These captures prove real routed outputs, not request authentication or complete lifecycle coverage.
    reads: await captureCorpusReads(root, identities),
  };
}

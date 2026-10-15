import { authConfigSchema } from "@orb/contracts/auth-config";
import { createCharacterSchema } from "@orb/contracts/character";
import { assemblyPreviewSchema } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { authMeSchema, CSRF_HEADER } from "@orb/contracts/identity";
import { createPersonaSchema } from "@orb/contracts/persona";
import { createTagSchema } from "@orb/contracts/tag";
import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import type { ChatId, DocumentId, Handle, PersonaId, UserConnectionId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { DEFAULT_CHARACTER_CARDS } from "@orb/server/domain/character";
import { readSessionCookie } from "@orb/server/entry/auth";
import { seedDefaultPreset, seedThemes, seedUserContent } from "@orb/server/entry/boot";
import type { SeedDemoResult } from "@orb/tooling/seed";
import { loadDemoSeed, SECOND_HUMAN_HANDLE } from "@orb/tooling/seed";
import type { CorpusWire } from "../iso/corpus.ts";
import { corpusReadInput } from "../iso/corpus.ts";
import { captureCorpusCookieIdentity } from "./corpus-auth.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL } from "./corpus-provider.ts";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import { makeAssetBytes, seedStoredAsset } from "./factories/asset.ts";
import type { AutomationRuleRow } from "./factories/automation.ts";
import {
  captureAutomationExecution,
  captureAutomationRule,
  captureGlobalVariable,
  seedAutomationOwnerBudget,
  seedAutomationRule,
  seedAutomationRun,
  seedAutomationTestFires,
  seedGlobalVariable,
} from "./factories/automation.ts";
import { seedCharacterPersona, seedCharacterSnapshot, seedCreatedCharacter } from "./factories/character.ts";
import type { UserConnectionRow } from "./factories/connection.ts";
import { seedConnectionBinding, seedUserConnection } from "./factories/connection.ts";
import { seedCharacterDocument, seedChatDocument, seedDocument, seedGlobalDocument } from "./factories/databank.ts";
import { captureChatMemoryRows, captureDocumentChunks } from "./factories/embedding-generation.ts";
import { seedGalleryItem } from "./factories/gallery.ts";
import { captureTurnRows } from "./factories/message.ts";
import { seedCreatedPersona } from "./factories/persona.ts";
import { seedCreatedPreset } from "./factories/preset.ts";
import { captureRegexRows } from "./factories/regex.ts";
import { captureRosterRows } from "./factories/roster-preset.ts";
import { seedLoginBuckets } from "./factories/sessions.ts";
import { seedUserContentLedger } from "./factories/settings.ts";
import { seedStats } from "./factories/stats.ts";
import { seedCharacterTag, seedChatTag, seedPersonaTag, seedPresetTag, seedTag, seedWorldBookTag } from "./factories/tag.ts";
import {
  captureWorldBookRows,
  seedCharacterBook,
  seedChatBook,
  seedGlobalBook,
  seedPersonaBook,
  seedWorldBook,
  seedWorldEntry,
} from "./factories/world-info.ts";
import type { createServerHarness } from "./server.ts";

export type { SeededOidcCorpus } from "./corpus-oidc.ts";
export { seedOidcCorpus } from "./corpus-oidc.ts";

type ServerHarness = Awaited<ReturnType<typeof createServerHarness>>;
type CorpusCaller = Awaited<ReturnType<ServerHarness["internalCallerFor"]>>;
type CorpusTurn = Awaited<ReturnType<ServerHarness["services"]["chat"]["send"]>>;
type RecallRecord = ReturnType<ServerHarness["app"]["recallRecorder"]["recent"]>[number];

export interface SeededCorpusLibraries {
  readonly rows: {
    readonly asset: Awaited<ReturnType<typeof seedStoredAsset>>["row"];
    readonly character: Awaited<ReturnType<typeof seedCreatedCharacter>>["row"];
    readonly persona: Awaited<ReturnType<typeof seedCreatedPersona>>["row"];
    readonly preset: Awaited<ReturnType<typeof seedCreatedPreset>>["row"];
  };
  readonly character: Awaited<ReturnType<ServerHarness["services"]["character"]["create"]>>;
  readonly persona: Awaited<ReturnType<ServerHarness["services"]["persona"]["create"]>>;
  readonly preset: Awaited<ReturnType<CorpusCaller["preset"]["create"]>>;
  readonly room: Awaited<ReturnType<ServerHarness["services"]["chat"]["startChat"]>>;
  readonly snapshot: Awaited<ReturnType<typeof seedCharacterSnapshot>>;
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
  readonly tag: Awaited<ReturnType<typeof seedTag>>;
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
  const createdCharacter = await seedCreatedCharacter(root.db, root.services.character.create, {
    principal,
    input: createCharacterSchema.parse({ handle: "corpus-library", name: "The ledger archivist", description: "An archivist preserving the orbital ledger." }),
  });
  const character = createdCharacter.view;
  const createdPersona = await seedCreatedPersona(root.db, root.services.persona.create, {
    principal,
    input: createPersonaSchema.parse({ name: "The ledger keeper", description: "Keeper of the orbital ledger." }),
  });
  const persona = createdPersona.view;
  const createdPreset = await seedCreatedPreset(root.db, caller.preset.create, { name: "Corpus library preset", kind: "custom" });
  const preset = createdPreset.view;
  const room = await root.services.chat.startChat({ principal, characterIds: [character.id], opening: "none" });
  const snapshot = await seedCharacterSnapshot(root.db, root.services.character.snapshot, {
    principal,
    characterId: character.id,
    label: "Corpus library baseline",
  });
  const characterPersona = await seedCharacterPersona(root.db, root.services.persona.connectToCharacter, {
    principal,
    characterId: character.id,
    personaId: persona.id,
  });
  const storedAsset = await seedStoredAsset(root.db, root.app.assets.store, {
    principal,
    kind: "gallery",
    mime: "image/png",
    bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
  });
  const asset = storedAsset.stored;
  const gallery = await seedGalleryItem(root.db, root.app.assets.addToGallery, { principal, assetId: asset.assetId, subjectCharacterId: character.id });
  const book = await seedWorldBook(root.db, root.services.worldInfo.createBook, { principal, input: createBookSchema.parse({ name: "Orbital ledger canon" }) });
  await seedWorldEntry(root.db, root.services.worldInfo.createEntry, {
    principal,
    bookId: book.id,
    input: createEntrySchema.parse({ title: "The orbital loom", content: "The loom records every completed ledger scene.", keys: ["loom"] }),
  });
  await seedCharacterBook(root.db, root.services.worldInfo.attachToCharacter, { principal, characterId: character.id, bookId: book.id, role: "primary" });
  await seedChatBook(root.db, root.services.worldInfo.attachToChat, { principal, chatId: room.chat.id, bookId: book.id });
  await seedGlobalBook(root.db, root.services.worldInfo.attachGlobal, { principal, bookId: book.id });
  await seedPersonaBook(root.db, root.services.worldInfo.attachToPersona, { principal, personaId: persona.id, bookId: book.id });
  const world = await captureWorldBookRows(root.db, book.id);
  const document = await seedDocument(root.db, root.services.databank.createFromText, {
    principal,
    name: "Orbital ledger source",
    text: "The orbital ledger preserves the witness names and the completed loom scenes.",
  });
  const documents = {
    character: await seedCharacterDocument(root.db, root.services.databank.attachToCharacter, {
      principal,
      characterId: character.id,
      documentId: document.id,
    }),
    chat: await seedChatDocument(root.db, root.services.databank.attachToChat, { principal, chatId: room.chat.id, documentId: document.id }),
    global: await seedGlobalDocument(root.db, root.services.databank.attachGlobal, { principal, documentId: document.id }),
  };
  const tag = await seedTag(root.db, root.services.tag.createTag, { principal, input: createTagSchema.parse({ name: "Orbital ledger", source: "auto" }) });
  const tags = {
    character: await seedCharacterTag(root.db, root.services.tag.attachTag, { principal, characterId: character.id, tagId: tag.id, status: "pending" }),
    chat: await seedChatTag(root.db, root.services.tag.attachTag, { principal, chatId: room.chat.id, tagId: tag.id }),
    persona: await seedPersonaTag(root.db, root.services.tag.attachTag, { principal, personaId: persona.id, tagId: tag.id }),
    preset: await seedPresetTag(root.db, root.services.tag.attachTag, { principal, presetId: preset.id, tagId: tag.id }),
    world: await seedWorldBookTag(root.db, root.services.tag.attachTag, { principal, worldBookId: book.id, tagId: tag.id }),
  };
  return {
    rows: { asset: storedAsset.row, character: createdCharacter.row, persona: createdPersona.row, preset: createdPreset.row },
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
  readonly dry: Awaited<ReturnType<typeof seedAutomationTestFires>>;
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
  const budget = await seedAutomationOwnerBudget(root.db, automation.setOwnerBudgets, { principal, maxFiresPerHour: AUTOMATION_OWNER_CAP });
  await seedGlobalVariable(root.db, automation.setGlobalVariable, { principal, key: AUTOMATION_COUNTER_KEY, value: "0" });
  const gate = { principal, key: AUTOMATION_GATE_KEY };
  await seedGlobalVariable(root.db, automation.setGlobalVariable, { ...gate, value: "no" });
  const globalRule = await seedAutomationRule(root.db, automation.createRule, {
    principal,
    chatId: null,
    name: "Corpus owned asset counter",
    trigger: { bus: "domain", type: "asset.created" },
    predicateCel: `has(global.${AUTOMATION_GATE_KEY}) && global.${AUTOMATION_GATE_KEY} == "yes"`,
    timeZone: UTC_TIME_ZONE,
    actions: [{ type: "set_variable", scope: "global", key: AUTOMATION_COUNTER_KEY, op: "inc" }],
  });
  const params = { principal, ruleId: globalRule.id };
  const dry = await seedAutomationTestFires(root.db, automation.testRule, params);
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
  const manual = await seedAutomationRun(root.db, automation.runRuleNow, params);
  const completed = await captureAutomationCounter(root, globalRule.id);

  await root.services.chat.commitMessage({ principal, chatId, content: "The keeper preserves the completed orbital ledger." });
  const analysisRule = await seedAutomationRule(root.db, automation.createRule, {
    principal,
    chatId,
    name: "Corpus private ledger direction",
    trigger: { bus: "chat", type: "messageCommitted" },
    predicateCel: "false",
    timeZone: UTC_TIME_ZONE,
    actions: [{ type: "run_analysis", brief: "Preserve the orbital ledger's direction.", routes: { steer: { apply: "direct" } } }],
  });
  await automation.setRuleEnabled({ principal, ruleId: analysisRule.id, enabled: true });
  const analysis = await seedAutomationRun(root.db, automation.runRuleNow, { principal, ruleId: analysisRule.id });
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

const RECALL_INTENT = { maxContextTokens: 2048, maxOutputTokens: 64 };
const memoryRecallSchema = assemblyPreviewSchema.shape.trace.shape.memoryRecall.unwrap();

export interface SeedRecallCorpusOptions {
  readonly chatConnectionId: UserConnectionId;
  readonly embedConnectionId: UserConnectionId;
  readonly summarizeConnectionId: UserConnectionId;
  readonly beforeRecall?: () => void;
}

export interface SeededRecallCorpus {
  readonly chatId: ChatId;
  readonly historyTurn: CorpusTurn;
  readonly first: CorpusTurn;
  readonly recalled: CorpusTurn;
  readonly memory: Awaited<ReturnType<typeof captureChatMemoryRows>>;
  readonly jobs: Awaited<ReturnType<CorpusCaller["workloads"]["list"]>>;
  readonly traces: readonly RecallRecord["trace"][];
}

/** Author the room and host preset through their real public writes. */
export async function seedRecallRoom(caller: CorpusCaller): Promise<ChatId> {
  const preset = await caller.preset.create({ name: "Funding control preset", kind: "custom" });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "funding-control", name: "Funding control", description: "A deterministic funding control." }),
  });
  return (await caller.chat.startChat({ characterIds: [card.id], opening: "none" })).chat.id;
}

/** Produce memory through actual turns and workers; only fresh, owner-parsed recall traces are captured. */
export async function seedRecallCorpus(root: ServerHarness, options: SeedRecallCorpusOptions): Promise<SeededRecallCorpus> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  await caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "mixB", maxTier: 0 } } });
  const chatId = await seedRecallRoom(caller);
  await caller.chat.setGroupConfig({ chatId, config: { output: "per-speaker", cardScope: "scoped", policy: "list" } });
  await caller.connection.setBinding({ task: "chat", connectionId: options.chatConnectionId });
  await caller.connection.setBinding({ task: "summarize", connectionId: options.summarizeConnectionId });
  await caller.connection.setBinding({ task: "embed", connectionId: options.embedConnectionId });
  const principal = await root.principalFor(root.ownerId);
  const historyTurn = await root.services.chat.send({ principal, chatId, content: "Witness the opening ledger scene.", intent: RECALL_INTENT });
  if (historyTurn.aborted || historyTurn.messages.length === 0) {
    throw new Error("synthetic recall corpus produced no completed history turn");
  }
  for (let seq = 0; seq < 16; seq += 1) {
    await caller.chat.commitMessage({
      chatId,
      timeZone: UTC_TIME_ZONE,
      content: `Funding memory scene ${seq}: ${"The ledger records the remembered scene and its witnesses. ".repeat(32)}`,
    });
  }
  const first = await root.services.chat.send({ principal, chatId, content: "Remember the ledger.", intent: RECALL_INTENT });
  if (first.aborted || first.messages.length === 0) {
    throw new Error("synthetic recall corpus produced no completed first turn");
  }
  const started = [
    await caller.workloads.start({ input: { kind: "index", params: { source: "text" } }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, mode: "singular" }),
  ];
  const jobs = await settleCorpusWorkloads(root, caller, started);
  const memory = await captureChatMemoryRows(root.db, chatId);
  if (memory.digests.length === 0 || memory.segments.length === 0) {
    throw new Error("synthetic recall corpus workers produced no genuine digests or segments");
  }
  const previous = new Set(root.app.recallRecorder.recent({ chatId }).map((record) => record.seq));
  options.beforeRecall?.();
  const recalled = await root.services.chat.send({ principal, chatId, content: "Which remembered scene held the ledger?", intent: RECALL_INTENT });
  if (recalled.aborted || recalled.messages.length === 0) {
    throw new Error("synthetic recall corpus produced no completed scoped recall turn");
  }
  const traces = root.app.recallRecorder
    .recent({ chatId })
    .filter((record) => !previous.has(record.seq))
    .map((record) => memoryRecallSchema.parse(record.trace));
  if (!traces.some((trace) => trace.queryEmbedded && trace.poolSize > 0)) {
    throw new Error("synthetic recall corpus produced no fresh nonempty recall trace");
  }
  return { chatId, historyTurn, first, recalled, memory, jobs, traces };
}

export interface SeedSyntheticCorpusOptions {
  readonly ownerPassword: string;
  readonly log: (message: string) => void;
}

interface CorpusActors {
  readonly owner: Principal;
  readonly secondUserId: Awaited<ReturnType<ServerHarness["app"]["sessions"]["ensureUser"]>>;
  readonly connections: Awaited<ReturnType<typeof seedCorpusConnections>>;
}

/** Configure actual actors and hosted execution bindings through their owners, not a runtime resolver substitute. */
export async function seedCorpusActors(root: ServerHarness): Promise<CorpusActors> {
  const owner = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal: owner, partial: { privateEndpointAllowlist: [new URL(CORPUS_PROVIDER_ENDPOINT).hostname] } });
  const connections = await seedCorpusConnections(root, owner);
  const secondUserId = await root.app.sessions.ensureUser(brandedId<Handle>().parse(SECOND_HUMAN_HANDLE));
  await seedCorpusConnections(root, await root.principalFor(secondUserId));
  return { owner, secondUserId, connections };
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
  };
}

interface CorpusConnections {
  readonly embed: UserConnectionRow;
  readonly text: UserConnectionRow;
}

interface CapturedCookieAuth {
  readonly auth: CorpusWire["auth"];
  readonly identity: Awaited<ReturnType<typeof captureCorpusCookieIdentity>>;
  readonly cookie: string;
  readonly loginBuckets: Awaited<ReturnType<typeof seedLoginBuckets>>["buckets"];
  readonly secrets: readonly string[];
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
    readonly ownerStats: Awaited<ReturnType<typeof seedStats>>;
    readonly secondUserStats: Awaited<ReturnType<typeof seedStats>>;
    readonly loginBuckets: CapturedCookieAuth["loginBuckets"];
  };
  readonly auth: CorpusWire["auth"];
  readonly reads: CorpusWire["reads"];
}

/** Configure explicit physical corpus models through real owner admission; no runtime/role resolver is replaced. */
export async function seedCorpusConnections(root: ServerHarness, principal: Principal): Promise<CorpusConnections> {
  const embed = await seedUserConnection(root.db, root.services.connection.create, {
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_EMBED_MODEL,
    allowBackground: true,
    declared: { kind: "embedding", embedding: { dims: CORPUS_EMBEDDING_VECTOR.length, maxInputTokens: 8192 }, features: { detectServer: false } },
  });
  const text = await seedUserConnection(root.db, root.services.connection.create, {
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { input: ["text", "image"], context: { window: 32_000 }, output: { structured: true } },
      features: { detectServer: false, structuredMode: "guided-decoding" },
    },
  });
  await seedConnectionBinding(root.db, root.services.connection.setBinding, { principal, task: "embed", connectionId: embed.id });
  await seedConnectionBinding(root.db, root.services.connection.setBinding, { principal, task: "chat", connectionId: text.id });
  await seedConnectionBinding(root.db, root.services.connection.setBinding, { principal, task: "summarize", connectionId: text.id });
  await root.services.connection.setBinding({ principal, task: "imageEmbed", connectionId: null });
  return { embed, text };
}

/** Uses the caller's graph; raw execution and its lifetime remain owned by the actual server harness. */
export async function seedSyntheticCorpus(root: ServerHarness, options: SeedSyntheticCorpusOptions): Promise<SyntheticCorpus> {
  const owner = await root.principalFor(root.ownerId);
  await seedDefaultPreset({ db: root.db, now: root.clock.now });
  await seedThemes({ db: root.db, now: root.clock.now });
  const seedLedger = await seedUserContentLedger(root.db, seedUserContent, { seeder: root.app.contentSeeder, owner });

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

  const { auth, loginBuckets, secrets } = await captureCookieAuth(root, owner, options.ownerPassword);
  await root.settleBackground();
  const ownerStats = await seedStats(root.db, root.services.stats.reconcile, root.ownerId);
  const secondUserStats = await seedStats(root.db, root.services.stats.reconcile, seed.secondUserId);
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

/** Capture the actual HTTP cookie path for Node corpus readers. */
export async function captureCookieAuth(root: ServerHarness, viewer: Principal, password: string): Promise<CapturedCookieAuth> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.admin.resetPassword({ userId: viewer.userId, password });
  const anonymousConfigResponse = await root.http.request("/api/auth/config");
  if (!anonymousConfigResponse.ok) {
    throw new Error(`synthetic corpus auth-config request failed (${anonymousConfigResponse.status})`);
  }
  const anonymousConfig = authConfigSchema.parse(await anonymousConfigResponse.json());
  if (anonymousConfig.mode !== "local") {
    throw new Error("synthetic corpus cookie capture requires the actual local-auth server configuration");
  }
  const anonymousMeResponse = await root.http.request("/api/auth/me");
  if (!anonymousMeResponse.ok) {
    throw new Error(`synthetic corpus anonymous identity request failed (${anonymousMeResponse.status})`);
  }
  const anonymousMe = authMeSchema.parse(await anonymousMeResponse.json());
  if (anonymousMe.authenticated) {
    throw new Error("synthetic corpus anonymous identity request unexpectedly admitted a principal");
  }
  const { response: login, buckets: loginBuckets } = await seedLoginBuckets(root.db, root.http.request, [
    "/api/auth/login",
    {
      method: "POST",
      headers: { [CSRF_HEADER]: "1", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ handle: viewer.handle, password }),
    },
  ]);
  if (!login.ok) {
    throw new Error(`synthetic corpus viewer login failed (${login.status})`);
  }
  await login.arrayBuffer();
  const cookie = login.headers
    .getSetCookie()
    .map((line) => line.split(";", 1).join(""))
    .join("; ");
  if (cookie === "") {
    throw new Error("synthetic corpus viewer login returned no session cookie");
  }
  const signedInMeResponse = await root.http.request("/api/auth/me", { headers: { cookie } });
  if (!signedInMeResponse.ok) {
    throw new Error(`synthetic corpus signed-in identity request failed (${signedInMeResponse.status})`);
  }
  const signedInMe = authMeSchema.parse(await signedInMeResponse.json());
  if (!signedInMe.authenticated || signedInMe.handle !== viewer.handle || signedInMe.role !== viewer.role) {
    throw new Error("synthetic corpus login cookie did not admit the actual seeded viewer");
  }
  const signedInConfigResponse = await root.http.request("/api/auth/config", { headers: { cookie } });
  if (!signedInConfigResponse.ok) {
    throw new Error(`synthetic corpus signed-in auth-config request failed (${signedInConfigResponse.status})`);
  }
  const signedInConfig = authConfigSchema.parse(await signedInConfigResponse.json());
  return {
    auth: { anonymousConfig, anonymousMe, signedInConfig, signedInMe },
    identity: await captureCorpusCookieIdentity(root, viewer, cookie),
    cookie,
    loginBuckets,
    secrets: [password, cookie, readSessionCookie(new Headers({ cookie }), "http")].filter((value) => value !== null),
  };
}

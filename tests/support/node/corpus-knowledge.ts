// Public jobs produce knowledge; only owner-admitted bulk cooccurrence spans owners.
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_MEMORY_DEFAULTS } from "@orb/contracts/settings";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedCorpusRefinery } from "./corpus-refinery.ts";
import type { SeededRecallCorpus } from "./corpus-seed.ts";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import {
  captureCharacterDistillations,
  captureDuplicateCharacterPairs,
  captureDuplicateChatPairs,
  captureKeywordCooccurrence,
  captureThemeRows,
} from "./factories/discovery.ts";
import { captureChatMemoryRows } from "./factories/embedding-generation.ts";
import type { ServerTestHarness } from "./server.ts";

type CorpusCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

/** Physical model prose only; the real memory parser and discovery math own every derived field. */
export function corpusKnowledgeText(requestBody: string): string {
  if (requestBody.includes("Shared keywords:")) {
    return "Orbital ledger";
  }
  if (requestBody.includes("Transcript block:")) {
    return requestBody.includes("Funding memory scene 0:")
      ? "The orbital loom\nThe keeper preserves the ledger beside the loom.\nKeywords: loom, orbit"
      : "The harbor witness\nThe keeper finds the missing tool beside the harbor.\nKeywords: harbor, tool";
  }
  return "The keeper preserves the ledger and remembers its witnesses.";
}

export interface CapturedKnowledgeReads {
  readonly home: Awaited<ReturnType<CorpusCaller["discovery"]["home"]>>;
  readonly browse: Awaited<ReturnType<CorpusCaller["discovery"]["browseCharacters"]>>;
  readonly catalog: Awaited<ReturnType<CorpusCaller["discovery"]["catalog"]>>;
  readonly facets: Awaited<ReturnType<CorpusCaller["discovery"]["characterFacets"]>>;
  readonly duplicateCharacters: Awaited<ReturnType<CorpusCaller["discovery"]["duplicateCharacters"]>>;
  readonly duplicateChats: Awaited<ReturnType<CorpusCaller["discovery"]["duplicateChats"]>>;
  readonly archetypes: Awaited<ReturnType<CorpusCaller["discovery"]["archetypes"]>>;
  readonly projection: Awaited<ReturnType<CorpusCaller["discovery"]["corpusProjection"]>>;
  readonly graph: Awaited<ReturnType<CorpusCaller["discovery"]["similarityGraph"]>>;
  readonly similarChats: Awaited<ReturnType<CorpusCaller["discovery"]["similarChats"]>>;
  readonly comparison: Awaited<ReturnType<CorpusCaller["discovery"]["compareCharacters"]>>;
  readonly deepComparison: Awaited<ReturnType<CorpusCaller["discovery"]["compareCharactersDeep"]>>;
  readonly dossier: Awaited<ReturnType<CorpusCaller["discovery"]["characterDossier"]>>;
  readonly unused: Awaited<ReturnType<CorpusCaller["discovery"]["unusedCharacters"]>>;
  readonly gems: Awaited<ReturnType<CorpusCaller["discovery"]["forgottenGems"]>>;
  readonly routing: Awaited<ReturnType<CorpusCaller["discovery"]["modelRouting"]>>;
  readonly swipes: Awaited<ReturnType<CorpusCaller["discovery"]["swipeHotspots"]>>;
  readonly topKeywords: Awaited<ReturnType<CorpusCaller["discovery"]["topKeywords"]>>;
  readonly defaultTopKeywords: Awaited<ReturnType<CorpusCaller["discovery"]["topKeywords"]>>;
  readonly themeDrift: Awaited<ReturnType<CorpusCaller["discovery"]["themeDrift"]>>;
  readonly themeDetails: readonly Awaited<ReturnType<CorpusCaller["discovery"]["themeDetail"]>>[];
  readonly cooccurring: readonly Awaited<ReturnType<CorpusCaller["discovery"]["cooccurringKeywords"]>>[];
  readonly profiles: readonly Awaited<ReturnType<CorpusCaller["discovery"]["characterKeywords"]>>[];
  readonly answers: readonly Awaited<ReturnType<CorpusCaller["discovery"]["askCard"]>>[];
  readonly imageDuplicates: Awaited<ReturnType<CorpusCaller["discovery"]["imageDuplicates"]>>;
  readonly visualArchetypes: Awaited<ReturnType<CorpusCaller["discovery"]["visualArchetypes"]>>;
  readonly portraitAlignment: Awaited<ReturnType<CorpusCaller["discovery"]["portraitAlignment"]>>;
  readonly imageFacets: Awaited<ReturnType<CorpusCaller["discovery"]["imageFacets"]>>;
  readonly imageFacetMembers: Awaited<ReturnType<CorpusCaller["discovery"]["charactersByImageFacet"]>>;
}

export interface SeededCorpusKnowledge {
  readonly sourceChatId: SeededRecallCorpus["chatId"];
  readonly history: readonly Awaited<ReturnType<CorpusCaller["chat"]["commitMessage"]>>[];
  readonly memory: Awaited<ReturnType<typeof captureChatMemoryRows>>;
  readonly refinery: Awaited<ReturnType<typeof seedCorpusRefinery>>;
  readonly comparisonCard: Awaited<ReturnType<CorpusCaller["character"]["create"]>>;
  readonly fork: Awaited<ReturnType<CorpusCaller["chat"]["forkChat"]>>;
  readonly indexJobs: Awaited<ReturnType<CorpusCaller["workloads"]["list"]>>;
  readonly memoryJobs: Awaited<ReturnType<CorpusCaller["workloads"]["list"]>>;
  readonly jobs: Awaited<ReturnType<CorpusCaller["workloads"]["list"]>>;
  readonly summaries: Awaited<ReturnType<typeof captureCharacterDistillations>>;
  readonly duplicateCharacters: Awaited<ReturnType<typeof captureDuplicateCharacterPairs>>;
  readonly duplicateChats: Awaited<ReturnType<typeof captureDuplicateChatPairs>>;
  readonly keywords: Awaited<ReturnType<typeof captureKeywordCooccurrence>>;
  readonly themes: Awaited<ReturnType<typeof captureThemeRows>>;
  readonly reads: CapturedKnowledgeReads;
}

/** Existing recall contributes real canon and memory; actual queue rows retain their admitted scopes. */
export async function seedCorpusKnowledge(root: ServerTestHarness, recall: SeededRecallCorpus): Promise<SeededCorpusKnowledge> {
  const caller = await root.internalCallerFor(root.ownerId);
  const refinery = await seedCorpusRefinery(root);
  const comparisonCard = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "corpus-knowledge",
      name: "Harbor witness",
      description: "A harbor witness finds the keeper's missing orbital tool.",
    }),
  });
  const history: Awaited<ReturnType<CorpusCaller["chat"]["commitMessage"]>>[] = [];
  for (let scene = 0; scene < DEFAULT_MEMORY_DEFAULTS.blockSize; scene += 1) {
    history.push(
      await caller.chat.commitMessage({
        chatId: recall.chatId,
        timeZone: UTC_TIME_ZONE,
        content: `Harbor witness scene ${scene}: The keeper finds the missing orbital tool beside the harbor.`,
      }),
    );
  }
  const fork = await caller.chat.forkChat({ chatId: recall.chatId, title: "Ledger fork" });
  const indexJobs = await settleCorpusWorkloads(root, caller, [
    await caller.workloads.start({ input: { kind: "index", params: { source: "text" } }, mode: "singular" }),
  ]);
  const memoryJobs = await settleCorpusWorkloads(root, caller, [
    await caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
  ]);
  const memory = await captureChatMemoryRows(root.db, recall.chatId);
  const jobs = await settleCorpusWorkloads(root, caller, [
    await caller.workloads.start({ input: { kind: "distill-characters", params: {} }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "find-duplicates", params: {} }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "compute-cooccurrence", params: {} }, mode: "bulk" }),
    await caller.workloads.start({ input: { kind: "compute-themes", params: { k: 1 } }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "csls", params: {} }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "refine-score-sweep", params: {} }, mode: "singular" }),
  ]);
  const [summaries, duplicateCharacters, duplicateChats, keywords, themes] = await Promise.all([
    captureCharacterDistillations(root.db, { ownerId: root.ownerId }),
    captureDuplicateCharacterPairs(root.db, root.ownerId),
    captureDuplicateChatPairs(root.db, root.ownerId),
    captureKeywordCooccurrence(root.db, root.ownerId),
    captureThemeRows(root.db, root.ownerId),
  ]);
  const home = await caller.discovery.home();
  const reads: CapturedKnowledgeReads = {
    home,
    browse: await caller.discovery.browseCharacters({ sort: "name", limit: 2 }),
    catalog: await caller.discovery.catalog(),
    facets: await caller.discovery.characterFacets(),
    duplicateCharacters: await caller.discovery.duplicateCharacters(),
    duplicateChats: await caller.discovery.duplicateChats(),
    archetypes: await caller.discovery.archetypes({ k: 1 }),
    projection: await caller.discovery.corpusProjection(),
    graph: await caller.discovery.similarityGraph(),
    similarChats: await caller.discovery.similarChats({ chatId: recall.chatId }),
    comparison: await caller.discovery.compareCharacters({ idA: refinery.character.id, idB: comparisonCard.id }),
    deepComparison: await caller.discovery.compareCharactersDeep({ idA: refinery.character.id, idB: comparisonCard.id }),
    dossier: await caller.discovery.characterDossier({ characterId: refinery.character.id }),
    unused: await caller.discovery.unusedCharacters(),
    gems: await caller.discovery.forgottenGems(),
    routing: await caller.discovery.modelRouting(),
    swipes: await caller.discovery.swipeHotspots({ chatId: recall.chatId }),
    topKeywords: await caller.discovery.topKeywords({ minCount: 1 }),
    defaultTopKeywords: await caller.discovery.topKeywords(),
    themeDrift: await caller.discovery.themeDrift(),
    themeDetails: await Promise.all(
      [...home.sceneThemes, ...home.arcThemes].map(({ clusterIdx, level }) => caller.discovery.themeDetail({ clusterIdx, level })),
    ),
    cooccurring: await Promise.all(keywords.pairs.map(({ keywordA }) => caller.discovery.cooccurringKeywords({ keyword: keywordA }))),
    profiles: await Promise.all(
      [...new Set(keywords.profiles.map(({ characterId }) => characterId))].map((characterId) => caller.discovery.characterKeywords({ characterId })),
    ),
    answers: await Promise.all(
      [...new Set(recall.memory.digests.map(({ scopedCharacterId }) => scopedCharacterId))].map((characterId) =>
        caller.discovery.askCard({ characterId, question: "Which ledger did this character remember?" }),
      ),
    ),
    imageDuplicates: await caller.discovery.imageDuplicates(),
    visualArchetypes: await caller.discovery.visualArchetypes(),
    portraitAlignment: await caller.discovery.portraitAlignment(),
    imageFacets: await caller.discovery.imageFacets(),
    imageFacetMembers: await caller.discovery.charactersByImageFacet({ facet: "artStyle", value: "illustration" }),
  };
  return {
    sourceChatId: recall.chatId,
    history,
    memory,
    refinery,
    comparisonCard,
    fork,
    indexJobs,
    memoryJobs,
    jobs,
    summaries,
    duplicateCharacters,
    duplicateChats,
    keywords,
    themes,
    reads,
  };
}

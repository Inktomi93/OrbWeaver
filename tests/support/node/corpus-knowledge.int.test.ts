// @subject tests/support/node/corpus-knowledge.ts
// @subject tests/support/node/factories/discovery.ts
import { assertReferentialIntegrity } from "@orb/db";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusConnections, seedRecallCorpus } from "@orb/testkit/node/corpus-seed.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { corpusKnowledgeText, seedCorpusKnowledge } from "./corpus-knowledge.ts";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import { captureDuplicateCharacterPairs, captureDuplicateChatPairs, captureKeywordCooccurrence, captureThemeRows } from "./factories/discovery.ts";

function physicalScript(replies: ReadonlyMap<string, string> = CORPUS_STRUCTURED_REPLIES): ReturnType<typeof createCorpusProviderExecution> {
  return createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: corpusKnowledgeText,
    structuredReplies: replies,
    images: [],
    usage: { promptTokens: 40, completionTokens: 15 },
  });
}

async function prepareKnowledge(root: ServerTestHarness): Promise<Awaited<ReturnType<typeof seedCorpusKnowledge>>> {
  const connections = await seedCorpusConnections(root, await root.principalFor(root.ownerId));
  const recall = await seedRecallCorpus(root, {
    chatConnectionId: connections.text.id,
    summarizeConnectionId: connections.text.id,
    embedConnectionId: connections.embed.id,
  });
  return await seedCorpusKnowledge(root, recall);
}

test("public jobs retain owned and owner-admitted bulk scopes while producing discovery rollups from real lineage", async () => {
  const physical = physicalScript();
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const result = await prepareKnowledge(root);
  expect(result.memoryJobs).toMatchObject([{ kind: "memory-backfill", ownerId: root.ownerId, mode: "singular", status: "succeeded" }]);
  expect(new Set(result.memory.digests.map((digest) => digest.contentHash)).size).toBeGreaterThan(1);
  expect(result.jobs).toHaveLength(6);
  expect(result.jobs.every((job) => job.status === "succeeded")).toBe(true);
  expect(result.jobs.find((job) => job.kind === "compute-cooccurrence")).toMatchObject({ ownerId: null, mode: "bulk" });
  expect(result.jobs.filter((job) => job.kind !== "compute-cooccurrence").every((job) => job.ownerId === root.ownerId && job.mode === "singular")).toBe(true);
  expect(result.summaries.map((row) => row.characterId)).toContain(result.comparisonCard.id);
  expect(result.summaries.map((row) => row.characterId)).toContain(result.refinery.character.id);
  expect(result.duplicateCharacters.length).toBeGreaterThan(0);
  expect(result.duplicateChats.filter((row) => row.relation === "forked").map(({ chatIdA, chatIdB }) => [chatIdA, chatIdB].sort())).toContainEqual(
    [result.sourceChatId, result.fork.chat.id].sort(),
  );
  expect(result.keywords.pairs.length).toBeGreaterThan(0);
  expect(result.keywords.profiles.length).toBeGreaterThan(0);
  expect(result.keywords.pairs.every((row) => row.ownerId === root.ownerId)).toBe(true);
  expect(result.themes.clusters.length).toBeGreaterThan(0);
  expect(result.themes.assignments.length).toBeGreaterThan(0);
  expect(result.themes.assignments.every((row) => row.msgMidAt !== null)).toBe(true);
  expect(result.reads.themeDetails.map((detail) => detail?.id)).toEqual(
    [...result.reads.home.sceneThemes, ...result.reads.home.arcThemes].map((theme) => theme.id),
  );
  expect(result.reads.catalog.totalDistilled).toBe(result.summaries.length);
  expect(result.reads.projection.map((point) => point.characterId)).toContain(result.comparisonCard.id);
  expect(result.reads.archetypes.flatMap((group) => group.members.map((member) => member.characterId))).toContain(result.comparisonCard.id);
  expect(result.reads.comparison).toMatchObject({ a: { characterId: result.refinery.character.id }, b: { characterId: result.comparisonCard.id } });
  expect(result.reads.deepComparison?.narrative.degraded).toBe(false);
  expect(result.reads.dossier?.characterId).toBe(result.refinery.character.id);
  expect(result.reads.cooccurring.flat().length).toBeGreaterThan(0);
  expect(result.reads.profiles.flat().length).toBeGreaterThan(0);
  expect(result.reads.answers.some((answer) => answer !== null && answer.sampledMessages > 0 && !answer.degraded)).toBe(true);
  for (const pair of result.duplicateCharacters) {
    expect(result.reads.duplicateCharacters.find((view) => view.id === pair.id)).toMatchObject({
      characterIdA: pair.characterIdA,
      characterIdB: pair.characterIdB,
      similarity: pair.similarity,
      cslsScore: pair.cslsScore,
      computedAt: pair.computedAt,
    });
  }
  for (const pair of result.duplicateChats) {
    expect(result.reads.duplicateChats.find((view) => view.id === pair.id)).toMatchObject({
      chatIdA: pair.chatIdA,
      chatIdB: pair.chatIdB,
      relation: pair.relation,
      similarity: pair.similarity,
    });
  }
  expect(result.reads.facets).toEqual({ genres: result.reads.catalog.genres, tones: result.reads.catalog.tones });
  expect(result.reads.catalog.topTags).toContainEqual(expect.objectContaining({ tag: "loom" }));
  expect(result.reads.graph.nodes).toContainEqual(expect.objectContaining({ characterId: result.comparisonCard.id, name: result.comparisonCard.name }));
  expect(result.reads.graph.edges.some((edge) => edge.source === result.comparisonCard.id || edge.target === result.comparisonCard.id)).toBe(true);
  expect(result.reads.similarChats).toContainEqual(expect.objectContaining({ chatId: result.fork.chat.id }));
  expect(result.reads.unused).toContainEqual({ characterId: result.comparisonCard.id, name: result.comparisonCard.name, avatarHash: null });
  const economics = await root.services.stats.characterEconomics(root.ownerId);
  expect(result.reads.gems.some((gem) => gem.messageCount > 0)).toBe(true);
  for (const gem of result.reads.gems) {
    const accounted = economics.find((row) => row.characterId === gem.characterId);
    expect(gem).toMatchObject({
      tokensOut: accounted?.tokensOut ?? null,
      tokensOutProvenance: accounted?.tokensOutProvenance ?? "unrecorded",
      costUsd: accounted?.costUsd ?? null,
    });
  }
  expect(result.reads.routing).toContainEqual(expect.objectContaining({ genre: "science-fiction", model: CORPUS_TEXT_MODEL, tokensOutProvenance: "measured" }));
  expect(result.reads.topKeywords.some((word) => result.keywords.profiles.some((profile) => profile.keyword === word.keyword))).toBe(true);
  expect(
    result.reads.themeDrift.some((bucket) => bucket.themes.some((theme) => result.themes.clusters.some((row) => row.clusterIdx === theme.clusterIdx))),
  ).toBe(true);
  for (const detail of result.reads.themeDetails) {
    expect(detail?.sources.some((source) => result.memory.digests.some((row) => row.id === source.source.rowId))).toBe(true);
    expect(detail?.members.some((member) => member.count > 0)).toBe(true);
  }
  expect(result.reads.browse.nextCursor).not.toBeNull();
  const caller = await root.internalCallerFor(root.ownerId);
  const next = await caller.discovery.browseCharacters({ sort: "name", limit: 2, cursor: result.reads.browse.nextCursor });
  expect(next.totalCount).toBe(result.reads.browse.totalCount);
  expect(next.items.map((item) => item.characterId).some((id) => result.reads.browse.items.some((item) => item.characterId === id))).toBe(false);
  await assertReferentialIntegrity(root.db);
}, 15_000);

test("empty public job inputs preserve exact no-digests/no-embeddings/no-cards outcomes rather than manufacturing rollups", async () => {
  const physical = physicalScript();
  await using root = await createServerHarness({ providerFetch: physical.execute });
  await seedCorpusConnections(root, await root.principalFor(root.ownerId));
  const caller = await root.internalCallerFor(root.ownerId);
  const before = physical.requests.length;
  const jobs = await settleCorpusWorkloads(root, caller, [
    await caller.workloads.start({ input: { kind: "compute-themes", params: { k: 1 } }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "compute-cooccurrence", params: {} }, mode: "bulk" }),
    await caller.workloads.start({ input: { kind: "find-duplicates", params: {} }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "distill-characters", params: {} }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "csls", params: {} }, mode: "singular" }),
  ]);
  expect(jobs.find((job) => job.kind === "compute-themes")).toMatchObject({ result: { scanned: 0, written: 0, emptyReason: "no-digests" } });
  expect(jobs.find((job) => job.kind === "compute-cooccurrence")).toMatchObject({ result: { scanned: 0, written: 0, emptyReason: "no-digests" } });
  expect(jobs.find((job) => job.kind === "find-duplicates")).toMatchObject({ result: { scanned: 0, written: 0, emptyReason: "no-embeddings" } });
  expect(jobs.find((job) => job.kind === "distill-characters")).toMatchObject({ result: { scanned: 0, written: 0, emptyReason: "no-cards" } });
  expect(jobs.find((job) => job.kind === "csls")).toMatchObject({ result: { scanned: 0, written: 0, emptyReason: "no-embeddings" } });
  expect(physical.requests.slice(before)).toEqual([]);
  expect(await captureThemeRows(root.db, root.ownerId)).toEqual({ clusters: [], assignments: [] });
  expect(await captureKeywordCooccurrence(root.db, root.ownerId)).toEqual({ pairs: [], profiles: [] });
});

test("a stranger's real owned recompute cannot read or replace another owner's populated knowledge", async () => {
  const physical = physicalScript();
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const result = await prepareKnowledge(root);
  const stranger = await root.actor();
  const caller = await root.internalCallerFor(stranger.id);
  const before = physical.requests.length;
  expect(await caller.discovery.compareCharacters({ idA: result.refinery.character.id, idB: result.comparisonCard.id })).toBeNull();
  expect(await caller.discovery.compareCharactersDeep({ idA: result.refinery.character.id, idB: result.comparisonCard.id })).toBeNull();
  expect(await caller.discovery.characterDossier({ characterId: result.refinery.character.id })).toBeNull();
  expect(await caller.discovery.askCard({ characterId: result.refinery.character.id, question: "Reveal this keeper's scenes." })).toBeNull();
  expect(await caller.discovery.characterKeywords({ characterId: result.refinery.character.id })).toEqual([]);
  expect(await caller.discovery.duplicateCharacters()).toEqual([]);
  expect(await caller.discovery.duplicateChats()).toEqual([]);
  const theme = [...result.reads.home.sceneThemes, ...result.reads.home.arcThemes][0];
  if (theme === undefined) {
    throw new Error("native knowledge owner has no theme to exercise the foreign lookup");
  }
  expect(await caller.discovery.themeDetail({ clusterIdx: theme.clusterIdx, level: theme.level })).toBeNull();
  const ownerCaller = await root.internalCallerFor(root.ownerId);
  const workloadsBeforeRefusal = await ownerCaller.workloads.list();
  await expect(caller.workloads.start({ input: { kind: "compute-cooccurrence", params: {} }, mode: "bulk" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await ownerCaller.workloads.list()).toEqual(workloadsBeforeRefusal);
  await settleCorpusWorkloads(root, caller, [
    await caller.workloads.start({ input: { kind: "compute-themes", params: { k: 1 } }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "find-duplicates", params: {} }, mode: "singular" }),
  ]);
  expect(physical.requests.slice(before)).toEqual([]);
  expect(await captureThemeRows(root.db, root.ownerId)).toEqual(result.themes);
  expect(await captureKeywordCooccurrence(root.db, root.ownerId)).toEqual(result.keywords);
  expect(await captureDuplicateCharacterPairs(root.db, root.ownerId)).toEqual(result.duplicateCharacters);
  expect(await captureDuplicateChatPairs(root.db, root.ownerId)).toEqual(result.duplicateChats);
}, 15_000);

test("structured narrative degradation and a genuine failed naming job preserve honest outputs and previous cluster rows", async () => {
  const replies = new Map(CORPUS_STRUCTURED_REPLIES);
  const physical = physicalScript(replies);
  let refuseNames = false;
  const providerFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (
      refuseNames &&
      request.method === "POST" &&
      new URL(request.url).pathname === "/v1/chat/completions" &&
      (await request.clone().text()).includes("Shared keywords:")
    ) {
      return new Response('{"error":{"message":"corpus naming request refused","type":"invalid_request_error","code":"invalid_request"}}', {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    return await physical.execute(request);
  };
  await using root = await createServerHarness({ providerFetch });
  const result = await prepareKnowledge(root);
  const caller = await root.internalCallerFor(root.ownerId);
  replies.set("comparison_narrative", "unusable comparison reply");
  const degraded = await caller.discovery.compareCharactersDeep({ idA: result.refinery.character.id, idB: result.comparisonCard.id });
  expect(degraded?.narrative).toEqual({ summary: "unusable comparison reply", overlap: "", distinction: "", degraded: true });
  replies.set("card_answer", "unusable answer reply");
  expect(await caller.discovery.askCard({ characterId: result.refinery.character.id, question: "What did the keeper remember?" })).toMatchObject({
    answer: "unusable answer reply",
    grounded: false,
    degraded: true,
  });
  refuseNames = true;
  const failed = await caller.workloads.start({ input: { kind: "compute-themes", params: { k: 1 } }, mode: "singular" });
  await expect(settleCorpusWorkloads(root, caller, [failed])).rejects.toThrow("synthetic recall corpus workload failed");
  expect((await caller.workloads.list()).find((job) => job.id === failed.id)).toMatchObject({ status: "failed", result: null });
  expect(await captureThemeRows(root.db, root.ownerId)).toEqual(result.themes);
}, 15_000);

// @subject tests/support/node/corpus-seed.ts
// @subject tests/support/node/corpus-provider.ts
// @subject tooling/src/seed/ops/demo.ts
// @subject tooling/src/seed/ops/demo-library-arms.ts

import { healthResponseSchema } from "@orb/contracts/diagnostics";
import { SEED_MANIFEST } from "@orb/default-content";
import { NoConnectionError } from "@orb/inference";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { hydrateCorpusWire, parseCorpusWire, serializeCorpusWire } from "@orb/testkit/iso/corpus.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusActors, seedCorpusConnections, seedRecallCorpus, seedSyntheticCorpus } from "@orb/testkit/node/corpus-seed.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

const OWNER_PASSWORD = "synthetic-corpus-owner-password";

function corpusExecution(): ReturnType<typeof createCorpusProviderExecution> {
  return createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller repairs the orbital loom and prepares the next splice.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    usage: { promptTokens: 40, completionTokens: 15 },
  });
}

test("the sole corpus seed retains actual turns, ingestion, library FKs and cookie-admitted wire outputs", async () => {
  const wire = corpusExecution();
  await expect(wire.execute("https://unconfigured.invalid/v1/models")).rejects.toThrow("unscripted corpus provider origin");
  await using root = await createServerHarness({ providerFetch: wire.execute, authConfig: { ...authConfigFromEnv(), mode: "local" } });
  const { secondUserId } = await seedCorpusActors(root);
  const corpus = await seedSyntheticCorpus(root, { ownerPassword: OWNER_PASSWORD, log: () => undefined });
  const response = await root.http.request("/healthz");
  expect(response.status).toBe(200);
  const health = healthResponseSchema.parse(await response.json());
  const portable = hydrateCorpusWire({ ...corpus, health });
  expect(portable.auth).toEqual(corpus.auth);
  expect(portable.reads).toEqual(corpus.reads);
  expect(portable.health).toEqual(health);
  const published = serializeCorpusWire(portable, corpus.secrets);
  expect(parseCorpusWire(published)).toEqual(portable);
  expect(Object.hasOwn(parseCorpusWire(published), "secrets")).toBe(false);
  expect(() => parseCorpusWire(published.replace(/^\{/u, '{"privateCaptures":{},'))).toThrow("Unrecognized key");
  expect(() =>
    serializeCorpusWire(
      {
        ...portable,
        reads: {
          ...portable.reads,
          "character.list": portable.reads["character.list"].map(({ output }) => ({ input: {}, output })),
        },
      },
      corpus.secrets,
    ),
  ).toThrow("Corpus request does not match its publication recipe");
  expect(() =>
    serializeCorpusWire(
      {
        ...portable,
        reads: {
          ...portable.reads,
          "databank.get": portable.reads["databank.get"].map(({ input, output }) => ({ input: { ...input, includeText: false }, output })),
        },
      },
      corpus.secrets,
    ),
  ).toThrow("Corpus request does not match its publication recipe");
  expect("rows" in portable).toBe(false);
  expect("seed" in portable).toBe(false);
  expect(JSON.stringify(portable)).not.toContain(OWNER_PASSWORD);
  expect(corpus.seed.secondUserId).toBe(secondUserId);
  expect(corpus.auth.anonymousMe.authenticated).toBe(false);
  expect(corpus.auth.signedInMe.authenticated).toBe(true);
  expect(corpus.auth.anonymousConfig.mode).toBe("local");
  expect(corpus.auth.signedInConfig.mode).toBe("local");
  expect(corpus.seed.soloTurn?.aborted).toBe(false);
  expect(corpus.seed.groupTurn?.aborted).toBe(false);
  expect(corpus.rows.soloMessages.map(({ slot, variant }) => [slot.id, slot.selectedVariantId, variant.id])).toEqual(
    corpus.seed.soloTurn?.messages.map((message) => [message.id, message.selectedVariantId, message.selectedVariantId]),
  );
  expect(corpus.rows.groupMessages.map(({ slot, variant }) => [slot.id, slot.selectedVariantId, variant.id])).toEqual(
    corpus.seed.groupTurn?.messages.map((message) => [message.id, message.selectedVariantId, message.selectedVariantId]),
  );
  expect(corpus.rows.soloMessages.length).toBeGreaterThan(0);
  expect(corpus.rows.groupMessages.length).toBeGreaterThan(0);
  expect(corpus.seed.ingest.failed).toEqual([]);
  expect(corpus.rows.documentChunks.every((row) => row.documentId === corpus.seed.document.document.id)).toBe(true);
  expect(corpus.rows.documentChunks.map((row) => Array.from(row.embedding))).toEqual(corpus.rows.documentChunks.map(() => [...CORPUS_EMBEDDING_VECTOR]));
  expect(corpus.rows.worldInfo.book.id).toBe(corpus.seed.worldBook?.id);
  expect(corpus.rows.worldInfo.entries.map((row) => row.id).toSorted()).toEqual(corpus.seed.worldEntries.map((entry) => entry.id).toSorted());
  expect(corpus.rows.worldInfo.chat.map((row) => row.chatId)).toEqual([corpus.seed.group?.chat.id]);
  expect(corpus.rows.worldInfo.character).toEqual([]);
  expect(corpus.rows.regex.scripts.map((row) => row.id).toSorted()).toEqual(
    [
      corpus.seed.regexTiers?.findReplace.id,
      corpus.seed.regexTiers?.displayOnly.id,
      corpus.seed.regexTiers?.promptOnly.id,
      corpus.seed.presetRegex.id,
    ].toSorted((left, right) => String(left).localeCompare(String(right))),
  );
  expect(corpus.rows.regex.scripts.find((row) => row.id === corpus.seed.presetRegex.id)?.enabled).toBe(false);
  expect(corpus.rows.regex.preset.map((row) => [row.presetId, row.regexScriptId])).toEqual([[corpus.seed.preset.id, corpus.seed.presetRegex.id]]);
  expect(corpus.rows.rosters.presets.map((row) => row.id).toSorted()).toEqual(corpus.seed.rosters.map((roster) => roster.id).toSorted());
  for (const roster of corpus.seed.rosters) {
    expect(corpus.rows.rosters.members.filter((row) => row.presetId === roster.id)).toHaveLength(roster.members.length);
    expect(corpus.rows.rosters.rules.filter((row) => row.presetId === roster.id)).toHaveLength(roster.rules.length);
  }
  const characterKeys = SEED_MANIFEST.filter((item) => item.kind === "character").map((item) => item.key);
  expect(corpus.rows.seedLedger.map((row) => row.itemKey)).toEqual(expect.arrayContaining(characterKeys));
  expect(corpus.rows.seedLedger.every((row) => row.userId === root.ownerId)).toBe(true);
  expect(corpus.rows.ownerStats.models.some((row) => row.model === CORPUS_TEXT_MODEL && row.tokensOut > 0)).toBe(true);
  expect(corpus.rows.ownerStats.owner.ownerId).toBe(root.ownerId);
  expect(corpus.rows.secondUserStats.owner.ownerId).toBe(secondUserId);
  expect(corpus.rows.secondUserStats.models).toEqual([]);
  expect(corpus.reads["chat.getChat"].map((capture) => capture.input.chatId)).toEqual([corpus.seed.solo?.chat.id, corpus.seed.group?.chat.id]);
  expect(corpus.reads["character.count"].map((capture) => capture.output)).toEqual([corpus.reads["character.list"][0]?.output.totalCount]);
  expect(corpus.reads["chat.countChats"].map((capture) => capture.output)).toEqual([corpus.reads["chat.listChats"][0]?.output.totalCount]);
  expect(corpus.reads["databank.list"].flatMap((capture) => capture.output.items.map((document) => document.id))).toContain(corpus.seed.document.document.id);
  expect(corpus.reads["databank.bankHealth"].map((capture) => capture.output.chunks)).toEqual([corpus.rows.documentChunks.length]);
  expect(wire.requests).toContain("POST /v1/chat/completions");
  expect(wire.requests).toContain("POST /v1/embeddings");
});

test("a real missing chat binding refuses corpus generation rather than certifying greeting-only success", async () => {
  const wire = corpusExecution();
  await using root = await createServerHarness({ providerFetch: wire.execute, authConfig: { ...authConfigFromEnv(), mode: "local" } });
  const { owner } = await seedCorpusActors(root);
  await root.services.connection.setBinding({ principal: owner, task: "chat", connectionId: null });
  await expect(seedSyntheticCorpus(root, { ownerPassword: OWNER_PASSWORD, log: () => undefined })).rejects.toBeInstanceOf(NoConnectionError);
});

test("the shared recall preparation captures genuine memory rows and fresh nonempty owner traces", async () => {
  const wire = corpusExecution();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal: owner, partial: { privateEndpointAllowlist: ["127.0.0.1"] } });
  const connections = await seedCorpusConnections(root, owner);
  const recall = await seedRecallCorpus(root, {
    chatConnectionId: connections.text.id,
    embedConnectionId: connections.embed.id,
    summarizeConnectionId: connections.text.id,
  });
  expect(recall.historyTurn.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  const historySpeaker = recall.historyTurn.messages.find((message) => message.role === "assistant")?.characterId;
  if (historySpeaker === undefined || historySpeaker === null) {
    throw new Error("the actual corpus history turn produced no character speaker");
  }
  expect(recall.first.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(recall.recalled.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(recall.recalled.messages.find((message) => message.role === "assistant")?.contextBoundaryMessageId).not.toBeNull();
  expect(recall.jobs.map((job) => job.kind).toSorted()).toEqual(["databank-reindex", "index", "memory-backfill"]);
  expect(recall.jobs.every((job) => job.status === "succeeded")).toBe(true);
  expect(recall.memory.segments.length).toBeGreaterThan(0);
  expect(recall.memory.digests.length).toBeGreaterThan(0);
  expect(recall.memory.segments.every((row) => row.chatId === recall.chatId && row.contentHash.length > 0)).toBe(true);
  expect(recall.memory.digests.every((row) => row.chatId === recall.chatId)).toBe(true);
  expect(recall.memory.speakers.some((row) => row.characterId === historySpeaker)).toBe(true);
  expect(recall.memory.speakers.every((row) => recall.memory.digests.some((digest) => digest.id === row.digestId))).toBe(true);
  expect(recall.traces.some((trace) => trace.queryEmbedded && trace.poolSize > 0)).toBe(true);
  const lastEncoder = wire.requests.lastIndexOf("POST /v1/embeddings");
  expect(lastEncoder).toBeGreaterThan(-1);
  expect(wire.requests.slice(lastEncoder + 1)).toContain("POST /v1/chat/completions");
});

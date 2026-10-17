// @subject tests/support/node/corpus-refinery.ts
// @subject tests/support/node/factories/refinery.ts
import "@orb/testkit/node/composed-real.ts";
import { forgeDesignEnvelopeSchema, REFINERY_FORGE_ARMS, REFINERY_STAGES } from "@orb/contracts/refinery";
import { assertReferentialIntegrity } from "@orb/db";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusConnections } from "@orb/testkit/node/corpus-seed.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { seedCorpusRefinery } from "./corpus-refinery.ts";

function physicalScript(): ReturnType<typeof createCorpusProviderExecution> {
  return createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The keeper preserves the orbital ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
}

test("the refinery corpus retains real fixed/manual run lineage and reviewed copy/apply outcomes", async () => {
  const physical = physicalScript();
  await using root = await createServerHarness({ providerFetch: physical.execute });
  await seedCorpusConnections(root, await root.principalFor(root.ownerId));
  const result = await seedCorpusRefinery(root);
  expect(result.session.originalCard.description).toBe(result.character.description);
  expect(result.preflight.stages.map((stage) => stage.stage)).toEqual(REFINERY_STAGES);
  expect(result.score).toMatchObject({
    sessionId: result.session.id,
    stage: "score",
    model: CORPUS_TEXT_MODEL,
    sourceRunId: null,
    strippedKeys: ["inventedDirective"],
  });
  expect(result.rewrite.sourceRunId).toBe(result.score.id);
  expect(result.analyze.sourceRunId).toBe(result.rewrite.id);
  expect(result.iteration.rewrite.sourceRunId).toBe(result.analyze.id);
  expect(result.iteration.analyze.sourceRunId).toBe(result.iteration.rewrite.id);
  expect(result.iteration.iterationCount).toBe(1);
  expect(result.manual).toMatchObject({
    model: null,
    promptTokens: null,
    outputTokens: null,
    durationMs: 0,
    payloadConfig: { kind: "manual" },
    sourceRunId: result.iteration.analyze.id,
  });
  expect(result.operateBack.sourceRunId).toBe(result.rewrite.id);
  expect(result.review.rewriteDecisions[result.rewrite.id]).toEqual([true]);
  expect(result.runs.map((run) => run.id)).toEqual([
    result.score.id,
    result.rewrite.id,
    result.analyze.id,
    result.iteration.rewrite.id,
    result.iteration.analyze.id,
    result.manual.id,
    result.operateBack.id,
  ]);
  expect(result.dropped).toMatchObject({ applied: [], dropped: [{ field: "scenario", reason: "not_in_rewrite" }], snapshotId: null });
  expect(result.copy.character?.id).not.toBe(result.character.id);
  expect(result.copy.applied).toEqual([{ field: "description", kind: "replaced" }]);
  expect(result.applied.snapshotId).not.toBeNull();
  expect(result.applied.character).toMatchObject({ id: result.character.id, description: "A careful keeper records the orbital witnesses in a ledger." });
  expect(result.sessions.find((session) => session.id === result.session.id)).toMatchObject({
    status: "completed",
    iterationCount: 1,
    latestVerdict: "ACCEPT",
  });
  await assertReferentialIntegrity(root.db);
});

test("custom modeled runs pin actual schema versions and remain readable after the real schema is deleted", async () => {
  const physical = physicalScript();
  await using root = await createServerHarness({ providerFetch: physical.execute });
  await seedCorpusConnections(root, await root.principalFor(root.ownerId));
  const result = await seedCorpusRefinery(root);
  expect(result.forged.kind).toBe("draft");
  expect(result.schema.version).toBe(1);
  expect(result.revisedSchema.version).toBe(2);
  expect(result.customFirst.payloadConfig).toEqual({
    kind: "custom",
    schemaId: result.schema.id,
    schemaVersion: result.schema.version,
    schema: result.schema.schema,
  });
  expect(result.customSecond.payloadConfig).toEqual({
    kind: "custom",
    schemaId: result.schema.id,
    schemaVersion: result.revisedSchema.version,
    schema: result.revisedSchema.schema,
  });
  expect(result.schemaPlan).toMatchObject({ outcome: "sends", model: CORPUS_TEXT_MODEL });
  expect(result.drill).toEqual({ overallScore: 8, notes: "The keeper preserves the ledger's character." });
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.refinery.deleteSchema({ schemaId: result.schema.id });
  expect(await caller.refinery.listRuns({ sessionId: result.customSession.id })).toEqual(result.customRuns);
  const before = [...physical.requests];
  await expect(caller.refinery.runStage({ sessionId: result.customSession.id, stage: "score" })).rejects.toThrow();
  expect(physical.requests).toEqual(before);
});

test("foreign session access and out-of-order or completed operations refuse before model work or new ledger rows", async () => {
  const physical = physicalScript();
  await using root = await createServerHarness({ providerFetch: physical.execute });
  await seedCorpusConnections(root, await root.principalFor(root.ownerId));
  const result = await seedCorpusRefinery(root);
  const owner = await root.internalCallerFor(root.ownerId);
  const stranger = await root.actor();
  const foreign = await root.internalCallerFor(stranger.id);
  const empty = await owner.refinery.startSession({ characterId: result.character.id });
  const before = [...physical.requests];
  await expect(foreign.refinery.getSession({ sessionId: result.session.id })).rejects.toThrow();
  await expect(foreign.refinery.runStage({ sessionId: result.session.id, stage: "score" })).rejects.toThrow();
  await expect(owner.refinery.runStage({ sessionId: empty.id, stage: "analyze" })).rejects.toThrow();
  await expect(
    owner.refinery.applyFields({ sessionId: result.session.id, rewriteRunId: result.manual.id, accepts: [{ field: "description" }] }),
  ).rejects.toThrow();
  expect(physical.requests).toEqual(before);
  expect(await owner.refinery.listRuns({ sessionId: result.session.id })).toEqual(result.runs);
  expect(await owner.refinery.listRuns({ sessionId: empty.id })).toEqual([]);
});

test("all native forge arms produce owner-belted drafts while needs-raw and malformed replies remain honest outcomes without persistence", async () => {
  const replies = new Map(CORPUS_STRUCTURED_REPLIES);
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The keeper preserves the orbital ledger.",
    structuredReplies: replies,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  await seedCorpusConnections(root, await root.principalFor(root.ownerId));
  const caller = await root.internalCallerFor(root.ownerId);
  for (const arm of REFINERY_FORGE_ARMS) {
    const draft = await caller.refinery.generateSchema({ stage: "score", description: "Explain the keeper's score.", arm });
    expect(draft.kind).toBe("draft");
  }
  const raw = replies.get("refinery_schema_design");
  if (raw === undefined) {
    throw new Error("the physical script has no refinery design response");
  }
  const design = forgeDesignEnvelopeSchema.parse(JSON.parse(raw));
  replies.set("refinery_schema_design", JSON.stringify({ ...design, needsRaw: true, needsRawReason: "A heterogeneous union is required." }));
  expect(await caller.refinery.generateSchema({ stage: "score", description: "Use a heterogeneous union.", arm: "single" })).toMatchObject({
    kind: "needs-raw",
  });
  replies.set("refinery_schema_design", "not a JSON design");
  const before = physical.requests.length;
  expect(await caller.refinery.generateSchema({ stage: "score", description: "Explain the keeper's score.", arm: "single" })).toMatchObject({
    kind: "failed",
    raw: "not a JSON design",
  });
  expect(physical.requests.length - before).toBe(2);
  expect(await caller.refinery.listSchemas()).toEqual([]);
});

test("the forge renders a final document refusal for the author without losing the raw draft or retrying the model", async () => {
  const replies = new Map(CORPUS_STRUCTURED_REPLIES);
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The keeper preserves the orbital ledger.",
    structuredReplies: replies,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  await seedCorpusConnections(root, await root.principalFor(root.ownerId));
  const caller = await root.internalCallerFor(root.ownerId);
  const draft = await caller.refinery.generateSchema({ stage: "score", description: "Explain the keeper's score.", arm: "single" });
  if (draft.kind !== "draft") {
    throw new Error("the physical design did not produce its positive-control draft", { cause: draft });
  }
  const raw = replies.get("refinery_schema_design");
  if (raw === undefined) {
    throw new Error("the physical script has no refinery design response");
  }
  const design = forgeDesignEnvelopeSchema.parse(JSON.parse(raw));
  replies.set("refinery_schema_design", JSON.stringify({ ...design, name: "not a valid identifier!!!" }));
  const before = physical.requests.length;
  expect(await caller.refinery.generateSchema({ stage: "score", description: "Explain the keeper's score.", arm: "single" })).toEqual({
    kind: "failed",
    message: "That design didn't pass the schema checks: ✖ name must match ^[a-zA-Z_][a-zA-Z0-9_]*$\n  → at name",
    raw: JSON.stringify(draft.schema, null, 2),
  });
  expect(physical.requests.length - before).toBe(1);
  expect(await caller.refinery.listSchemas()).toEqual([]);
});

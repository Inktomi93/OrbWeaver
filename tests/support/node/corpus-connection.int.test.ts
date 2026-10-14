// @subject tests/support/node/corpus-connection.ts
// @subject tests/support/node/corpus-connection-wire.ts
import "@orb/testkit/node/composed-real.ts";
import { randomBytes } from "node:crypto";
import { CONNECTION_OP_CODES, LOCAL_LIGHT_SEED_ROWS, ROUTABLE_TASKS } from "@orb/contracts/inference";
import { assertReferentialIntegrity } from "@orb/db";
import { seedCorpusConnection } from "./corpus-connection.ts";
import {
  CORPUS_CONNECTION_FOREIGN_KEY,
  CORPUS_CONNECTION_FOREIGN_MODEL,
  CORPUS_CONNECTION_HOSTED_KEY,
  CORPUS_CONNECTION_HOSTED_MODEL,
  CORPUS_CONNECTION_KEY,
  CORPUS_CONNECTION_MODEL,
  CORPUS_CONNECTION_REPLY,
  createCorpusConnectionWire,
} from "./corpus-connection-wire.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import { seedCorpusActors } from "./corpus-seed.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("native connection catalog, capability and account outputs retain real task identity while withholding actual private material", async () => {
  const wire = createCorpusConnectionWire();
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The ledger remains intact.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({
    secretBoxKey: randomBytes(32),
    providerFetch: wire.wrap(physical.execute),
    networkExecution: { fetch: wire.wrap(physical.execute), resolver: wire.resolver },
  });
  const actors = await seedCorpusActors(root);
  const result = await seedCorpusConnection(root, actors, wire);
  expect(result.own.view).toMatchObject({
    id: result.own.row.id,
    ownerId: root.ownerId,
    credentialId: result.own.credential.view.id,
    model: CORPUS_CONNECTION_MODEL,
  });
  expect(result.foreign.row.ownerId).toBe(actors.secondUserId);
  expect(result.list.some((row) => row.id === result.foreign.row.id)).toBe(false);
  expect(result.credentials.some((row) => row.id === result.foreign.credential.view.id)).toBe(false);
  expect(result.own.credential.row.ciphertext.length).toBeGreaterThan(0);
  expect(result.own.credential.row.iv.length).toBeGreaterThan(0);
  expect(result.own.credential.row.tag.length).toBeGreaterThan(0);
  const publicReads = {
    list: result.list,
    credentials: result.credentials,
    capabilities: {
      view: result.capabilities.view,
      repeated: result.capabilities.repeated,
      summary: result.capabilities.summary,
      chat: result.capabilities.chat,
      bindings: result.capabilities.bindings,
      updated: result.capabilities.updated,
      providers: result.capabilities.providers,
      preview: result.capabilities.preview,
    },
    catalogs: {
      rawDraft: result.catalogs.rawDraft,
      savedDraft: result.catalogs.savedDraft,
      saved: result.catalogs.saved,
      foreign: result.catalogs.foreign,
      builtin: result.catalogs.builtin,
      empty: result.catalogs.empty,
      failed: result.catalogs.failed,
      malformed: result.catalogs.malformed,
    },
    diagnostics: result.diagnostics,
    account: { credits: result.account.credits, catalog: result.account.catalog, cost: result.account.cost },
  };
  for (const key of [
    CORPUS_CONNECTION_KEY,
    CORPUS_CONNECTION_FOREIGN_KEY,
    CORPUS_CONNECTION_HOSTED_KEY,
    result.own.credential.row.ciphertext,
    result.own.credential.row.iv,
    result.own.credential.row.tag,
  ]) {
    expect(JSON.stringify(publicReads)).not.toContain(key);
  }
  expect(
    result.physical.some((request) => request.authorization === `Bearer ${CORPUS_CONNECTION_KEY}` && request.response.includes(CORPUS_CONNECTION_KEY)),
  ).toBe(true);
  expect(result.capabilities.summary).toMatchObject({
    task: "summarize",
    connectionId: result.own.row.id,
    providerId: "custom-openai",
    model: CORPUS_CONNECTION_MODEL,
  });
  expect(result.capabilities.chat).toMatchObject({
    task: "chat",
    connectionId: result.own.row.id,
    providerId: "custom-openai",
    model: CORPUS_CONNECTION_MODEL,
  });
  expect(result.capabilities.view.capability).toMatchObject({ kind: "generation", generation: { input: ["text"], context: { window: 32_768 } } });
  expect(result.capabilities.view.baseline).not.toEqual(result.capabilities.view.capability);
  expect(result.capabilities.repeated).toEqual(result.capabilities.view);
  expect(result.capabilities.snapshots.some((row) => typeof row.value === "string" && row.value.includes(CORPUS_CONNECTION_MODEL))).toBe(true);
  expect(result.capabilities.requestsAfterRepeated).toBe(result.capabilities.requestsAfterFirst);
  expect(result.capabilities.bindings.map((row) => row.task)).toEqual([...ROUTABLE_TASKS]);
  expect(result.capabilities.bindings.find((row) => row.task === "summarize")).toMatchObject({
    binding: { connectionId: result.own.row.id },
    resolved: { task: "summarize", connectionId: result.own.row.id },
    unavailableCause: null,
  });
  expect(result.capabilities.updated.label).toBe("Retained native connection witness");
  expect(result.capabilities.preview.reindex).toBe(false);
  expect(result.capabilities.requestsAfterPreview).toBe(result.capabilities.requestsBeforePreview);
  expect(result.capabilities.providers.some((row) => row.provider.id === "custom-openai" && row.available)).toBe(true);
  for (const listing of [result.catalogs.rawDraft, result.catalogs.savedDraft, result.catalogs.saved]) {
    expect(listing).toMatchObject({ listed: true, models: [{ id: CORPUS_CONNECTION_MODEL }] });
  }
  expect(result.catalogs.foreign).toMatchObject({ listed: true, models: [{ id: CORPUS_CONNECTION_FOREIGN_MODEL }] });
  expect(result.catalogs.afterRawDraft).toEqual(result.catalogs.beforeRawDraft);
  expect(result.catalogs.beforeRawDraft.connections.some((row) => row.id === result.own.row.id)).toBe(false);
  expect(result.catalogs.beforeRawDraft.credentials.some((row) => row.id === result.own.credential.view.id)).toBe(false);
  expect(result.catalogs.requestsAfterBuiltin).toBe(result.catalogs.requestsBeforeBuiltin);
  expect(result.catalogs.builtin).toMatchObject({
    listed: true,
    models: expect.arrayContaining(LOCAL_LIGHT_SEED_ROWS.map((row) => expect.objectContaining({ id: row.model }))),
  });
  expect(result.catalogs.empty).toMatchObject({ listed: false, reason: "the provider listed no models" });
  expect(result.catalogs.failed).toMatchObject({ listed: false, reason: expect.stringContaining("500") });
  expect(result.catalogs.malformed).toMatchObject({ listed: false });
  expect(result.catalogs.failed).not.toHaveProperty("models");
  expect(result.diagnostics.ok).toMatchObject({ ok: true, response: { status: 200 } });
  expect(result.diagnostics.failed).toMatchObject({ ok: false, response: { status: 500 } });
  expect(result.diagnostics.unavailable).toMatchObject({ ok: false, response: null, error: expect.stringContaining("unavailable") });
  expect(result.diagnostics.probe.status).toBe("ok");
  expect(result.diagnostics.throttled.status).toBe("throttled");
  expect(result.diagnostics.unreachable).toMatchObject({ status: "unreachable", httpStatus: 502 });
  expect(result.diagnostics.tokens).toEqual({ available: true, words: [{ ok: true, word: "ledger", ids: [41, 42], pieces: ["ledger", " tail"] }] });
  expect(result.diagnostics.repeatedTokens).toEqual(result.diagnostics.tokens);
  expect(result.diagnostics.requestsAfterRepeatedTokens).toBe(result.diagnostics.requestsBeforeRepeatedTokens);
  expect(result.diagnostics.malformedTokens).toMatchObject({ available: true, words: [{ ok: false, word: "malformed" }] });
  expect(result.diagnostics.unsupportedTokens).toEqual({ available: false, words: [] });
  expect(result.account.catalog).toMatchObject({
    listed: true,
    models: [
      { id: CORPUS_CONNECTION_HOSTED_MODEL, kind: "generation", promptPrice: 0.000_001, completionPrice: 0.000_002, cacheReadPrice: null },
      { kind: "embedding" },
      { kind: "rerank", promptPrice: null },
    ],
  });
  expect(result.account.refresh).toEqual({ models: 3 });
  expect(result.account.nullRefresh).toEqual({ models: null });
  expect(result.account.credits).toEqual({ total: 25, used: 4 });
  const assistant = result.account.turn.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("native account turn lost its delivered assistant");
  }
  expect(assistant.content).toBe(CORPUS_CONNECTION_REPLY);
  expect(assistant.connectionId).toBe(result.account.hosted.row.id);
  expect(assistant.generationId).not.toBeNull();
  expect(result.account.canon.find((row) => row.slot.id === assistant.id)?.variant).toMatchObject({
    connectionId: result.account.hosted.row.id,
    generationId: assistant.generationId,
    tokensIn: 5,
    tokensOut: 3,
  });
  expect(result.physical.some((request) => request.url.endsWith(`/generation?id=${assistant.generationId}`))).toBe(true);
  expect(result.account.cost).toEqual({ totalCost: 0.000_011, tokensPrompt: 5, tokensCompletion: 3 });
  expect(result.account.malformedCredits).toBeInstanceOf(Error);
  expect(result.account.malformedCost).toBeInstanceOf(Error);
  expect(result.account.afterMalformed).toEqual(result.account.beforeMalformed);
  expect(result.refusals.after).toEqual(result.refusals.before);
  expect(result.refusals.requestsAfter).toBe(result.refusals.requestsBefore);
  expect(result.refusals.errors.slice(0, 7)).toMatchObject(Array.from({ length: 7 }, () => ({ cause: { code: CONNECTION_OP_CODES.notFound } })));
  expect(result.refusals.errors[7]).toMatchObject({ cause: { code: CONNECTION_OP_CODES.credentialForeign } });
  expect(result.refusals.errors[8]).toMatchObject({ cause: { code: CONNECTION_OP_CODES.baseUrlInvalid } });
  expect(result.refusals.errors[9]).toMatchObject({ cause: { code: CONNECTION_OP_CODES.baseUrlShape } });
  expect(result.refusals.errors[10]).toMatchObject({ cause: { code: CONNECTION_OP_CODES.providerUnknown } });
  expect(result.refusals.errors[11]).toMatchObject({ cause: { code: CONNECTION_OP_CODES.baseUrlShape } });
  expect(result.refusals.errors.slice(12, 14).every((error) => error instanceof Error)).toBe(true);
  expect(result.refusals.errors[14]).toMatchObject({ cause: { code: CONNECTION_OP_CODES.backgroundRefused } });
  expect(result.refusals.errors[15]).toMatchObject({ cause: { code: CONNECTION_OP_CODES.taskUnservable } });
  expect(result.refusals.removed.find((row) => row.task === "summarize")).toMatchObject({
    binding: { connectionId: null },
    resolved: null,
    unavailableCause: "no-connection",
  });
  expect(wire.remaining()).toBe(0);
  await assertReferentialIntegrity(root.db);
});

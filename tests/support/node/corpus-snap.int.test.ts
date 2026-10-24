// @subject tests/support/node/corpus-recipe.ts
import { readFile } from "node:fs/promises";
import { contextFitAnswerSchema } from "@orb/contracts/chat";
import { localPath } from "@orb/db";
import { z } from "zod";
import { createCorpusHarness, loadCorpusFixture } from "./corpus.ts";
import { CORPUS_PROVIDER_ENDPOINT } from "./corpus-provider.ts";
import { createCorpusProviderTransport, prepareCorpusSnapFixture } from "./corpus-recipe.ts";
import { expect, test } from "./fixtures.ts";

test("native corpus stage clone reaches preview retrieval without changing its publication or other owners", { tags: "slow" }, async () => {
  const source = loadCorpusFixture();
  const database = localPath(source.layout.databaseUrl);
  if (database === undefined) {
    throw new Error("Corpus has no physical database");
  }
  const before = await readFile(database);
  await using prepared = await prepareCorpusSnapFixture();
  expect(prepared.fixture.replay?.idCursor).toBeGreaterThan(source.replay?.idCursor ?? 0);
  expect(prepared.fixture.replay?.nowMs).toBeGreaterThanOrEqual(source.replay?.nowMs ?? 0);
  expect(prepared.fixture.wire).toEqual(source.wire);
  const transport = createCorpusProviderTransport(prepared.provider.baseUrl);
  await using root = await createCorpusHarness(prepared.fixture.layout.root, {
    authConfig: { mode: "single-user" },
    providerFetch: transport.fetch,
    networkExecution: transport,
  });
  const principal = await root.principalFor(root.ownerId);
  const owned = await root.services.connection.list({ principal });
  expect(owned.some((connection) => connection.baseUrl === prepared.provider.baseUrl)).toBe(true);
  expect(owned.some((connection) => connection.baseUrl === CORPUS_PROVIDER_ENDPOINT)).toBe(false);
  const memberId = source.wire.memberIdentities?.sharedMember.viewer.userId;
  if (memberId === undefined) {
    throw new Error("Corpus has no shared member");
  }
  const member = await root.principalFor(memberId);
  const foreign = await root.services.connection.list({ principal: member });
  expect(foreign.some((connection) => connection.baseUrl === CORPUS_PROVIDER_ENDPOINT)).toBe(true);
  expect(foreign.some((connection) => connection.baseUrl === prepared.provider.baseUrl)).toBe(false);
  const chat = source.wire.reads["chat.listChats"][0]?.output.items.find((room) => room.title === "Getting started with Assistant");
  if (chat === undefined) {
    throw new Error("Corpus has no document-backed ledger room");
  }
  const requestCount = prepared.provider.requests.length;
  const listening = await root.listen();
  const response = await fetch(
    `http://${listening.address}:${listening.port}/api/trpc/chat.previewContextFit?input=${encodeURIComponent(JSON.stringify({ chatId: chat.id }))}`,
  );
  expect(response.status).toBe(200);
  const preview = z.object({ result: z.object({ data: contextFitAnswerSchema }) }).parse(await response.json()).result.data;
  expect(preview).not.toHaveProperty("unbound");
  expect(prepared.provider.requests.slice(requestCount)).toContain("POST /v1/embeddings");
  expect(await readFile(database)).toEqual(before);
});

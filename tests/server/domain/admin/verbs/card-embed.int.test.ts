// @subject packages/server/src/domain/admin/verbs/card-embed.ts
// @subject packages/server/src/domain/admin/verbs/embed.ts
// @subject packages/server/src/entry/compose/admin.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { auditLogs, characterEmbeddings, embeddingCalls } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import { expect } from "@orb/testkit/node";
import { createServerHarness, seedCharacter } from "@orb/testkit/node/composed";
import { TEST_BASE_URL, TEST_PROVIDER_ID } from "@orb/testkit/node/helpers";
import { eq } from "drizzle-orm";
import { FUNDING_KEY, FUNDING_MODEL, fundingConnection, test } from "../../embeddings/verbs/runtime-funding.fixtures.ts";

const REBOUND_MODEL = "admin-rebound-encoder";
const EMBED_ACTION = "admin.embedCharacterCard";

test("admin authority does not widen card ownership; foreign and synthetic refusals make no purchase or write", async ({
  fundingProvider,
  networkExecution,
  secretBoxKey,
}) => {
  await using root = await createServerHarness({
    startJobs: false,
    providerFetch: fundingProvider.fetch,
    networkExecution,
    secretBoxKey,
  });
  const cardOwner = await root.actor({ role: "admin" });
  const owner = await root.principalFor(cardOwner.id);
  const delegate = await root.actor({ role: "admin" });
  const ordinary = await root.actor();
  const { row: card } = await seedCharacter(root, {
    principal: owner,
    input: createCharacterSchema.parse({
      handle: "private-admin-card",
      name: "Private archivist",
      description: "The owner alone funds this private card prose.",
    }),
  });
  const { chat } = await root.services.chat.startChat({ principal: owner, characterIds: [card.id], opening: "none" });
  const synthetic = await root.services.character.mintSyntheticGroupCharacter({ ownerId: owner.userId, chatId: chat.id });
  const { row: ordinaryCard } = await seedCharacter(root, {
    principal: await root.principalFor(ordinary.id),
    input: createCharacterSchema.parse({ handle: "ordinary-card", name: "Ordinary archivist", description: "An ordinary account owns this card." }),
  });
  const caller = await root.internalCallerFor(cardOwner.id);
  const credential = await caller.credentials.add({ provider: TEST_PROVIDER_ID, key: FUNDING_KEY, metadata: { auth: "endpoint" } });
  const connection = await caller.connection.create({
    providerId: TEST_PROVIDER_ID,
    model: FUNDING_MODEL,
    credentialId: credential.id,
    baseUrl: TEST_BASE_URL,
    allowBackground: true,
    declared: { kind: "embedding", embedding: { dims: 3, input: ["text"] }, features: { detectServer: false } },
  });
  await caller.connection.setBinding({ task: "embed", connectionId: connection.id });
  const boxCaller = await root.internalCallerFor(root.ownerId);
  const boxConnection = await fundingConnection({ ownerCaller: boxCaller, harness: root, task: "embed" });
  await boxCaller.connection.setBinding({ task: "embed", connectionId: boxConnection.connectionId });
  await root.settleBackground();
  const beforeRequests = [...fundingProvider.requests];
  const beforeRefusalBodies = [...fundingProvider.requestBodies];
  const beforeAccounting = await root.db.select().from(embeddingCalls);
  const beforeVectors = await root.db.select().from(characterEmbeddings);

  await expect(
    root.services.admin.embedCharacterCard({ principal: await root.principalFor(ordinary.id), characterId: ordinaryCard.id }),
  ).rejects.toBeInstanceOf(DomainForbiddenError);
  await expect(root.services.admin.embedCharacterCard({ principal: await root.principalFor(delegate.id), characterId: card.id })).rejects.toBeInstanceOf(
    DomainNotFoundError,
  );
  await expect.soft(root.services.admin.embedCharacterCard({ principal: owner, characterId: ordinaryCard.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(root.services.admin.embedCharacterCard({ principal: owner, characterId: synthetic.characterId })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect
    .soft(root.services.admin.embedCharacterCard({ principal: await root.principalFor(root.ownerId), characterId: card.id }))
    .rejects.toBeInstanceOf(DomainNotFoundError);
  expect(fundingProvider.requestBodies).toEqual(beforeRefusalBodies);
  expect(fundingProvider.requests).toEqual(beforeRequests);
  expect(await root.db.select().from(embeddingCalls)).toEqual(beforeAccounting);
  expect(await root.db.select().from(characterEmbeddings)).toEqual(beforeVectors);
  expect(await root.db.select().from(auditLogs).where(eq(auditLogs.action, EMBED_ACTION))).toEqual([]);

  const text = await root.services.character.loadCardText(card.id);
  expect(text).toContain(card.description);
  const beforeBodies = fundingProvider.requestBodies.length;
  await root.services.admin.embedCharacterCard({ principal: owner, characterId: card.id });
  expect(fundingProvider.requestBodies.slice(beforeBodies).map((body) => JSON.parse(body))).toEqual([
    expect.objectContaining({ model: FUNDING_MODEL, input: [text] }),
  ]);
  expect(fundingProvider.authorizations.at(-1)).toBe(`Bearer ${FUNDING_KEY}`);
  expect(await root.db.select().from(characterEmbeddings)).toMatchObject([
    { characterId: card.id, model: FUNDING_MODEL, dim: 3, embedding: new Float32Array([1, 0, 0]) },
  ]);
  expect((await root.db.select().from(embeddingCalls)).slice(beforeAccounting.length)).toMatchObject([
    { ownerId: owner.userId, connectionId: connection.id, task: "embed", model: FUNDING_MODEL, outcome: "completed" },
  ]);
  expect(await root.db.select().from(auditLogs).where(eq(auditLogs.action, EMBED_ACTION))).toMatchObject([
    { actorUserId: owner.userId, entityId: card.id, entityType: "character" },
  ]);
});

test("the inline admin producer follows the owner's changed binding and persists the new encoder, then refuses an unbound task", async ({
  fundingProvider,
  networkExecution,
}) => {
  await using root = await createServerHarness({ startJobs: false, providerFetch: fundingProvider.fetch, networkExecution });
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const { row: card } = await seedCharacter(root, {
    principal,
    input: createCharacterSchema.parse({
      handle: "rebound-card",
      name: "Encoder archivist",
      description: "The same card must follow the owner's current encoder.",
    }),
  });
  await root.settleBackground();
  const first = await fundingConnection({ ownerCaller: caller, harness: root, task: "embed" });
  fundingProvider.embedding(REBOUND_MODEL, [0, 1, 0]);
  const second = await fundingConnection({ ownerCaller: caller, harness: root, task: "embed", model: REBOUND_MODEL });
  await caller.connection.setBinding({ task: "embed", connectionId: first.connectionId });
  await root.settleBackground();
  const text = await root.services.character.loadCardText(card.id);
  const params = { principal, characterId: card.id };
  const beforeFirst = fundingProvider.requestBodies.length;
  await root.services.admin.embedCharacterCard(params);
  expect(fundingProvider.requestBodies.slice(beforeFirst).map((body) => JSON.parse(body))).toEqual([
    expect.objectContaining({ model: FUNDING_MODEL, input: [text] }),
  ]);
  expect(await root.db.select().from(characterEmbeddings)).toMatchObject([
    { characterId: card.id, model: FUNDING_MODEL, dim: 3, embedding: new Float32Array([1, 0, 0]) },
  ]);

  await caller.connection.setBinding({ task: "embed", connectionId: second.connectionId });
  await root.settleBackground();
  const beforeSecond = fundingProvider.requestBodies.length;
  const beforeAccounting = await root.db.select().from(embeddingCalls);
  await root.services.admin.embedCharacterCard(params);
  expect(fundingProvider.requestBodies.slice(beforeSecond).map((body) => JSON.parse(body))).toEqual([
    expect.objectContaining({ model: REBOUND_MODEL, input: [text] }),
  ]);
  expect(await root.db.select().from(characterEmbeddings)).toMatchObject([
    { characterId: card.id, model: REBOUND_MODEL, dim: 3, embedding: new Float32Array([0, 1, 0]) },
  ]);
  expect((await root.db.select().from(embeddingCalls)).slice(beforeAccounting.length)).toMatchObject([
    { ownerId: principal.userId, connectionId: second.connectionId, task: "embed", model: REBOUND_MODEL, outcome: "completed" },
  ]);

  await caller.connection.setBinding({ task: "embed", connectionId: null });
  await root.settleBackground();
  const beforeRefusal = [...fundingProvider.requests];
  const settledAccounting = await root.db.select().from(embeddingCalls);
  const settledVectors = await root.db.select().from(characterEmbeddings);
  const settledAudit = await root.db.select().from(auditLogs).where(eq(auditLogs.action, EMBED_ACTION));
  expect(settledAudit.map((row) => ({ actorUserId: row.actorUserId, entityId: row.entityId }))).toEqual([
    { actorUserId: principal.userId, entityId: card.id },
    { actorUserId: principal.userId, entityId: card.id },
  ]);
  await expect(root.services.admin.embedCharacterCard(params)).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(fundingProvider.requests).toEqual(beforeRefusal);
  expect(await root.db.select().from(embeddingCalls)).toEqual(settledAccounting);
  expect(await root.db.select().from(characterEmbeddings)).toEqual(settledVectors);
  expect(await root.db.select().from(auditLogs).where(eq(auditLogs.action, EMBED_ACTION))).toEqual(settledAudit);
});

// @subject packages/server/src/domain/automation/persistence/rules.ts
// @subject packages/server/src/domain/search/persistence/cards.ts
// @subject packages/server/src/domain/search/persistence/digest-rows.ts
// @subject packages/server/src/domain/discovery/persistence/embed-store-reads.ts
import { readFile } from "node:fs/promises";
import { createCharacterSchema } from "@orb/contracts/character";
import type { CorpusSource } from "@orb/contracts/search";
import { automationRules, chatDigests, chatSegments, embedGenerations, embedGenerationTargets, embedSpaceState } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { jsonValueSchema } from "@orb/kit/json";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusConnections,
  seedRecallCorpus,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

function physicalProvider(): typeof fetch {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller preserves the ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  return async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname.endsWith("/embeddings") && request.method === "POST") {
      const body = jsonValueSchema.parse(await request.clone().json());
      if (body !== null && typeof body === "object" && !Array.isArray(body) && Array.isArray(body["messages"])) {
        return Response.json({ model: CORPUS_EMBED_MODEL, data: [{ index: 0, embedding: CORPUS_EMBEDDING_VECTOR }] });
      }
    }
    return await wire.execute(request);
  };
}

test("real global reorders remain owner-local and a room host orders every author's rules", async () => {
  await using harness = await createServerHarness();
  const owner = await harness.principalFor(harness.ownerId);
  const member = await harness.principalFor((await harness.actor()).id);
  const automation = harness.services.automation;
  const body = {
    chatId: null,
    timeZone: UTC_TIME_ZONE,
    trigger: { bus: "domain", type: "character.updated" },
    actions: [{ type: "set_variable", scope: "global", key: "orderMarker", op: "inc" }],
  } as const;
  const a = await automation.createRule({ ...body, principal: owner, name: "First owned rule" });
  const b = await automation.createRule({ ...body, principal: owner, name: "Second owned rule" });
  const foreign = await automation.createRule({ ...body, principal: member, name: "First foreign rule" });
  await automation.createRule({ ...body, principal: member, name: "Second foreign rule" });
  const before = await harness.db.select().from(automationRules);
  for (const orderedIds of [[a.id, a.id], [a.id], [a.id, foreign.id]]) {
    await expect(automation.reorderRules({ principal: owner, chatId: null, orderedIds })).rejects.toThrow();
    expect(await harness.db.select().from(automationRules)).toEqual(before);
  }
  await automation.reorderRules({ principal: owner, chatId: null, orderedIds: [b.id, a.id] });
  expect((await automation.listOwnerRules({ principal: owner })).map((rule) => [rule.id, rule.position])).toEqual([
    [b.id, 0],
    [a.id, 1],
  ]);
  expect(await harness.db.select().from(automationRules).where(eq(automationRules.ownerId, member.userId))).toEqual(
    before.filter((rule) => rule.ownerId === member.userId),
  );
  const room = await harness.services.chat.startChat({ principal: owner, characterIds: [], opening: "none" });
  const invitation = await harness.services.chat.createInvite({ principal: owner, chatId: room.chat.id, input: { invitedHandle: member.handle } });
  await harness.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  const roomA = await automation.createRule({ ...body, chatId: room.chat.id, principal: owner, name: "Previous host's room rule" });
  await harness.services.chat.nominateHostHandoff({ principal: owner, chatId: room.chat.id, userId: member.userId });
  await harness.services.chat.acceptHostHandoff({ principal: member, chatId: room.chat.id });
  const roomB = await automation.createRule({ ...body, chatId: room.chat.id, principal: member, name: "Current host's room rule" });
  await automation.reorderRules({ principal: member, chatId: room.chat.id, orderedIds: [roomB.id, roomA.id] });
  expect((await automation.listRules({ principal: member, chatId: room.chat.id })).map((rule) => [rule.id, rule.position])).toEqual([
    [roomB.id, 0],
    [roomA.id, 1],
  ]);
});

test("actual lexical fields and suggestions never index another owner's private terms", async () => {
  await using harness = await createServerHarness();
  const owner = await harness.principalFor(harness.ownerId);
  const member = await harness.principalFor((await harness.actor()).id);
  const owned = await harness.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Owned", handle: "owned", description: "silverloom" }),
  });
  await harness.services.character.create({
    principal: member,
    input: createCharacterSchema.parse({ name: "Foreign", handle: "foreign", description: "copperloom" }),
  });
  expect((await harness.services.search.fields({ ownerId: owner.userId, query: "silverloom", topN: 10 })).hits.map((hit) => hit.characterId)).toEqual([
    owned.id,
  ]);
  expect((await harness.services.search.fields({ ownerId: owner.userId, query: "copperloom", topN: 10 })).hits).toEqual([]);
  expect(await harness.services.search.suggest({ ownerId: owner.userId, query: "copper", limit: 10 })).toEqual([]);
  expect(await harness.services.search.suggest({ ownerId: member.userId, query: "copper", limit: 10 })).not.toEqual([]);
});

test("real owned avatar producers retain provenance; a labeled foreign metadata association cannot hide the authorized vectors", async () => {
  await using root = await createServerHarness({ providerFetch: physicalProvider() });
  const owner = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  const bytes = await readFile(new URL(import.meta.resolve("@orb/default-content/avatars/birdie.png")));
  for (const principal of [owner, member]) {
    const { embed } = await seedCorpusConnections(root, principal);
    await root.services.connection.update({
      principal,
      connectionId: embed.id,
      patch: {
        declared: {
          kind: "embedding",
          embedding: { dims: CORPUS_EMBEDDING_VECTOR.length, maxInputTokens: 8192, input: ["text", "image"] },
          features: { detectServer: false },
        },
      },
    });
    await root.services.connection.setBinding({ principal, task: "imageEmbed", connectionId: embed.id });
    for (const suffix of ["first", "second"]) {
      const avatar = await root.services.assets.store({ principal, kind: "avatar", mime: "image/png", bytes });
      await root.services.character.create({
        principal,
        input: createCharacterSchema.parse({ name: suffix, handle: suffix, description: "A genuine avatar-bearing card.", avatarAssetId: avatar.assetId }),
      });
      await root.app.embeddings.indexAsset(avatar.assetId, { force: true });
    }
    await root.app.embeddings.embedAssets({ ownerId: principal.userId, force: false, signal: new AbortController().signal });
    const rows = await root.services.discovery.visualArchetypes(principal.userId, 1);
    expect(rows.flatMap((row) => row.members)).toHaveLength(2);
    const stored = await root.db.select().from(embedGenerations).where(eq(embedGenerations.ownerId, principal.userId));
    for (const row of rows) {
      expect(stored.find((generation) => generation.id === row.generationId)?.fingerprint).toBe(row.fingerprint);
      expect(row.fingerprint).not.toBeNull();
    }
  }
  await root.settleBackground();
  const before = await root.services.discovery.visualArchetypes(owner.userId, 1);
  const generationId = before[0]?.generationId;
  if (generationId === undefined) {
    throw new Error("actual owned avatar generation is absent");
  }
  // Abuse-boundary input: deliberately contradict the producer's owner binding without inventing normal producer data.
  await root.db.update(embedGenerations).set({ ownerId: member.userId }).where(eq(embedGenerations.id, generationId));
  const after = await root.services.discovery.visualArchetypes(owner.userId, 1);
  expect(after.flatMap((row) => row.members)).toEqual(before.flatMap((row) => row.members));
  expect(after.map((row) => row.fingerprint)).toEqual([null]);
});

test("real host handoff into an unrecorded space preserves authorized sources without the prior owner's fingerprints", async () => {
  await using root = await createServerHarness({ providerFetch: physicalProvider() });
  const owner = await root.principalFor(root.ownerId);
  const connections = await seedCorpusConnections(root, owner);
  const corpus = await seedRecallCorpus(root, {
    chatConnectionId: connections.text.id,
    embedConnectionId: connections.embed.id,
    summarizeConnectionId: connections.text.id,
  });
  const query = { queryText: "ledger", mode: "mixB", minScore: 0 } as const;
  const sources = async (ownerId: UserId): Promise<CorpusSource[]> => {
    const corpusHits = await root.services.search.corpus({ ownerId, ...query });
    const discovered = await root.services.search.discover({ ownerId, queryText: query.queryText, topN: 10 });
    return [
      ...corpusHits.map((hit) => hit.source),
      ...discovered.standaloneSegments.map((hit) => hit.source),
      ...discovered.hits.flatMap((hit) => hit.segments.map((segment) => segment.source)),
    ];
  };
  const before = await sources(owner.userId);
  expect(new Set(before.map((source) => source.kind))).toEqual(new Set(["digest", "segment"]));
  const generations = await root.db.select().from(embedGenerations).where(eq(embedGenerations.ownerId, owner.userId));
  for (const source of before) {
    expect(generations.find((row) => row.id === source.generationId)?.fingerprint).toBe(source.fingerprint);
  }
  const member = await root.principalFor((await root.actor()).id);
  await seedCorpusConnections(root, member);
  expect(await root.db.select().from(embedGenerationTargets).where(eq(embedGenerationTargets.ownerId, member.userId))).toEqual([]);
  expect(await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, member.userId))).toEqual([]);
  const invitation = await root.services.chat.createInvite({ principal: owner, chatId: corpus.chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  await root.services.chat.nominateHostHandoff({
    principal: owner,
    chatId: corpus.chatId,
    userId: member.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
  await root.services.chat.acceptHostHandoff({ principal: member, chatId: corpus.chatId });
  const retained = {
    digests: await root.db.select().from(chatDigests).where(eq(chatDigests.chatId, corpus.chatId)),
    segments: await root.db.select().from(chatSegments).where(eq(chatSegments.chatId, corpus.chatId)),
  };
  expect(retained.digests.length).toBeGreaterThan(0);
  expect(retained.segments.length).toBeGreaterThan(0);
  expect(await root.db.select().from(embedGenerationTargets).where(eq(embedGenerationTargets.ownerId, member.userId))).toEqual([]);
  expect(await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, member.userId))).toEqual([]);
  const after = await sources(member.userId);
  expect(new Set(after.map((source) => source.kind))).toEqual(new Set(["digest", "segment"]));
  expect([...new Set(after.map((source) => `${source.kind}:${source.rowId}`))].toSorted()).toEqual(
    [...new Set(before.map((source) => `${source.kind}:${source.rowId}`))].toSorted(),
  );
  expect(after.map((source) => source.fingerprint)).toEqual(after.map(() => null));
  expect(await root.services.search.corpus({ ownerId: owner.userId, ...query })).toEqual([]);
});

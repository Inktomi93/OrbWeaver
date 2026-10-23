import { ENCODER_IDENTITY_NO_API, embedDimsOf, embedDtypeOf, embedSpaceOf, LOCAL_LIGHT_SEED_ROWS } from "@orb/contracts/inference";
import { SEED_MANIFEST } from "@orb/default-content";
import { supportsManagedCompaction } from "@orb/inference";
import { createResolveEmbeddingConnection, precomputedSeedEmbedding } from "@orb/server/domain/embeddings";
import { sha256Hex } from "@orb/server/primitives/content-hash";
import { makeGenerationCapability } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

test("connection admission and use-for-everything retain canonical API and funding decisions", async () => {
  await using root = await createServerHarness();
  const { services } = root;
  const ownerPrincipal = await root.principalFor(root.ownerId);
  const fields = {
    principal: ownerPrincipal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: "http://127.0.0.1:9999/v1",
    model: "owned-model",
    declared: { kind: "generation", features: { detectServer: false }, generation: makeGenerationCapability() },
  } as const;
  await expect(services.connection.create({ ...fields, api: "agent-sdk" })).rejects.toMatchObject({ code: "connection_api_incoherent" });
  const row = await services.connection.create(fields);
  expect((await services.connection.useForEverything({ principal: ownerPrincipal, connectionId: row.id })).map((binding) => binding.task)).toEqual(["chat"]);
  await services.connection.update({ principal: ownerPrincipal, connectionId: row.id, patch: { allowBackground: true } });
  expect((await services.connection.useForEverything({ principal: ownerPrincipal, connectionId: row.id })).map((binding) => binding.task)).toEqual([
    "chat",
    "summarize",
  ]);
});

test("runtime operation capabilities retain stateful chat and concrete embedding route behavior", async () => {
  await using root = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1) });
  const { app, services } = root;
  const ownerPrincipal = await root.principalFor(root.ownerId);
  const credential = await services.credentials.add({ principal: ownerPrincipal, provider: "claude-sub", key: "ownership-sdk-token" });
  const stateful = await services.connection.create({
    principal: ownerPrincipal,
    providerId: "claude-sub",
    credentialId: credential.id,
    baseUrl: null,
    model: "ownership-model",
  });
  const remote = await services.connection.create({
    principal: ownerPrincipal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: "http://127.0.0.1:9999/v1",
    model: "owned-encoder",
    allowBackground: true,
    declared: { kind: "embedding", embedding: { dims: 3 }, features: { detectServer: false, requestTimeoutMs: 4321 } },
  });
  const local = await services.connection.create({
    principal: ownerPrincipal,
    providerId: "local-light",
    credentialId: null,
    baseUrl: null,
    model: LOCAL_LIGHT_SEED_ROWS[0].model,
    allowBackground: true,
  });
  const resolved = (await app.runtime.resolve({ principal: ownerPrincipal, task: "chat", connectionId: stateful.id, cachedFacts: true })).resolved;
  expect(supportsManagedCompaction(resolved)).toBe(true);
  const snapshot = createResolveEmbeddingConnection(app.runtime, async () => ownerPrincipal);
  const remoteSnapshot = await snapshot(ownerPrincipal.userId, "embed", remote.id, { cachedFacts: true });
  const localSnapshot = await snapshot(ownerPrincipal.userId, "embed", local.id, { cachedFacts: true });
  expect(remoteSnapshot).toMatchObject({ api: ENCODER_IDENTITY_NO_API, wire: "openai-compat", execution: { widthProbeTimeoutMs: 4321, seedVectors: false } });
  expect(localSnapshot).toMatchObject({ api: ENCODER_IDENTITY_NO_API, wire: "local-light", execution: { widthProbeTimeoutMs: 600_000, seedVectors: true } });
  if (remoteSnapshot === null) {
    throw new Error("the saved encoder did not resolve");
  }
  expect(
    supportsManagedCompaction((await app.runtime.resolve({ principal: ownerPrincipal, task: "embed", connectionId: remote.id, cachedFacts: true })).resolved),
  ).toBe(false);
  const card = SEED_MANIFEST.find((item) => item.kind === "character");
  if (card === undefined || localSnapshot === null) {
    throw new Error("the shipped card and its local encoder must exist");
  }
  const characterId = await app.characterSeeder.seedCard(ownerPrincipal, card.handle);
  if (characterId === null) {
    throw new Error("the production seeder did not produce its shipped card");
  }
  const text = await services.character.loadCardText(characterId);
  if (text === null) {
    throw new Error("the seeded card has no embedding projection");
  }
  const hash = sha256Hex(text);
  const space = embedSpaceOf(localSnapshot.model, embedDtypeOf(localSnapshot.capability));
  const seeded = precomputedSeedEmbedding(hash, space, "card-text", localSnapshot);
  expect(seeded?.model).toBe(space);
  expect(seeded?.vector.length).toBe(embedDimsOf(localSnapshot.capability));
  expect(precomputedSeedEmbedding(hash, space, "card-text", remoteSnapshot)).toBeNull();
  expect(precomputedSeedEmbedding(sha256Hex(`${text} changed`), space, "card-text", localSnapshot)).toBeNull();
});

test("diagnostics resolve embedding rows under their canonical kind task", async () => {
  await using root = await createServerHarness({ providerFetch: () => Promise.resolve(Response.json({ data: [{ id: "owned-encoder" }] })) });
  const principal = await root.principalFor(root.ownerId);
  const row = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: "http://127.0.0.1:9999/v1",
    model: "owned-encoder",
    allowBackground: true,
    declared: { kind: "embedding", embedding: { dims: 3 }, features: { detectServer: false } },
  });
  expect(await root.services.connection.probe({ principal, connectionId: row.id })).toMatchObject({ status: "ok" });
});

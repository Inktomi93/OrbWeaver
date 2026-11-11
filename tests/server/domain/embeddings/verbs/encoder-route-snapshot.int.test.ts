// @subject packages/server/src/domain/embeddings/verbs/runtime-connection.ts
// @subject packages/server/src/domain/embeddings/substrate/seed-embedding.ts
// @subject packages/server/src/primitives/embedding-generation/binding.ts
import { BUILT_IN_EMBED_DIMS, ENCODER_IDENTITY_NO_API, embedDtypeOf, embedSpaceOf, LOCAL_LIGHT_SEED_ROWS, modelIdSchema } from "@orb/contracts/inference";
import { userConnections } from "@orb/db";
import { readSeedAvatar, SEED_MANIFEST } from "@orb/default-content";
import type { LocalLightModelCache } from "@orb/inference";
import { NoConnectionError, supportsManagedCompaction } from "@orb/inference";
import { createResolveEmbeddingConnection } from "@orb/server/domain/embeddings";
import { finiteReplies } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { CORPUS_PROVIDER_ENDPOINT, createCorpusProviderExecution, createServerHarness, SECRET_BOX_TEST_KEY, withheldTable } from "@orb/testkit/node/composed";

test("runtime operation capabilities retain stateful chat and concrete embedding route behavior", async () => {
  await using root = await createServerHarness({ secretBoxKey: SECRET_BOX_TEST_KEY });
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
  const remoteSnapshot = await snapshot(ownerPrincipal.userId, "embed", remote.id);
  const localSnapshot = await snapshot(ownerPrincipal.userId, "embed", local.id);
  expect(remoteSnapshot).toMatchObject({ api: ENCODER_IDENTITY_NO_API, wire: "openai-compat", execution: { widthProbeTimeoutMs: 4321, seedVectors: false } });
  expect(localSnapshot).toMatchObject({ api: ENCODER_IDENTITY_NO_API, wire: "local-light", execution: { widthProbeTimeoutMs: 600_000, seedVectors: true } });
  if (remoteSnapshot === null) {
    throw new Error("the saved encoder did not resolve");
  }
  expect(
    supportsManagedCompaction((await app.runtime.resolve({ principal: ownerPrincipal, task: "embed", connectionId: remote.id, cachedFacts: true })).resolved),
  ).toBe(false);
});

const unscripted = (): Promise<never> => Promise.reject(new Error("unscripted local-light model call"));

/** A local-light model edge that refuses every call, for a root whose case never encodes locally. */
function unscriptedLocalLight(): LocalLightModelCache {
  return { embedTexts: unscripted, scorePairs: unscripted, embedImages: unscripted, embedClipTexts: unscripted, preload: unscripted, loadFailed: () => false };
}

// The scripted endpoint records each request as `<method> <path>`; a POST is one model call.
const isSend = (request: string): boolean => request.startsWith("POST ");

/** A shipped avatar's bytes; the packaged vectors cover every shipped card's art. */
async function shippedAvatar(): Promise<{ readonly bytes: Uint8Array; readonly mime: string }> {
  const handle = SEED_MANIFEST.flatMap((item) => (item.kind === "character" ? [item.handle] : []))[0];
  const avatar = handle === undefined ? null : await readSeedAvatar(handle);
  if (avatar === null) {
    throw new Error("the shipped content carries no avatar");
  }
  return avatar;
}

test("a shipped avatar stored on the local-light image encoder takes its packaged vector, while other bytes reach the model", async () => {
  // One reply: the changed-bytes control spends it, and a seeded store that reached the model would overdraw the plan.
  using plan = finiteReplies("local-light image encode", [new Float32Array(BUILT_IN_EMBED_DIMS).fill(1)]);
  const encoded: number[] = [];
  const localLightCache: LocalLightModelCache = {
    embedTexts: unscripted,
    scorePairs: unscripted,
    embedImages: (_model, images) => {
      encoded.push(images.length);
      return Promise.resolve(images.map(() => plan.take()));
    },
    embedClipTexts: unscripted,
    preload: unscripted,
    loadFailed: () => false,
  };
  await using root = await createServerHarness({ localLightCache });
  const owner = await root.principalFor(root.ownerId);
  const local = await root.services.connection.create({
    principal: owner,
    providerId: "local-light",
    credentialId: null,
    baseUrl: null,
    model: LOCAL_LIGHT_SEED_ROWS[0].model,
    allowBackground: true,
  });
  await root.services.connection.setBinding({ principal: owner, task: "imageEmbed", connectionId: local.id });
  const avatar = await shippedAvatar();
  const { assetId } = await root.app.assets.store({ principal: owner, ...avatar, kind: "avatar" });
  await root.settleBackground();
  const generation = await root.app.embeddings.resolveGeneration(owner.userId, "imageEmbed");
  expect(encoded).toEqual([]);

  const seeded = await root.app.embeddings.store({
    lens: "image-raw",
    ownerId: owner.userId,
    assetId,
    content: avatar.bytes,
    model: generation.space,
    force: true,
  });
  expect(seeded).toMatchObject({ outcome: "written", model: generation.space });
  expect(encoded).toEqual([]);

  // One trailing byte changes the content hash, so no packaged vector matches it.
  const changed = new Uint8Array(avatar.bytes.length + 1);
  changed.set(avatar.bytes);
  const live = await root.app.embeddings.store({ lens: "image-raw", ownerId: owner.userId, assetId, content: changed, model: generation.space, force: true });
  expect(live).toMatchObject({ outcome: "written", model: generation.space });
  expect(encoded).toEqual([1]);
});

test("an endpoint encoder in the packaged vectors' own space embeds a shipped avatar live, because only local-light takes seeds", async () => {
  const model = modelIdSchema.parse(LOCAL_LIGHT_SEED_ROWS[0].model);
  const physical = createCorpusProviderExecution({
    modelIds: [model],
    embedding: () => new Array<number>(BUILT_IN_EMBED_DIMS).fill(1),
    chatText: "",
    structuredReplies: new Map(),
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: physical.execute, localLightCache: unscriptedLocalLight() });
  const owner = await root.principalFor(root.ownerId);
  const local = await root.services.connection.create({
    principal: owner,
    providerId: "local-light",
    credentialId: null,
    baseUrl: null,
    model,
    allowBackground: true,
  });
  const localSnapshot = await createResolveEmbeddingConnection(root.app.runtime, async () => owner)(owner.userId, "imageEmbed", local.id);
  if (localSnapshot === null) {
    throw new Error("the local-light encoder did not resolve");
  }
  const dtype = embedDtypeOf(localSnapshot.capability);
  const localSpace = embedSpaceOf(localSnapshot.model, dtype);
  // The same weights at the same precision over an endpoint: one space by design, so only the seed gate tells them apart.
  const endpoint = await root.services.connection.create({
    principal: owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model,
    allowBackground: true,
    declared: {
      kind: "embedding",
      embedding: { dims: BUILT_IN_EMBED_DIMS, maxInputTokens: 8192, input: ["text", "image"], ...(dtype === undefined ? {} : { dtype }) },
      features: { detectServer: false },
    },
  });
  await root.services.connection.setBinding({ principal: owner, task: "imageEmbed", connectionId: endpoint.id });
  const avatar = await shippedAvatar();
  const { assetId } = await root.app.assets.store({ principal: owner, ...avatar, kind: "avatar" });
  await root.settleBackground();
  const generation = await root.app.embeddings.resolveGeneration(owner.userId, "imageEmbed");
  expect(generation.space).toBe(localSpace);
  const sendsBefore = physical.requests.filter(isSend).length;

  const stored = await root.app.embeddings.store({
    lens: "image-raw",
    ownerId: owner.userId,
    assetId,
    content: avatar.bytes,
    model: generation.space,
    force: true,
  });
  // The row carries the tag the endpoint answered with, so the model call itself is the witness.
  expect(stored).toMatchObject({ outcome: "written", generationId: generation.id });
  expect(physical.requests.filter(isSend)).toHaveLength(sendsBefore + 1);
});

test("an explicit connection id that no longer resolves answers null, while the binding form refuses with no connection", async () => {
  await using root = await createServerHarness({ secretBoxKey: SECRET_BOX_TEST_KEY });
  const owner = await root.principalFor(root.ownerId);
  const resolveConnection = createResolveEmbeddingConnection(root.app.runtime, async () => owner);
  const encoder = await root.services.connection.create({
    principal: owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: "http://127.0.0.1:9999/v1",
    model: "owned-encoder",
    allowBackground: true,
    declared: { kind: "embedding", embedding: { dims: 3 }, features: { detectServer: false } },
  });
  expect(await resolveConnection(owner.userId, "embed", encoder.id)).toMatchObject({ connectionId: encoder.id });

  await root.services.connection.remove({ principal: owner, connectionId: encoder.id });

  expect(await resolveConnection(owner.userId, "embed", encoder.id)).toBeNull();
  await root.services.connection.setBinding({ principal: owner, task: "embed", connectionId: null });
  await expect(resolveConnection(owner.userId, "embed")).rejects.toBeInstanceOf(NoConnectionError);
});

test("an explicit connection id whose lookup fails for any reason but an unresolvable binding rethrows instead of answering null", async () => {
  await using root = await createServerHarness({ secretBoxKey: SECRET_BOX_TEST_KEY });
  const owner = await root.principalFor(root.ownerId);
  const resolveConnection = createResolveEmbeddingConnection(root.app.runtime, async () => owner);
  const encoder = await root.services.connection.create({
    principal: owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: "http://127.0.0.1:9999/v1",
    model: "owned-encoder",
    allowBackground: true,
    declared: { kind: "embedding", embedding: { dims: 3 }, features: { detectServer: false } },
  });
  expect(await resolveConnection(owner.userId, "embed", encoder.id)).toMatchObject({ connectionId: encoder.id });

  await using _fault = await withheldTable(root.db, userConnections);

  await expect(resolveConnection(owner.userId, "embed", encoder.id)).rejects.toMatchObject({
    cause: expect.objectContaining({ message: expect.stringContaining("no such table") }),
  });
});

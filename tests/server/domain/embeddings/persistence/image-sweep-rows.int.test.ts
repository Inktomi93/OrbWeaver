// Storage and spend are the subject: the bulk image catch-up sweep leaves one analysis and one captioned vector per avatar,
// records its owner's image space complete only when it finishes, resumes without paying twice, and quotes what it will spend.
// @subject packages/server/src/domain/embeddings/verbs/embed-assets.ts
// @subject packages/server/src/domain/embeddings/indexer/image.ts

import { rm } from "node:fs/promises";
import { embedGenerations, embedSpaceState, imageAnalyses, imageEmbeddings } from "@orb/db";
import { readSeedAvatar, SEED_MANIFEST } from "@orb/default-content";
import type { AssetId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  refuseWrites,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

const CAPTION_REQUEST = "POST /v1/chat/completions";

function imageProvider(): ReturnType<typeof createCorpusProviderExecution> {
  return createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller repairs the orbital loom.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
}

/** Every shipped character avatar the pack carries: real PNGs above the dimension floor, each with its own bytes. */
async function shippedAvatars(count: number): Promise<readonly { readonly bytes: Uint8Array; readonly mime: string }[]> {
  const handles = SEED_MANIFEST.flatMap((item) => (item.kind === "character" ? [item.handle] : []));
  const avatars = await Promise.all(handles.map((handle) => readSeedAvatar(handle)));
  const shipped = avatars.filter((avatar) => avatar !== null).slice(0, count);
  if (shipped.length < count) {
    throw new Error("the shipped content carries too few avatars for this case");
  }
  return shipped;
}

interface Sweepable {
  readonly root: ServerTestHarness;
  readonly wire: ReturnType<typeof createCorpusProviderExecution>;
  readonly owner: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly assetIds: readonly AssetId[];
  readonly captions: () => number;
  readonly posts: () => number;
}

/** A root holding `count` avatars the owner stored before any embedder existed, so none is indexed yet. */
async function unindexedAvatars(count: number, lifetime: AsyncDisposableStack): Promise<Sweepable> {
  const wire = imageProvider();
  const root = await createServerHarness({ providerFetch: wire.execute, startJobs: false });
  lifetime.defer(() => root[Symbol.asyncDispose]());
  const owner = await root.principalFor(root.ownerId);
  const assetIds: AssetId[] = [];
  for (const avatar of await shippedAvatars(count)) {
    assetIds.push((await root.app.assets.store({ principal: owner, ...avatar, kind: "avatar" })).assetId);
  }
  await root.settleBackground();
  await seedCorpusConnections(root, owner);
  const requests = (): readonly string[] => wire.requests.filter((request) => request.startsWith("POST "));
  return { root, wire, owner, assetIds, captions: () => requests().filter((request) => request === CAPTION_REQUEST).length, posts: () => requests().length };
}

const signal = (): AbortSignal => new AbortController().signal;

test("a sweep captions and embeds each avatar once, resumes at no cost, and force pays again for exactly what it quoted", async () => {
  await using lifetime = new AsyncDisposableStack();
  const room = await unindexedAvatars(2, lifetime);
  const { root, owner } = room;
  const embeddings = root.app.embeddings;
  expect(room.posts()).toBe(0);

  const quoted = await embeddings.countAssetAnalysisCalls({ ownerId: owner.userId, force: false });
  expect(quoted).toBe(2);
  expect(await embeddings.embedAssets({ ownerId: null, force: false, signal: signal() })).toEqual({ embedded: 2, skipped: 0 });
  // The quote is what the sweep spent: one caption per avatar.
  expect(room.captions()).toBe(quoted);
  expect(await root.db.select().from(imageAnalyses)).toHaveLength(2);
  expect((await root.db.select().from(imageEmbeddings)).map((row) => row.lens)).toEqual(["image-captioned", "image-captioned"]);
  expect(await embeddings.countAssetAnalysisCalls({ ownerId: owner.userId, force: false })).toBe(0);

  // Resumable: a rerun checks the stored hash before any caption or vector request leaves.
  const spent = room.posts();
  expect(await embeddings.embedAssets({ ownerId: null, force: false, signal: signal() })).toEqual({ embedded: 0, skipped: 2 });
  expect(room.posts()).toBe(spent);

  const forcedQuote = await embeddings.countAssetAnalysisCalls({ ownerId: owner.userId, force: true });
  expect(forcedQuote).toBe(2);
  expect(await embeddings.embedAssets({ ownerId: null, force: true, signal: signal() })).toEqual({ embedded: 2, skipped: 0 });
  expect(room.captions()).toBe(quoted + forcedQuote);
  // Still one row per avatar and lens, not a second copy.
  expect(await root.db.select().from(imageEmbeddings)).toHaveLength(2);
});

test("the sweep reports each position of the whole enumeration as it goes", async () => {
  await using lifetime = new AsyncDisposableStack();
  const { root } = await unindexedAvatars(2, lifetime);
  const positions: [number, number][] = [];

  await root.app.embeddings.embedAssets({ ownerId: null, force: false, signal: signal(), onProgress: (done, total) => positions.push([done, total]) });

  expect(positions).toEqual([
    [1, 2],
    [2, 2],
  ]);
});

test("a finished sweep records the image space it embedded into, and an aborted one records nothing", async () => {
  await using lifetime = new AsyncDisposableStack();
  const room = await unindexedAvatars(1, lifetime);
  const { root, owner } = room;
  const aborted = new AbortController();
  aborted.abort();

  // A completion written by a pass that did not finish would tell every later read a half-moved corpus is settled.
  expect(await root.app.embeddings.embedAssets({ ownerId: owner.userId, force: false, signal: aborted.signal })).toEqual({ embedded: 0, skipped: 0 });
  expect(room.posts()).toBe(0);
  expect(await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.scope, "images"))).toEqual([]);

  await root.app.embeddings.embedAssets({ ownerId: null, force: false, signal: signal() });
  const [state] = await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.scope, "images"));
  expect(state).toMatchObject({ ownerId: owner.userId });
  const [vector] = await root.db.select().from(imageEmbeddings);
  if (state?.activeGenerationId === null || state?.activeGenerationId === undefined) {
    throw new Error("the finished sweep must promote an active generation");
  }
  const [generation] = await root.db.select().from(embedGenerations).where(eq(embedGenerations.id, state.activeGenerationId));
  // The mark follows the space the vectors were written in, not a constant.
  expect(generation?.space).toBe(vector?.model);
});

test("an avatar already indexed by its own event still promotes its generation in a global catch-up, without a second spend", async () => {
  await using lifetime = new AsyncDisposableStack();
  const wire = imageProvider();
  const root = await createServerHarness({ providerFetch: wire.execute, startJobs: false });
  lifetime.defer(() => root[Symbol.asyncDispose]());
  const owner = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, owner);
  const [avatar] = await shippedAvatars(1);
  if (avatar === undefined) {
    throw new Error("the shipped content carries no avatar");
  }
  const stored = await root.app.assets.store({ principal: owner, ...avatar, kind: "avatar" });
  // The write-time indexer is the event path the catch-up must not repeat.
  await root.app.embeddings.indexAsset(stored.assetId);
  const indexed = (await root.db.select().from(imageEmbeddings)).length;
  expect(indexed).toBe(1);
  expect(await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.scope, "images"))).toEqual([]);
  const spent = wire.requests.length;

  expect(await root.app.embeddings.embedAssets({ ownerId: null, force: false, signal: signal() })).toEqual({ embedded: 0, skipped: 1 });
  expect(wire.requests).toHaveLength(spent);
  expect(await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.scope, "images"))).toEqual([expect.objectContaining({ ownerId: owner.userId })]);
});

test("an avatar whose stored file is gone fails alone: the rest embed and the run names the failed asset", async () => {
  await using lifetime = new AsyncDisposableStack();
  const { root, assetIds } = await unindexedAvatars(2, lifetime);
  const [vanished, kept] = assetIds;
  if (vanished === undefined || kept === undefined) {
    throw new Error("the case stores two avatars");
  }
  const ref = await root.services.assets.assetCasRefById(vanished);
  if (ref === undefined) {
    throw new Error("the stored avatar must have a CAS reference");
  }
  await rm(root.app.cas.blobPath(ref.ownerId, ref.hash));
  const positions: [number, number][] = [];

  const result = await root.app.embeddings.embedAssets({
    ownerId: null,
    force: false,
    signal: signal(),
    onProgress: (done, total) => positions.push([done, total]),
  });

  expect(result).toEqual({ embedded: 1, skipped: 0, failedAssets: [vanished] });
  expect(new Set((await root.db.select().from(imageEmbeddings)).map((row) => row.assetId))).toEqual(new Set([kept]));
  // The failed asset still counts as a visited position, so the progress bar reaches its denominator.
  expect(positions).toEqual([
    [1, 2],
    [2, 2],
  ]);
});

test("an avatar whose stored bytes are not a decodable image fails alone like a missing file, and the rest embed", async () => {
  await using lifetime = new AsyncDisposableStack();
  const { root, owner, assetIds } = await unindexedAvatars(1, lifetime);
  const [kept] = assetIds;
  if (kept === undefined) {
    throw new Error("the case stores one good avatar");
  }
  const corrupt = (await root.app.assets.store({ principal: owner, bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]), mime: "image/png", kind: "avatar" }))
    .assetId;

  const result = await root.app.embeddings.embedAssets({ ownerId: null, force: false, signal: signal() });

  expect(result).toEqual({ embedded: 1, skipped: 0, failedAssets: [corrupt] });
  expect(new Set((await root.db.select().from(imageEmbeddings)).map((row) => row.assetId))).toEqual(new Set([kept]));
});

test("a failure that is not a missing file stops the sweep instead of failing each asset", async () => {
  await using lifetime = new AsyncDisposableStack();
  const { root } = await unindexedAvatars(2, lifetime);
  await using fault = await refuseWrites(root.db, { table: imageEmbeddings, event: "INSERT", message: "the vector store refused the write" });

  await expect(root.app.embeddings.embedAssets({ ownerId: null, force: false, signal: signal() })).rejects.toThrow();

  // Positive control: with the fault lifted the same sweep embeds both avatars.
  await fault.lift();
  expect(await root.app.embeddings.embedAssets({ ownerId: null, force: false, signal: signal() })).toEqual({ embedded: 2, skipped: 0 });
});

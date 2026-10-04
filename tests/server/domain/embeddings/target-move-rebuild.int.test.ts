// Every move of an owner's embedding target, from any caller, owes that owner a full rebuild: the switch purges the
// old index, and only a forced sweep refills it. The lazy write path is the one no binding write sees: a re-point
// to a row whose key is revoked switches nothing, and the first write after the key is fixed does.

import type { Principal } from "@orb/contracts/identity";
import type { ProviderId } from "@orb/contracts/inference";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import type { EmbedResult } from "@orb/contracts/providers";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import { characterEmbeddings, userCredentials } from "@orb/db";
import type { Resolved } from "@orb/inference";
import { ProviderError } from "@orb/inference";
import { DomainNoCredentialError } from "@orb/kit/errors";
import type { CharacterId, UserConnectionId, UserCredentialId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService, createEmbeddingsWorkloadContributions } from "@orb/server/domain/embeddings";
import { logger } from "@orb/server/foundation/observability";
import { describe, vi } from "vitest";
import type { MemoryEmbedSpace } from "../../../../packages/server/src/domain/chat/contract/memory.ts";
import { createChatWorkloadContributions } from "../../../../packages/server/src/domain/chat/workload-contributions.ts";
import { createDatabankWorkloadContributions } from "../../../../packages/server/src/domain/databank/workload-contributions.ts";
import type { EmbeddingsContext } from "../../../../packages/server/src/domain/embeddings/context.ts";
import type { EmbeddingConnectionSnapshot, EmbeddingsService } from "../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { WIDTH_PROBE_TEXT } from "../../../../packages/server/src/domain/embeddings/substrate/generation.ts";
import { nearestCharacters } from "../../../../packages/server/src/domain/search/persistence/nearest.ts";
import { withActiveQuerySpace } from "../../../../packages/server/src/domain/search/substrate/space.ts";
import { GenerationSupersededError } from "../../../../packages/server/src/kit/embedding-generation/index.ts";
import { freshDb } from "../../../support/db.ts";
import { makeResolvedSecret } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";
import type { ConnectionHarness, HarnessOptions } from "../connection/_support.ts";
import { BYO_PROVIDER, makeHarness, seedOwner } from "../connection/_support.ts";
import { makeStoreHarness, seedCharacter } from "./_support.ts";

const LOCAL_LIGHT = castId<ProviderId>("local-light");
const ENCODER = "jinaai/jina-clip-v2";
const NARROW_ENCODER = "nomic-embed-text";
const NARROW_BASE_URL = "http://127.0.0.1:18705/v1";
const CARDS = [castId<CharacterId>("character_p1"), castId<CharacterId>("character_p2"), castId<CharacterId>("character_p3")];

const NARROW_ROUTE = {
  match: `${NARROW_BASE_URL}/embeddings`,
  reply: (body: string | null): unknown => {
    const request = JSON.parse(body ?? "{}") as { readonly input?: unknown; readonly dimensions?: number };
    const inputs = Array.isArray(request.input) ? request.input.length : 1;
    const width = request.dimensions ?? 768;
    return {
      object: "list",
      data: Array.from({ length: inputs }, (_input, index) => ({
        object: "embedding",
        index,
        embedding: Array.from({ length: width }, (_value, i) => (((i + index) % 7) + 1) / 10),
      })),
      model: NARROW_ENCODER,
    };
  },
};

interface Drive {
  readonly db: Db;
  readonly h: ConnectionHarness;
  readonly principal: Principal;
  readonly userId: Principal["userId"];
  readonly builtIn: UserConnectionId;
  readonly svc: EmbeddingsService;
  readonly ctx: EmbeddingsContext;
  readonly key: { revoked: boolean };
  readonly credentialId: UserCredentialId;
  /** Every owner the resolver reported a target move for. */
  readonly moved: UserId[];
  /** Every owner whose target a completing scope promoted. */
  readonly promoted: UserId[];
}

async function drive(intercept?: HarnessOptions["intercept"], admission?: HarnessOptions["admission"]): Promise<Drive> {
  const db = await freshDb();
  // Flipped by the test once the user fixes the key; a resolve reads it at call time.
  const key: { revoked: boolean } = { revoked: true };
  const moved: UserId[] = [];
  const promoted: UserId[] = [];
  const h = await makeHarness(db, {
    localLight: true,
    routes: [NARROW_ROUTE],
    intercept,
    admission,
    resolveCredential: ({ credentialId: keyId, providerId }) => {
      if (keyId === null) {
        return Promise.resolve(makeResolvedSecret());
      }
      return key.revoked ? Promise.reject(new DomainNoCredentialError(providerId)) : Promise.resolve(makeResolvedSecret("apiKey", "sk-test", keyId));
    },
  });
  const { userId, principal } = await seedOwner(db, "user_probe");
  const credentialId = castId<UserCredentialId>("user_credential_probe");
  await db.insert(userCredentials).values({ id: credentialId, ownerId: userId, provider: BYO_PROVIDER, ciphertext: "x", iv: "x", tag: "x" });
  const builtIn = (await h.svc.create({ principal, providerId: LOCAL_LIGHT, model: ENCODER, baseUrl: null, credentialId: null, allowBackground: true })).id;
  await h.svc.setBinding({ principal, task: "embed", connectionId: builtIn });
  for (const id of CARDS) {
    await seedCharacter(db, userId, { id, name: id });
  }
  const roleClients = (): Promise<RoleClients> => Promise.resolve(h.runtime.roleClientsFor(principal));
  const store = makeStoreHarness(db, { characterIds: CARDS, cardTexts: new Map(CARDS.map((id) => [id, `card text ${id}`])) });
  const ctx: EmbeddingsContext = {
    ...store.ctx,
    onTargetGenerationMoved: (ownerId) => {
      moved.push(ownerId);
    },
    onTargetPromoted: (ownerId) => {
      promoted.push(ownerId);
    },
    roleClientsFor: roleClients,
    // A named row resolves as if it were bound (the change preview asks that); embedding still runs through the bound role.
    resolveEmbeddingConnection: async (_ownerId, task, connectionId, opts) => {
      const rc = await roleClients();
      const resolved =
        connectionId === undefined
          ? await rc.resolved(task)
          : await h.runtime.resolve({ task, principal, connectionId, cachedFacts: opts?.cachedFacts }).then(
              ({ resolved: row }) => ({ model: row.model, connectionId: row.connectionId, providerId: row.providerId, capability: row.capability }),
              () => null,
            );
      return resolved === null
        ? null
        : {
            ...resolved,
            api: "test",
            wire: "test",
            baseUrl: null,
            features: {},
            extras: null,
            transport: null,
            embed: rc.embed,
            imageEmbed: rc.imageEmbed,
          };
    },
  };
  return { db, h, principal, userId, builtIn, svc: createEmbeddingsService(ctx), ctx, key, credentialId, moved, promoted };
}

/** The owner's sweep as the queued rebuild runs it: every card, then the two scopes this fixture holds nothing in. */
async function sweep(d: Drive, force: boolean): Promise<void> {
  await d.svc.embedCorpus({ force, signal: new AbortController().signal, ownerId: d.userId });
  const generation = await d.svc.resolveGeneration(d.userId, "embed");
  if (generation !== null) {
    await d.svc.purgeMemoryVectors({ ownerId: d.userId, generation });
    await d.svc.purgeDocumentVectors({ ownerId: d.userId, generation });
  }
}

/** What a search reads now: the cards it finds, or the refusal code. */
async function searchState(d: Drive): Promise<unknown> {
  try {
    return await withActiveQuerySpace(d.ctx, d.userId, "embed", async (space) => {
      const q = (await space.connection.embed("who", { inputType: "query" })).vectors[0];
      if (q === null || q === undefined) {
        return "no query vector";
      }
      const hits = await nearestCharacters(d.db, { ownerId: d.userId, queryVector: q, model: space.model, generationId: space.generationId, limit: 10 });
      return { hits: hits.map((hit) => hit.characterId).toSorted() };
    });
  } catch (error) {
    return { refused: (error as { code?: string }).code ?? String(error) };
  }
}

const ALL_CARDS = { hits: [...CARDS].toSorted() };

describe("an embedding target move queues the owner's rebuild", () => {
  test("a key fixed after a revoked re-point: the first write moves the target, and the rebuild restores search", async () => {
    const d = await drive();
    await sweep(d, false);
    expect(await searchState(d)).toEqual(ALL_CARDS);
    expect(d.moved, "the first target is a creation, not a move").toEqual([]);
    const narrow = (
      await d.h.svc.create({
        principal: d.principal,
        providerId: BYO_PROVIDER,
        model: NARROW_ENCODER,
        baseUrl: NARROW_BASE_URL,
        credentialId: d.credentialId,
        allowBackground: true,
      })
    ).id;
    await d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: narrow });
    d.key.revoked = false;

    await d.svc.store({ kind: "card", lens: "card-text", characterId: CARDS[0] as CharacterId, content: "edited card", model: "", ownerId: d.userId });

    expect(d.moved).toEqual([d.userId]);
    await sweep(d, true);
    expect(await searchState(d)).toEqual(ALL_CARDS);
  });

  test("re-binding the same encoder after an unbind moves nothing; a new encoder moves the targets once", async () => {
    const d = await drive();
    await sweep(d, false);
    const target = (await d.svc.resolveGeneration(d.userId, "embed"))?.id;
    await d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: null });
    await d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: d.builtIn });

    await d.svc.syncTargetGenerations(d.userId);

    expect(d.moved).toEqual([]);
    expect((await d.svc.resolveGeneration(d.userId, "embed"))?.id).toBe(target);
    d.key.revoked = false;
    const narrow = (
      await d.h.svc.create({
        principal: d.principal,
        providerId: BYO_PROVIDER,
        model: NARROW_ENCODER,
        baseUrl: NARROW_BASE_URL,
        credentialId: d.credentialId,
        allowBackground: true,
      })
    ).id;
    await d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: narrow });
    await d.svc.syncTargetGenerations(d.userId);
    // The text target moves, and so does the picture target that embeds captions through it.
    expect(new Set(d.moved)).toEqual(new Set([d.userId]));
    const moves = d.moved.length;
    await d.svc.syncTargetGenerations(d.userId);
    expect(d.moved, "a second sync finds the targets already moved").toHaveLength(moves);
  });

  test("a sync while the key is revoked moves nothing, keeps the old index, and does not throw", async () => {
    const d = await drive();
    await sweep(d, false);
    const narrow = (
      await d.h.svc.create({
        principal: d.principal,
        providerId: BYO_PROVIDER,
        model: NARROW_ENCODER,
        baseUrl: NARROW_BASE_URL,
        credentialId: d.credentialId,
        allowBackground: true,
      })
    ).id;
    await d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: narrow });

    const errorSpy = vi.spyOn(logger, "error");

    await expect(d.svc.syncTargetGenerations(d.userId)).resolves.toBeNull();

    expect(errorSpy, "a revoked key is the expected unresolvable case, not an error").not.toHaveBeenCalled();

    expect(d.moved).toEqual([]);
    expect(await d.db.select().from(characterEmbeddings), "the old index survives a sync that could not resolve").toHaveLength(CARDS.length);
  });
});

/** Re-point the owner's embed role to the narrow encoder, its key working. */
async function repointNarrow(d: Drive): Promise<void> {
  d.key.revoked = false;
  const narrow = (
    await d.h.svc.create({
      principal: d.principal,
      providerId: BYO_PROVIDER,
      model: NARROW_ENCODER,
      baseUrl: NARROW_BASE_URL,
      credentialId: d.credentialId,
      allowBackground: true,
    })
  ).id;
  await d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: narrow });
}

/** What the move's other two queued sweeps leave behind for this fixture, which holds no memory or documents: their
 *  scopes completed on the current target. */
async function completeSiblingScopes(d: Drive): Promise<void> {
  const generation = await d.svc.resolveGeneration(d.userId, "embed");
  if (generation !== null) {
    await d.svc.purgeMemoryVectors({ ownerId: d.userId, generation });
    await d.svc.purgeDocumentVectors({ ownerId: d.userId, generation });
  }
}

/** Run the owner's `index(all)` as the worker would, over a context whose hook lands a target move mid-run. */
async function runIndexWithMoveIn(d: Drive, hook: (ctx: EmbeddingsContext, move: () => Promise<void>) => EmbeddingsContext): Promise<string> {
  let moved = false;
  const move = async (): Promise<void> => {
    if (moved) {
      return;
    }
    moved = true;
    await repointNarrow(d);
    await svc.syncTargetGenerations(d.userId);
  };
  const svc = createEmbeddingsService(hook(d.ctx, move));
  const [index] = createEmbeddingsWorkloadContributions({
    embeddings: svc,
    emitUserEvent: () => undefined,
    listCorpusOwners: () => Promise.resolve([d.userId]),
  });
  return await index.run({ userId: d.userId, ownerId: d.userId, now: () => 0 }, { source: "all" }, vi.fn(), new AbortController().signal).then(
    () => "fulfilled",
    (error: unknown) => `rejected: ${String(error)}`,
  );
}

// A move can land while the owner's `index(all)` run is already running (a second re-point within a rebuild, or a
// manual run). That run pinned the old generation; it must finish on the NEW target, whichever pass it was in.
describe("a move that lands inside a running index run", () => {
  test("in the card pass: the run restarts on the new target and search answers with every card", async () => {
    const d = await drive();
    await sweep(d, false);
    let cards = 0;

    const outcome = await runIndexWithMoveIn(d, (ctx, move) => ({
      ...ctx,
      loadCardText: async (id) => {
        cards += 1;
        if (cards === 2) {
          await move();
        }
        return await ctx.loadCardText(id);
      },
    }));

    expect(outcome).toBe("fulfilled");
    await completeSiblingScopes(d);
    expect(await searchState(d)).toEqual(ALL_CARDS);
  });

  test("in the picture pass: the run goes round again and search answers with every card", async () => {
    const d = await drive();
    await sweep(d, false);

    const outcome = await runIndexWithMoveIn(d, (ctx, move) => ({
      ...ctx,
      listImageAssetIds: async (ownerId) => {
        await move();
        return await ctx.listImageAssetIds(ownerId);
      },
    }));

    expect(outcome).toBe("fulfilled");
    await completeSiblingScopes(d);
    expect(await searchState(d)).toEqual(ALL_CARDS);
  });
});

/** Run the move's rebuild of the owner's cards. */
async function runRebuild(d: Drive): Promise<void> {
  const [index] = createEmbeddingsWorkloadContributions({
    embeddings: d.svc,
    emitUserEvent: () => undefined,
    listCorpusOwners: () => Promise.resolve([d.userId]),
  });
  await index.run(
    { userId: d.userId, ownerId: d.userId, now: () => 0 },
    { source: "all", force: true, embedderChanged: true },
    vi.fn(),
    new AbortController().signal,
  );
}

async function completeScope(d: Drive, scope: "memory" | "documents"): Promise<void> {
  const generation = await d.svc.resolveGeneration(d.userId, "embed");
  if (generation !== null) {
    await (scope === "memory" ? d.svc.purgeMemoryVectors({ ownerId: d.userId, generation }) : d.svc.purgeDocumentVectors({ ownerId: d.userId, generation }));
  }
}

const NO_DOCUMENTS = { documents: 0, chunksUpserted: 0, chunksNoop: 0, chunksPruned: 0, reExtracted: 0, failed: [] };
const NO_MEMORY = { segments: { scanned: 0, changed: 0 }, segmentsSkippedOverWindow: 0, digests: { scanned: 0, changed: 0 }, failed: 0 };

/** The owner's databank pass as the worker runs it, the real receipts and completion behind a reindex that `during` hooks. */
async function runDatabankPass(d: Drive, during: () => Promise<void>): Promise<void> {
  const [, reindex] = createDatabankWorkloadContributions({
    databankIngest: {
      ingestDocument: () => Promise.resolve(NO_DOCUMENTS),
      reindex: async () => {
        await during();
        return NO_DOCUMENTS;
      },
    },
    beginDocumentVectorSweep: async (scope) => {
      const generation = scope === null ? null : await d.svc.resolveGeneration(scope, "embed");
      return generation === null || scope === null ? [] : [{ ownerId: scope, generation }];
    },
    purgeDocumentVectors: async (receipts) => {
      for (const receipt of receipts) {
        await d.svc.purgeDocumentVectors(receipt);
      }
    },
    targetSnapshot: d.svc.targetSnapshot,
  });
  await reindex.run(
    { userId: d.userId, ownerId: d.userId, now: () => 0 },
    { scope: { kind: "owner" }, mode: "chunk-embed" },
    vi.fn(),
    new AbortController().signal,
  );
}

/** The owner's memory sweep as the worker runs it: `plan` stands in for the planner and returns the space it
 *  pinned; the completion behind it is real. */
async function runMemorySweep(d: Drive, plan: (pinned: MemoryEmbedSpace) => Promise<MemoryEmbedSpace>): Promise<void> {
  const [memory] = createChatWorkloadContributions({
    backfillMemory: async () => {
      const generation = await d.svc.resolveGeneration(d.userId, "embed");
      if (generation === null) {
        throw new Error("the fixture owner must resolve an embed generation");
      }
      const pinned = await plan({ ownerId: d.userId, model: generation.space, generationId: generation.id, generationEpoch: generation.epoch });
      return { ...NO_MEMORY, completedSpaces: [pinned] };
    },
    estimateMemoryBackfill: () => Promise.resolve(0),
    backfillGroupCharacters: () => Promise.resolve({ scanned: 0, changed: 0 }),
    purgeMemoryVectors: async (spaces) => {
      for (const space of spaces) {
        await d.svc.purgeMemoryVectors({
          ownerId: space.ownerId,
          generation: { id: space.generationId, task: "embed", via: "embed", epoch: space.generationEpoch, space: space.model },
        });
      }
    },
    isMemoryEnabled: () => Promise.resolve(true),
    targetSnapshot: d.svc.targetSnapshot,
  });
  await memory.run({ userId: d.userId, ownerId: d.userId, now: () => 0 }, {}, vi.fn(), new AbortController().signal);
}

/** Land the move once, however often the hook fires. */
function moveOnce(d: Drive): () => Promise<void> {
  let moved = false;
  return async () => {
    if (!moved) {
      moved = true;
      await repointNarrow(d);
      await d.svc.syncTargetGenerations(d.userId);
    }
  };
}

// The move's rebuild of the documents and memory scopes can fold into a run of the same unit that is already going and
// pinned the old generation. Its terminal then names the old target, so the run must go round again on the new one.
describe("a move that lands inside a running databank or memory sweep", () => {
  test("in the owner's databank pass: the pass goes round again and documents complete on the new target", async () => {
    const d = await drive();
    await sweep(d, false);
    const move = moveOnce(d);

    await runDatabankPass(d, move);

    expect(d.moved, "the move landed inside the pass").not.toEqual([]);
    await runRebuild(d);
    await completeScope(d, "memory");
    expect(await searchState(d)).toEqual(ALL_CARDS);
  });

  test("after the memory sweep planned: the sweep goes round again and memory completes on the new target", async () => {
    const d = await drive();
    await sweep(d, false);
    const move = moveOnce(d);

    await runMemorySweep(d, async (pinned) => {
      await move();
      return pinned;
    });

    expect(d.moved, "the move landed inside the sweep").not.toEqual([]);
    await runRebuild(d);
    await completeScope(d, "documents");
    expect(await searchState(d)).toEqual(ALL_CARDS);
  });

  test("while the memory sweep plans: the planner's typed refusal sends the sweep round again", async () => {
    const d = await drive();
    await sweep(d, false);
    const move = moveOnce(d);
    let rounds = 0;

    await runMemorySweep(d, async (pinned) => {
      rounds += 1;
      if (rounds === 1) {
        await move();
        throw new GenerationSupersededError(d.userId, "memory");
      }
      return pinned;
    });

    expect(rounds).toBe(2);
    await runRebuild(d);
    await completeScope(d, "documents");
    expect(await searchState(d)).toEqual(ALL_CARDS);
  });
});

// Search answers again only once the last scope promotes the new target, and nothing else on the bus says so: the
// promotion itself is announced, to the owner whose target it is, once.
test("the scope that completes a moved target last announces its promotion to that owner, once", async () => {
  const d = await drive();
  await sweep(d, false);
  d.promoted.length = 0;
  await repointNarrow(d);
  await d.svc.syncTargetGenerations(d.userId);

  await runRebuild(d);
  // The picture target moved with the text one, and its only scope is the rebuild's picture pass.
  expect(d.promoted, "the picture target promotes; cards alone leave text search paused").toEqual([d.userId]);
  await completeScope(d, "memory");
  expect(d.promoted, "two of three text scopes leave text search paused").toEqual([d.userId]);
  await completeScope(d, "documents");

  expect(d.promoted).toEqual([d.userId, d.userId]);
  expect(await searchState(d)).toEqual(ALL_CARDS);
  await runRebuild(d);
  await completeScope(d, "memory");
  await completeScope(d, "documents");
  expect(d.promoted, "scopes completing again on the active targets promote nothing").toEqual([d.userId, d.userId]);
});

// A move purges the old index, so a width the new encoder does not make is refused before either target moves.
test("a sync whose embedder makes the wrong width returns the refusal and moves no target", async () => {
  const d = await drive();
  await sweep(d, false);
  await repointNarrow(d);
  const svc = createEmbeddingsService({
    ...d.ctx,
    resolveEmbeddingConnection: async (ownerId, task, connectionId) => {
      const connection = await d.ctx.resolveEmbeddingConnection(ownerId, task, connectionId);
      return connection === null
        ? null
        : { ...connection, embed: async (input, opts) => ({ ...(await connection.embed(input, opts)), vectors: [new Float32Array(7)] }) };
    },
  });

  const refusal = await svc.syncTargetGenerations(d.userId);

  expect(refusal).toEqual({ kind: "width", task: "embed", stated: 768, measured: 7, truncatable: true, assumed: false });
  expect(d.moved, "a width the embedder does not make keeps both targets").toEqual([]);
});

/** A row on the narrow server that states `dims`; the server makes 768-wide vectors and cannot shorten them. */
async function narrowStating(d: Drive, dims: number): Promise<UserConnectionId> {
  d.key.revoked = false;
  return (
    await d.h.svc.create({
      principal: d.principal,
      providerId: BYO_PROVIDER,
      model: NARROW_ENCODER,
      baseUrl: NARROW_BASE_URL,
      credentialId: d.credentialId,
      allowBackground: true,
      declared: { kind: "embedding", embedding: { dims, mrl: false } },
    })
  ).id;
}

/** The connection id the owner's text embedding role is bound to now. */
async function boundEmbedder(d: Drive): Promise<unknown> {
  return (await d.h.svc.listBindings({ principal: d.principal })).find((view) => view.task === "embed")?.binding?.connectionId;
}

// The pane's write waits on the move, so the width the embedder cannot make is that write's refusal: the write is
// undone, nothing is rebuilt or deleted, and the refusal names both widths.
describe("a connection write onto a width the embedder cannot make", () => {
  test("binding a server that states 1024 but makes 768 is refused, and the old index keeps answering", async () => {
    const d = await drive();
    await sweep(d, false);
    d.h.useEmbeddings(d.svc);
    const narrow = await narrowStating(d, 1024);

    const write = d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: narrow });

    await expect(write).rejects.toMatchObject({ code: CONNECTION_OP_CODES.embedWidthUnmakeable, detail: { stated: 1024, measured: 768, truncatable: false } });
    expect(await boundEmbedder(d)).toBe(d.builtIn);
    expect(d.moved).toEqual([]);
    expect(await searchState(d)).toEqual(ALL_CARDS);
  });

  test("setting the built-in embedder's width past what it makes is refused, and the row keeps its width", async () => {
    const d = await drive();
    await sweep(d, false);
    d.h.useEmbeddings(d.svc);

    const write = d.h.svc.update({
      principal: d.principal,
      connectionId: d.builtIn,
      patch: { declared: { kind: "embedding", embedding: { dims: 2048 } } },
    });

    await expect(write).rejects.toMatchObject({ code: CONNECTION_OP_CODES.embedWidthUnmakeable, detail: { stated: 2048, measured: 1024, truncatable: true } });
    expect((await d.h.svc.get({ principal: d.principal, connectionId: d.builtIn })).declared).toBeNull();
    expect(d.moved).toEqual([]);
    expect(await searchState(d)).toEqual(ALL_CARDS);
  });

  test("a width the server does make moves the target and queues the rebuild", async () => {
    const d = await drive();
    await sweep(d, false);
    d.h.useEmbeddings(d.svc);
    const narrow = await narrowStating(d, 768);

    await d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: narrow });

    expect(await boundEmbedder(d)).toBe(narrow);
    expect(d.moved).toContain(d.userId);
  });
});

/** The embeddings service the owner's writes sync through, with the n-th width probe answered by `answer(n, real)`. */
function probedService(d: Drive, answer: (n: number, real: () => Promise<EmbedResult>) => Promise<EmbedResult>): EmbeddingsService {
  let probes = 0;
  return createEmbeddingsService({
    ...d.ctx,
    resolveEmbeddingConnection: async (ownerId, task, connectionId) => {
      const connection = await d.ctx.resolveEmbeddingConnection(ownerId, task, connectionId);
      if (connection === null) {
        return null;
      }
      const embed: EmbeddingConnectionSnapshot["embed"] = async (input, opts) => {
        if (input !== WIDTH_PROBE_TEXT) {
          return await connection.embed(input, opts);
        }
        probes += 1;
        return await answer(probes, () => connection.embed(input, opts));
      };
      return { ...connection, embed };
    },
  });
}

/** Where the owner's text target embeds through now. */
async function targetConnection(d: Drive): Promise<unknown> {
  const generation = await d.svc.resolveGeneration(d.userId, "embed");
  return generation?.connection.connectionId;
}

/** A write's outcome as the pane meets it: accepted, or the refusal's code. */
async function outcomeOf(write: Promise<unknown>): Promise<string> {
  return await write.then(
    () => "accepted",
    (error: unknown) => `refused ${(error as { code?: string }).code ?? String(error)}`,
  );
}

/** How many times a held probe looks for the overlapping write before it answers anyway, and how long apart: a write
 *  that waits its turn never lands while the probe is held, so the hold has to end on its own. */
const OVERLAP_LOOKS = 20;
const OVERLAP_LOOK_MS = 5;

/** One probe held open until the test lets it answer, so a second write can be made while the first is unsettled. */
function heldProbe(): {
  readonly hold: (real: () => Promise<EmbedResult>) => Promise<EmbedResult>;
  readonly reached: Promise<void>;
  readonly releaseWhen: (landed: () => Promise<boolean>) => Promise<void>;
} {
  const reached = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  return {
    hold: async (real): Promise<EmbedResult> => {
      reached.resolve();
      await released.promise;
      return await real();
    },
    reached: reached.promise,
    // Answer as soon as the overlapping write has landed, or once it is clear it is waiting for this one.
    releaseWhen: async (landed): Promise<void> => {
      for (let look = 0; look < OVERLAP_LOOKS && !(await landed()); look += 1) {
        await new Promise((resolve) => setTimeout(resolve, OVERLAP_LOOK_MS));
      }
      released.resolve();
    },
  };
}

const PROBE_DOWN = (): Promise<never> => Promise.reject(new ProviderError({ kind: "server", retryable: true, message: "socket hang up" }));

// A refused write is undone after its probe answers, and a newer write may have landed meanwhile: the undo restores only
// what this write put there, so the newer write and its moved target agree.
describe("a refused write's undo, and a probe that does not answer", () => {
  test("a write refused while a newer write was made leaves the newer binding, which its target matches", async () => {
    const d = await drive();
    await sweep(d, false);
    const first = heldProbe();
    d.h.useEmbeddings(probedService(d, async (n, real) => (n === 1 ? await first.hold(real) : await real())));
    const wide = await narrowStating(d, 1024);
    const fits = await narrowStating(d, 768);

    const refused = outcomeOf(d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: wide }));
    await first.reached;
    const accepted = outcomeOf(d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: fits }));
    await first.releaseWhen(async () => (await boundEmbedder(d)) === fits);

    expect(await refused).toBe(`refused ${CONNECTION_OP_CODES.embedWidthUnmakeable}`);
    expect(await accepted).toBe("accepted");
    expect(await boundEmbedder(d)).toBe(fits);
    expect(await targetConnection(d)).toBe(fits);
  });

  test("a write accepted while a newer refused write was made still moves the target it bound", async () => {
    const d = await drive();
    await sweep(d, false);
    const first = heldProbe();
    let firstDone: Promise<unknown> = Promise.resolve();
    // The newer write's probe answers only once the older write has finished, so the older one lands first.
    d.h.useEmbeddings(
      probedService(d, async (n, real) => {
        if (n === 1) {
          return await first.hold(real);
        }
        await firstDone;
        return await real();
      }),
    );
    const fits = await narrowStating(d, 768);
    const wide = await narrowStating(d, 1024);

    const accepted = outcomeOf(d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: fits }));
    firstDone = accepted;
    await first.reached;
    const refused = outcomeOf(d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: wide }));
    await first.releaseWhen(async () => (await boundEmbedder(d)) === wide);

    expect(await accepted).toBe("accepted");
    expect(await refused).toBe(`refused ${CONNECTION_OP_CODES.embedWidthUnmakeable}`);
    expect(await boundEmbedder(d)).toBe(fits);
    expect(await targetConnection(d), "the accepted write's target moved, and its rebuild was queued").toBe(fits);
    expect(d.moved).toContain(d.userId);
  });

  test("a refused width edit made alongside another edit of the same row does not stay saved", async () => {
    const d = await drive();
    await sweep(d, false);
    d.h.useEmbeddings(d.svc);
    const fits = await narrowStating(d, 768);
    await d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: fits });
    const widthEdit = heldProbe();
    d.h.useEmbeddings(probedService(d, async (n, real) => (n === 1 ? await widthEdit.hold(real) : await real())));

    d.h.advance(5);
    const refused = outcomeOf(
      d.h.svc.update({ principal: d.principal, connectionId: fits, patch: { declared: { kind: "embedding", embedding: { dims: 1024, mrl: false } } } }),
    );
    await widthEdit.reached;
    d.h.advance(5);
    const renamed = outcomeOf(d.h.svc.update({ principal: d.principal, connectionId: fits, patch: { label: "renamed" } }));
    await widthEdit.releaseWhen(async () => (await d.h.svc.get({ principal: d.principal, connectionId: fits })).label === "renamed");

    expect(await refused).toBe(`refused ${CONNECTION_OP_CODES.embedWidthUnmakeable}`);
    expect(await renamed).toBe("accepted");
    const row = await d.h.svc.get({ principal: d.principal, connectionId: fits });
    expect(row.declared, "the refused width is not kept").toEqual({ kind: "embedding", embedding: { dims: 768, mrl: false } });
    expect(row.label).toBe("renamed");
  });

  test("a write's target move probes the width once, so a later failure cannot strand the write half done", async () => {
    const d = await drive();
    await sweep(d, false);
    let probes = 0;
    // A second probe is the move probing again after the proof; it fails the way a flaky server would.
    d.h.useEmbeddings(
      probedService(d, async (n, real) => {
        probes = n;
        return n > 1 ? await PROBE_DOWN() : await real();
      }),
    );
    const fits = await narrowStating(d, 768);

    expect(await outcomeOf(d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: fits }))).toBe("accepted");

    expect(probes, "the text target's proof, and nothing again inside the move").toBe(1);
    expect(await boundEmbedder(d)).toBe(fits);
    expect(await targetConnection(d)).toBe(fits);
  });

  test("an embedder that does not answer the width probe refuses the write with its own code, and nothing moves", async () => {
    const d = await drive();
    await sweep(d, false);
    d.h.useEmbeddings(probedService(d, PROBE_DOWN));
    const fits = await narrowStating(d, 768);

    const outcome = await outcomeOf(d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: fits }));

    expect(outcome).toBe(`refused ${CONNECTION_OP_CODES.embedUnreachable}`);
    expect(await boundEmbedder(d)).toBe(d.builtIn);
    expect(d.moved).toEqual([]);
    expect(await searchState(d)).toEqual(ALL_CARDS);
  });
});

const DEAD_ORIGIN = "http://203.0.113.1:18706";
/** How long a dial to a host that never answers takes to fail: undici's default connect timeout. */
const CONNECT_TIMEOUT_MS = 10_000;
const CLOCK_STEP_MS = 1000;
/** Far past the slowest refusal this write has had, so a regression reads as a duration instead of a hung test. */
const CLOCK_LIMIT_MS = 300_000;

/** A host that never answers: every dial to it fails at the connect timeout, or sooner when its caller gives up. */
function deadHost(url: string, init: RequestInit | undefined): Promise<Response> | null {
  if (!url.startsWith(DEAD_ORIGIN)) {
    return null;
  }
  return new Promise<Response>((_resolve, reject) => {
    const timer = setTimeout(() => reject(new TypeError("fetch failed: connect timeout")), CONNECT_TIMEOUT_MS);
    init?.signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

// A sleeping or powered-off embedder box is a connect timeout, not a refused port. The write waits on it, so it must
// give up after one look at the server and one probe, not after every resolve has waited out the dead host again.
test("a write onto an embedder host that never answers is refused after one catalog dial and one probe", async () => {
  const d = await drive(deadHost);
  await sweep(d, false);
  d.h.useEmbeddings(d.svc);
  d.key.revoked = false;
  const dead = (
    await d.h.svc.create({
      principal: d.principal,
      providerId: BYO_PROVIDER,
      model: NARROW_ENCODER,
      baseUrl: `${DEAD_ORIGIN}/v1`,
      credentialId: d.credentialId,
      allowBackground: true,
      declared: { kind: "embedding", embedding: { dims: 768, mrl: false } },
    })
  ).id;

  const { outcome, elapsed } = await onFakeClock(() => outcomeOf(d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: dead })));

  expect(outcome).toBe(`refused ${CONNECTION_OP_CODES.embedUnreachable}`);
  const dials = d.h.requests.filter((request) => request.url.startsWith(DEAD_ORIGIN)).map((request) => `${request.method} ${request.url}`);
  expect(dials, "one detect dial, then the width probe").toHaveLength(2);
  expect(elapsed).toBeLessThanOrEqual(2 * CONNECT_TIMEOUT_MS);
  expect(await boundEmbedder(d)).toBe(d.builtIn);
});

/** Run `write` on a fake clock advanced a step at a time until it settles: its outcome, and how long it took. */
async function onFakeClock(write: () => Promise<string>): Promise<{ readonly outcome: string | undefined; readonly elapsed: number }> {
  const settled: { outcome?: string } = {};
  let elapsed = 0;
  // @orb-waive test-determinism(vi.useFakeTimers): the subject is how long the write waits on connect timeouts and the probe bound, all setTimeouts no clock seam reaches.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const running = write().then((outcome) => {
      settled.outcome = outcome;
    });
    while (settled.outcome === undefined && elapsed < CLOCK_LIMIT_MS) {
      await vi.advanceTimersByTimeAsync(CLOCK_STEP_MS);
      elapsed += CLOCK_STEP_MS;
    }
    await running;
  } finally {
    vi.useRealTimers();
  }
  return { outcome: settled.outcome, elapsed };
}

// The server a refused write named may be started right after: a retry must ask it again, not reuse the held failure.
test("retrying a Server URL refused as unreachable asks that server again", async () => {
  const d = await drive(deadHost);
  await sweep(d, false);
  d.h.useEmbeddings(d.svc);
  const fits = await narrowStating(d, 768);
  await d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: fits });
  // This fixture's snapshots carry no URL, so the move the probe guards is the stated width that comes with the new server.
  const repoint = (): Promise<string> =>
    outcomeOf(
      d.h.svc.update({
        principal: d.principal,
        connectionId: fits,
        patch: { baseUrl: `${DEAD_ORIGIN}/v1`, declared: { kind: "embedding", embedding: { dims: 512, mrl: false } } },
      }),
    );
  const detects = (): number => d.h.requests.filter((request) => request.url === `${DEAD_ORIGIN}${DETECT_FIRST_PATH}`).length;

  expect((await onFakeClock(repoint)).outcome).toBe(`refused ${CONNECTION_OP_CODES.embedUnreachable}`);
  const first = detects();
  expect((await onFakeClock(repoint)).outcome).toBe(`refused ${CONNECTION_OP_CODES.embedUnreachable}`);

  expect(detects(), "the retry looked at the server again").toBe(first + 1);
});

/** The first path a detecting row's server probe asks. */
const DETECT_FIRST_PATH = "/api/extra/version";

/** Whether `write` has settled within the time a write waiting its turn would have to keep waiting. */
async function settlesWhileHeld(write: Promise<unknown>): Promise<boolean> {
  const settled = { done: false };
  void write.then(
    () => {
      settled.done = true;
    },
    () => {
      settled.done = true;
    },
  );
  for (let look = 0; look < OVERLAP_LOOKS && !settled.done; look += 1) {
    await new Promise((resolve) => setTimeout(resolve, OVERLAP_LOOK_MS));
  }
  return settled.done;
}

// A slow embedder check holds only the writes that can move the owner's index; an edit of a row no vector role uses
// lands at once.
describe("the owner's write queue holds only embedder writes", () => {
  test("a label edit on a row no vector role is bound to does not wait behind a held probe", async () => {
    const d = await drive();
    await sweep(d, false);
    const held = heldProbe();
    d.h.useEmbeddings(probedService(d, async (n, real) => (n === 1 ? await held.hold(real) : await real())));
    const wide = await narrowStating(d, 1024);
    const unrelated = await narrowStating(d, 768);

    const refused = outcomeOf(d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: wide }));
    await held.reached;
    const renamed = d.h.svc.update({ principal: d.principal, connectionId: unrelated, patch: { label: "renamed" } });

    expect(await settlesWhileHeld(renamed)).toBe(true);
    await held.releaseWhen(() => Promise.resolve(true));
    expect(await refused).toBe(`refused ${CONNECTION_OP_CODES.embedWidthUnmakeable}`);
    expect((await d.h.svc.get({ principal: d.principal, connectionId: unrelated })).label).toBe("renamed");
  });

  test("a binding queued behind the removal of its row is refused as not found, and nothing is bound to it", async () => {
    const d = await drive();
    await sweep(d, false);
    const held = heldProbe();
    d.h.useEmbeddings(probedService(d, async (n, real) => (n === 1 ? await held.hold(real) : await real())));
    const wide = await narrowStating(d, 1024);
    const doomed = await narrowStating(d, 768);

    const first = outcomeOf(d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: wide }));
    await held.reached;
    const removed = outcomeOf(d.h.svc.remove({ principal: d.principal, connectionId: doomed }));
    const bound = outcomeOf(d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: doomed }));
    await held.releaseWhen(() => Promise.resolve(true));

    expect(await first).toBe(`refused ${CONNECTION_OP_CODES.embedWidthUnmakeable}`);
    expect(await removed).toBe("accepted");
    expect(await bound).toBe(`refused ${CONNECTION_OP_CODES.notFound}`);
    expect(await boundEmbedder(d)).toBe(d.builtIn);
  });
});

// The confirm says "deletes your search index" only when the write's sync will move a stored target.
describe("the change preview measures against the stored target", () => {
  test("re-binding the embedder the target already names, after an unbind, rebuilds nothing", async () => {
    const d = await drive();
    await sweep(d, false);
    d.h.useEmbeddings(d.svc);
    await d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: null });

    const rebind = await d.h.svc.previewEmbedSpaceChange({ principal: d.principal, change: { kind: "bind", task: "embed", connectionId: d.builtIn } });
    const other = await d.h.svc.previewEmbedSpaceChange({
      principal: d.principal,
      change: { kind: "bind", task: "embed", connectionId: await narrowStating(d, 768) },
    });

    expect(rebind).toMatchObject({ reindex: false, embedCalls: 0 });
    expect(other).toMatchObject({ reindex: true, stored: { cards: CARDS.length } });
  });

  // The preview runs before the confirm, so a sleeping host it dialed would hold the pick with nothing on screen.
  test("previewing a pick of a connection whose host does not answer reads stored facts, and never dials it", async () => {
    const host = heldHost();
    const d = await drive(host.intercept);
    await sweep(d, false);
    d.h.useEmbeddings(d.svc);
    const sleeping = await stating(d, `${HELD_ORIGIN}/v1`, { kind: "embedding", embedding: { dims: 768, mrl: false } });
    const dialsBefore = host.dials(d);

    const preview = d.h.svc.previewEmbedSpaceChange({ principal: d.principal, change: { kind: "bind", task: "embed", connectionId: sleeping } });

    expect(await settlesWhileHeld(preview), "the preview answered while the host was still silent").toBe(true);
    expect(await preview).toMatchObject({ reindex: true, stored: { cards: CARDS.length } });
    expect(host.dials(d)).toBe(dialsBefore);
    host.release();
  });
});

const HELD_ORIGIN = "http://203.0.113.2:18707";
const SLOW_ORIGIN = "http://127.0.0.1:18708";
const KEYED_ORIGIN = "http://127.0.0.1:18709";
/** A cold Ollama load measured 7 s after the first bind gave up at 10 s; a waking server takes longer. */
const MODEL_LOAD_MS = 15_000;
const HTTP_UNAUTHORIZED = 401;

const UNLISTED_ENCODER = "probe-embedder";
const MOVED_ENCODER = "other-embed";

/** A row at `baseUrl` on the custom endpoint, with `declared` as its stated facts. */
async function stating(
  d: Drive,
  baseUrl: string,
  declared: NonNullable<Parameters<ConnectionHarness["svc"]["create"]>[0]["declared"]>,
  model = NARROW_ENCODER,
): Promise<UserConnectionId> {
  d.key.revoked = false;
  return (
    await d.h.svc.create({ principal: d.principal, providerId: BYO_PROVIDER, model, baseUrl, credentialId: d.credentialId, allowBackground: true, declared })
  ).id;
}

/** A host whose every dial hangs until the test releases it, then fails the way a dead host's connect does. */
function heldHost(): {
  readonly intercept: NonNullable<HarnessOptions["intercept"]>;
  readonly dials: (d: Drive) => number;
  readonly release: () => void;
} {
  const gate = Promise.withResolvers<void>();
  return {
    intercept: (url) =>
      url.startsWith(HELD_ORIGIN)
        ? gate.promise.then(() => {
            throw new TypeError("fetch failed: connect timeout");
          })
        : null,
    dials: (d) => d.h.requests.filter((request) => request.url.startsWith(HELD_ORIGIN)).length,
    release: (): void => {
      gate.resolve();
    },
  };
}

/** The narrow server's embed answer to `init`'s body. */
function narrowAnswer(init: RequestInit | undefined): Response {
  return new Response(JSON.stringify(NARROW_ROUTE.reply(typeof init?.body === "string" ? init.body : null)), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** A running server still loading its model: it answers every catalog read at once, and its first embed only after
 *  the model has loaded. */
function loadingServer(url: string, init: RequestInit | undefined): Promise<Response> | null {
  if (url !== `${SLOW_ORIGIN}/v1/embeddings`) {
    return null;
  }
  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => resolve(narrowAnswer(init)), MODEL_LOAD_MS);
    init?.signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/** A server that refuses the row's key on every embed. */
function keyRefusingServer(url: string): Promise<Response> | null {
  return url === `${KEYED_ORIGIN}/v1/embeddings`
    ? Promise.resolve(
        new Response(JSON.stringify({ error: { message: "Incorrect API key provided", type: "invalid_request_error" } }), {
          status: HTTP_UNAUTHORIZED,
          headers: { "content-type": "application/json" },
        }),
      )
    : null;
}

function isTextEmbed(resolved: Resolved): resolved is Resolved<"embed"> {
  return resolved.task === "embed";
}

/** The embeddings service over the bound role's full resolve, as the composition root builds it: its wire, its
 *  features, and an embed that carries the caller's abort signal to the request. */
function wiredService(d: Drive): EmbeddingsService {
  return createEmbeddingsService({
    ...d.ctx,
    resolveEmbeddingConnection: async (_ownerId, task, connectionId) => {
      const resolved = await d.h.runtime.resolve({ task, principal: d.principal, ...(connectionId === undefined ? {} : { connectionId }) }).then(
        (outcome) => outcome.resolved,
        () => null,
      );
      if (resolved === null || !isTextEmbed(resolved)) {
        return null;
      }
      const embed: EmbeddingConnectionSnapshot["embed"] = (input, opts) =>
        d.h.runtime.executor.embed({ connection: resolved, input, ...(opts?.signal === undefined ? {} : { signal: opts.signal }) });
      return { ...resolved, api: resolved.api ?? "none", embed, imageEmbed: () => Promise.reject(new Error("no image embed in this fixture")) };
    },
  });
}

describe("the width probe on a server that answers", () => {
  // The server answered its catalog read, so it is running: its first embed is waited for like any embed request.
  test("binding an embedder whose server is still loading the model is accepted once the model answers", async () => {
    const d = await drive(loadingServer);
    await sweep(d, false);
    d.h.useEmbeddings(wiredService(d));
    const loading = await stating(d, `${SLOW_ORIGIN}/v1`, { kind: "embedding", embedding: { dims: 768, mrl: false } });

    const { outcome, elapsed } = await onFakeClock(() => outcomeOf(d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: loading })));

    expect(outcome).toBe("accepted");
    expect(elapsed).toBeGreaterThanOrEqual(MODEL_LOAD_MS);
    expect(await boundEmbedder(d)).toBe(loading);
  });

  test("an embedder that refuses its key is refused as a key problem, and nothing moves", async () => {
    const d = await drive(keyRefusingServer);
    await sweep(d, false);
    d.h.useEmbeddings(d.svc);
    const keyed = await stating(d, `${KEYED_ORIGIN}/v1`, { kind: "embedding", embedding: { dims: 768, mrl: false } });

    const outcome = await outcomeOf(d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: keyed }));

    expect(outcome).toBe(`refused ${CONNECTION_OP_CODES.embedAuth}`);
    expect(await boundEmbedder(d)).toBe(d.builtIn);
    expect(d.moved).toEqual([]);
  });

  test("a width refusal says whether the width was stated or only assumed", async () => {
    const d = await drive();
    await sweep(d, false);
    d.h.useEmbeddings(d.svc);
    // A model no curated row or server listing states a width for: its width is the kind floor's guess.
    const unstated = await stating(d, NARROW_BASE_URL, { kind: "embedding" }, UNLISTED_ENCODER);
    const stated = await narrowStating(d, 1024);

    const assumedWrite = d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: unstated });
    await expect(assumedWrite).rejects.toMatchObject({ code: CONNECTION_OP_CODES.embedWidthUnmakeable, detail: { measured: 768, assumed: true } });
    const statedWrite = d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: stated });
    await expect(statedWrite).rejects.toMatchObject({ code: CONNECTION_OP_CODES.embedWidthUnmakeable, detail: { stated: 1024, assumed: false } });
  });
});

/** An admission read that holds the first URL check it is armed for until the test lets it through. */
function heldAdmission(): {
  readonly admission: NonNullable<HarnessOptions["admission"]>;
  readonly arm: () => void;
  readonly reached: Promise<void>;
  readonly release: () => void;
} {
  const reached = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  let armed = false;
  return {
    admission: async (baseUrl): Promise<"invalid" | "admitted"> => {
      if (armed) {
        armed = false;
        reached.resolve();
        await gate.promise;
      }
      return URL.parse(baseUrl) === null ? "invalid" : "admitted";
    },
    arm: (): void => {
      armed = true;
    },
    reached: reached.promise,
    release: (): void => {
      gate.resolve();
    },
  };
}

// A width edit and a binding of the same row, made together, must not both land: the width is then the bound
// embedder's, and nothing probed it.
test("a width edit overtaken by a binding of its row never lands unprobed on the bound row", async () => {
  const held = heldAdmission();
  const d = await drive(undefined, held.admission);
  await sweep(d, false);
  d.h.useEmbeddings(d.svc);
  const row = await narrowStating(d, 768);

  held.arm();
  const edit = outcomeOf(
    d.h.svc.update({ principal: d.principal, connectionId: row, patch: { declared: { kind: "embedding", embedding: { dims: 1024, mrl: false } } } }),
  );
  await held.reached;
  const bind = outcomeOf(d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: row }));
  // The binding lands now if nothing holds it; an edit that can move the space holds it until the edit is written.
  await settlesWhileHeld(bind);
  held.release();
  const outcomes = [await edit, await bind];

  // The edit was asked first, so it lands first; the binding then probes the width the row now states, and is refused.
  expect(outcomes).toEqual(["accepted", `refused ${CONNECTION_OP_CODES.embedWidthUnmakeable}`]);
  expect(await boundEmbedder(d)).toBe(d.builtIn);
});

// A label edit reads the row before its checks and writes after them; a model move that lands in between must stay.
test("a label edit that overlaps a model move of the same row keeps the moved model", async () => {
  const held = heldAdmission();
  const d = await drive(undefined, held.admission);
  await sweep(d, false);
  d.h.useEmbeddings(d.svc);
  const row = await narrowStating(d, 768);
  await d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: row });

  held.arm();
  const renamed = outcomeOf(d.h.svc.update({ principal: d.principal, connectionId: row, patch: { label: "renamed" } }));
  await held.reached;
  const moved = await outcomeOf(d.h.svc.update({ principal: d.principal, connectionId: row, patch: { model: MOVED_ENCODER } }));
  held.release();

  expect([moved, await renamed]).toEqual(["accepted", "accepted"]);
  const saved = await d.h.svc.get({ principal: d.principal, connectionId: row });
  expect({ model: saved.model, label: saved.label }).toEqual({ model: MOVED_ENCODER, label: "renamed" });
});

// The control: a label edit cannot change what the probe checks, so it lands at once even while a binding waits.
test("a label edit of a row being bound lands without waiting for the binding's probe", async () => {
  const d = await drive();
  await sweep(d, false);
  const held = heldProbe();
  d.h.useEmbeddings(probedService(d, async (n, real) => (n === 1 ? await held.hold(real) : await real())));
  const row = await narrowStating(d, 768);

  const bind = outcomeOf(d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: row }));
  await held.reached;
  const renamed = d.h.svc.update({ principal: d.principal, connectionId: row, patch: { label: "renamed" } });

  expect(await settlesWhileHeld(renamed)).toBe(true);
  await held.releaseWhen(() => Promise.resolve(true));
  expect(await bind).toBe("accepted");
  expect((await d.h.svc.get({ principal: d.principal, connectionId: row })).label).toBe("renamed");
});

describe("an edit that cannot move the index never dials the bound embedder", () => {
  // The bound row's re-point stores its new URL before probing it, so a resolve of the bound role would dial that host.
  test("a label edit on an unbound row lands while the bound embedder's new host is still being dialed", async () => {
    const host = heldHost();
    const d = await drive(host.intercept);
    await sweep(d, false);
    d.h.useEmbeddings(d.svc);
    const fits = await narrowStating(d, 768);
    await d.h.svc.setBinding({ principal: d.principal, task: "embed", connectionId: fits });
    const unrelated = await narrowStating(d, 768);

    const repoint = outcomeOf(
      d.h.svc.update({
        principal: d.principal,
        connectionId: fits,
        patch: { baseUrl: `${HELD_ORIGIN}/v1`, declared: { kind: "embedding", embedding: { dims: 512, mrl: false } } },
      }),
    );
    for (let look = 0; look < OVERLAP_LOOKS && host.dials(d) === 0; look += 1) {
      await new Promise((resolve) => setTimeout(resolve, OVERLAP_LOOK_MS));
    }
    expect(host.dials(d), "the re-point is dialing its new host").toBeGreaterThan(0);
    const renamed = d.h.svc.update({ principal: d.principal, connectionId: unrelated, patch: { label: "renamed" } });

    expect(await settlesWhileHeld(renamed)).toBe(true);
    host.release();
    expect(await repoint).toBe(`refused ${CONNECTION_OP_CODES.embedUnreachable}`);
    expect((await d.h.svc.get({ principal: d.principal, connectionId: unrelated })).label).toBe("renamed");
  });
});

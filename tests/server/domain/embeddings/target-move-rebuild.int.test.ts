// Every move of an owner's embedding target, from any caller, owes that owner a full rebuild: the switch purges the
// old index, and only a forced sweep refills it. The lazy write path is the one no binding write sees: a re-point
// to a row whose key is revoked switches nothing, and the first write after the key is fixed does.

import type { Principal } from "@orb/contracts/identity";
import type { ProviderId } from "@orb/contracts/inference";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import { characterEmbeddings, userCredentials } from "@orb/db";
import { DomainNoCredentialError } from "@orb/kit/errors";
import type { CharacterId, UserConnectionId, UserCredentialId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService, createEmbeddingsWorkloadContributions } from "@orb/server/domain/embeddings";
import { logger } from "@orb/server/foundation/observability";
import { describe, vi } from "vitest";
import type { EmbeddingsContext } from "../../../../packages/server/src/domain/embeddings/context.ts";
import type { EmbeddingsService } from "../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { nearestCharacters } from "../../../../packages/server/src/domain/search/persistence/nearest.ts";
import { withActiveQuerySpace } from "../../../../packages/server/src/domain/search/substrate/space.ts";
import { freshDb } from "../../../support/db.ts";
import { makeResolvedSecret } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";
import type { ConnectionHarness } from "../connection/_support.ts";
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
}

async function drive(): Promise<Drive> {
  const db = await freshDb();
  // Flipped by the test once the user fixes the key; a resolve reads it at call time.
  const key: { revoked: boolean } = { revoked: true };
  const moved: UserId[] = [];
  const h = await makeHarness(db, {
    localLight: true,
    routes: [NARROW_ROUTE],
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
    roleClientsFor: roleClients,
    resolveEmbeddingConnection: async (_ownerId, task) => {
      const rc = await roleClients();
      const resolved = await rc.resolved(task);
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
  return { db, h, principal, userId, builtIn, svc: createEmbeddingsService(ctx), ctx, key, credentialId, moved };
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

    await expect(d.svc.syncTargetGenerations(d.userId)).resolves.toBeUndefined();

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

// Anything else a sync hits has no write waiting to report it, so it is logged rather than dropped.
test("a sync whose embedder makes the wrong width keeps the target and logs why", async () => {
  const d = await drive();
  await sweep(d, false);
  await repointNarrow(d);
  const errorSpy = vi.spyOn(logger, "error");
  const svc = createEmbeddingsService({
    ...d.ctx,
    resolveEmbeddingConnection: async (ownerId, task) => {
      const connection = await d.ctx.resolveEmbeddingConnection(ownerId, task);
      return connection === null
        ? null
        : { ...connection, embed: async (input, opts) => ({ ...(await connection.embed(input, opts)), vectors: [new Float32Array(7)] }) };
    },
  });

  await svc.syncTargetGenerations(d.userId);

  expect(d.moved, "a width the embedder does not make keeps the old target").toEqual([]);
  expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ ownerId: d.userId, task: "embed" }), expect.any(String));
});

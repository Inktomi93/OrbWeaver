// A text-to-image query carries the image scope's retrieval instruction to an embedder that honours one, and only the
// query side moves: stored image vectors keep their document instruction, so the space is unchanged. A cancelled
// request reaches the provider call it is waiting on: the query embed and the rerank both carry the request's signal.
// @subject packages/server/src/domain/search/verbs/images.ts
// @subject packages/server/src/domain/embeddings/verbs/runtime-connection.ts
// @subject packages/inference/src/backends/openai-compat/image-embed.ts

import { readFile } from "node:fs/promises";
import { createCharacterSchema } from "@orb/contracts/character";
import { modelIdSchema } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { z } from "zod";
import { SCOPE_INSTRUCTIONS } from "#server/domain/search/substrate/instructions.ts";

const QUERY = "a silver-haired archivist";
const RERANK_MODEL = modelIdSchema.parse("image-rerank-model");
const rerankBodySchema = z.object({ query: z.string(), documents: z.array(z.unknown()) });
const AVATARS = ["birdie", "calamity"] as const;
const conversationSchema = z.array(z.object({ role: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })) }));

interface ImageSearchWire {
  readonly system: string | undefined;
  readonly stored: readonly (string | undefined)[];
  readonly rerankQueries: readonly string[];
  /** The hit hashes in the order the search returned them. */
  readonly order: readonly string[];
}

/** The provider call at which the request is cancelled while the provider holds it. */
type CancelPoint = "query-embed" | "rerank";

interface ImageSearchCase {
  readonly instructionAware: boolean;
  readonly rerank?: boolean;
  readonly cancelAt?: CancelPoint;
}

interface CancelledSearch {
  /** Whether the provider saw the request's own signal aborted once the caller cancelled. */
  readonly providerSawAbort: boolean;
  readonly outcome: PromiseSettledResult<unknown>;
}

async function imageSearch(search: ImageSearchCase): Promise<ImageSearchWire & { readonly cancelled: CancelledSearch | null }> {
  const { instructionAware, rerank = false, cancelAt } = search;
  const request = new AbortController();
  const edge = { sawAbort: false };
  // The caller cancels while the provider holds the call; a signal threaded to the provider edge is aborted at once.
  const cancelHere = (held: Request): void => {
    request.abort();
    edge.sawAbort = held.signal.aborted;
  };
  const rerankQueries: string[] = [];
  const conversations: z.infer<typeof conversationSchema>[] = [];
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL, RERANK_MODEL],
    embedding: (input) => {
      conversations.push(conversationSchema.parse(JSON.parse(input)));
      return CORPUS_EMBEDDING_VECTOR;
    },
    chatText: "unused",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({
    providerFetch: async (input, init) => {
      const held = new Request(input, init);
      if (new URL(held.url).pathname !== "/v1/rerank") {
        if (cancelAt === "query-embed" && (await held.clone().text()).includes(QUERY)) {
          cancelHere(held);
        }
        return await wire.execute(held);
      }
      if (cancelAt === "rerank") {
        cancelHere(held);
      }
      const body = rerankBodySchema.parse(await held.json());
      rerankQueries.push(body.query);
      // The cross-encoder prefers the last document it was offered, so a search that applies its answer reverses the offered order.
      const last = body.documents.length - 1;
      return Response.json({ results: body.documents.map((_, rank) => ({ index: last - rank, ["relevance_score"]: body.documents.length - rank })) });
    },
  });
  const principal = await root.principalFor(root.ownerId);
  const { embed } = await seedCorpusConnections(root, principal);
  const reranker = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: RERANK_MODEL,
    allowBackground: true,
    declared: {
      kind: "rerank",
      rerank: { maxInputTokens: 8192, input: ["text"], instructionAware: false },
      features: { detectServer: false, rerankPath: "/rerank" },
    },
  });
  await root.services.connection.setBinding({ principal, task: "rerank", connectionId: reranker.id });
  await root.services.connection.update({
    principal,
    connectionId: embed.id,
    patch: {
      declared: {
        kind: "embedding",
        embedding: { dims: CORPUS_EMBEDDING_VECTOR.length, maxInputTokens: 8192, input: ["text", "image"], instructionAware },
        features: { detectServer: false },
      },
    },
  });
  await root.services.connection.setBinding({ principal, task: "imageEmbed", connectionId: embed.id });
  // Two pictures, so a rerank that reorders the pool shows in the result order.
  for (const name of AVATARS) {
    const bytes = await readFile(new URL(import.meta.resolve(`@orb/default-content/avatars/${name}.png`)));
    const avatar = await root.services.assets.store({ principal, kind: "avatar", mime: "image/png", bytes });
    await root.services.character.create({
      principal,
      input: createCharacterSchema.parse({ name, handle: name, description: "An avatar-bearing card.", avatarAssetId: avatar.assetId }),
    });
    await root.app.embeddings.indexAsset(avatar.assetId, { signal: new AbortController().signal, force: true });
  }
  await root.app.embeddings.embedAssets({ ownerId: principal.userId, force: false, signal: new AbortController().signal });
  await root.settleBackground();
  const searched = root.services.search.images({
    signal: request.signal,
    ownerId: principal.userId,
    query: QUERY,
    topN: AVATARS.length,
    lens: rerank ? "image-captioned" : "image-raw",
    rerank,
  });
  if (cancelAt !== undefined) {
    const [outcome] = await Promise.allSettled([searched]);
    return { system: undefined, stored: [], rerankQueries, order: [], cancelled: { providerSawAbort: edge.sawAbort, outcome } };
  }
  const hits = await searched;
  expect(hits).toHaveLength(AVATARS.length);
  const isQuery = (conversation: z.infer<typeof conversationSchema>): boolean => conversation.at(-1)?.content.some((part) => part.text === QUERY) === true;
  const systemOf = (conversation: z.infer<typeof conversationSchema> | undefined): string | undefined => conversation?.[0]?.content[0]?.text;
  return {
    system: systemOf(conversations.find(isQuery)),
    stored: conversations.filter((conversation) => !isQuery(conversation)).map(systemOf),
    rerankQueries,
    order: hits.map((hit) => hit.hash),
    cancelled: null,
  };
}

test("an instruction-aware embedder receives a scope instruction in place of the wire default, and stored images keep theirs", async () => {
  const aware = await imageSearch({ instructionAware: true });
  const unaware = await imageSearch({ instructionAware: false });
  expect(unaware.system).toBeDefined();
  expect(aware.system).toBeDefined();
  expect(aware.system).not.toBe(unaware.system);
  expect(aware.stored).toEqual(unaware.stored);
  expect(aware.stored.length).toBeGreaterThan(0);
  expect(aware.stored).not.toContain(aware.system);
});

test("a reranked image search leads the cross-encoder query with a scope instruction, as every other search verb does", async () => {
  const plain = await imageSearch({ instructionAware: false });
  const { rerankQueries, order } = await imageSearch({ instructionAware: false, rerank: true });
  expect(rerankQueries).toHaveLength(1);
  expect(rerankQueries).toEqual([`${SCOPE_INSTRUCTIONS.images.rerank}\n${QUERY}`]);
  // The search returns the cross-encoder's order, not the pool's.
  expect(new Set(plain.order).size).toBe(AVATARS.length);
  expect(order).toEqual(plain.order.toReversed());
});

test.each<CancelPoint>(["query-embed", "rerank"])("a request cancelled during the %s call aborts that provider call and ends the search", async (cancelAt) => {
  const { cancelled } = await imageSearch({ instructionAware: false, rerank: true, cancelAt });
  expect(cancelled?.providerSawAbort).toBe(true);
  expect(cancelled?.outcome.status).toBe("rejected");
});

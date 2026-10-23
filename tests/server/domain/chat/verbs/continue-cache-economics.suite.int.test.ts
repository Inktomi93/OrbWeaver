// @subject packages/server/src/domain/chat/verbs/turn.ts
// Restore keeps recorded economics; fresh continuations cannot claim replay hits for disabled cache requests.
import { builtinProvider } from "@orb/contracts/inference";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

const METHODS = ["undoContinue", "revertContinue"] as const;
const CACHE_KINDS = ["miss", "hit"] as const;
const SOURCE_IDS = ["gen-cache-base", "gen-cache-a", "gen-cache-b"] as const;

function nativeCacheReply(physicalIndex: number, kind: (typeof CACHE_KINDS)[number]): Response {
  const index = kind === "hit" && physicalIndex > 0 ? physicalIndex - 1 : physicalIndex;
  const source = SOURCE_IDS[index];
  const content = ["Base.", "A.", "B."][index];
  if (source === undefined || content === undefined) {
    return Response.json({ error: { message: "the finite cache-economics supplier is exhausted" } }, { status: 400 });
  }
  const hit = physicalIndex === 0 && kind === "hit";
  const usage = {
    ["prompt_tokens"]: index === 2 ? 0 : 12,
    ["completion_tokens"]: index === 2 ? 0 : 3,
    ["total_tokens"]: index === 2 ? 0 : 15,
    ["prompt_tokens_details"]: { ["cached_tokens"]: 0, ["cache_write_tokens"]: 0 },
    ["completion_tokens_details"]: { ["reasoning_tokens"]: 0 },
    ...(hit ? {} : { cost: index === 2 ? 0 : 0.25 }),
  };
  return new Response(
    `data: ${JSON.stringify({ id: source, model: "openai/gpt-4.1-mini", choices: [{ index: 0, delta: { content }, ["finish_reason"]: "stop" }], usage })}\n\ndata: [DONE]\n\n`,
    {
      headers: {
        "content-type": "text/event-stream",
        "x-openrouter-cache-status": hit ? "hit" : "miss",
        "x-openrouter-cache-age": String(index),
        "x-openrouter-cache-ttl": "300",
        "x-openrouter-cache-source-id": source,
      },
    },
  );
}

async function cacheRoom(
  kind: (typeof CACHE_KINDS)[number],
): Promise<AsyncDisposable & { readonly h: ChatRoot; readonly replayHeaders: readonly (string | null)[] }> {
  const official = builtinProvider("openrouter")?.baseUrl;
  if (official === undefined) {
    throw new Error("the canonical OpenRouter provider has no hosted endpoint");
  }
  const endpoint = `${official.replace(/\/$/u, "")}/chat/completions`;
  const host = new URL(endpoint).hostname;
  const corpusOrigin = new URL(CORPUS_PROVIDER_ENDPOINT).origin;
  const replayHeaders: (string | null)[] = [];
  let next = 0;
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused cache-economics corpus reply",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await createChatRoot({
      memoryEnabled: false,
      promptConfig: { ...DEFAULT_PROMPT_CONFIG, params: { ...DEFAULT_PROMPT_CONFIG.params, responseCache: { enabled: true } } },
      server: {
        secretBoxKey: Buffer.alloc(32, 1),
        networkExecution: {
          resolver: (hostname): Promise<readonly string[]> =>
            hostname === host ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error(`unscripted cache-economics address: ${hostname}`)),
        },
      },
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        if (new URL(request.url).origin === corpusOrigin) {
          return await corpus.execute(request);
        }
        if (request.method !== "POST" || request.url !== endpoint) {
          throw new Error(`unscripted cache-economics URL: ${request.url}`);
        }
        replayHeaders.push(request.headers.get("x-openrouter-cache"));
        return nativeCacheReply(next++, kind);
      },
    }),
  );
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "openrouter", key: "controlled-cache-economics-key" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "openrouter",
    credentialId: credential.id,
    baseUrl: null,
    model: "openai/gpt-4.1-mini",
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const lifetime = construction.move();
  return { h, replayHeaders, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

test.for(METHODS.flatMap((method) => CACHE_KINDS.map((kind) => ({ method, kind }))))(
  "$method preserves native $kind receipts and replaces A economics with genuinely different fresh B economics",
  async ({ method, kind }) => {
    await using f = await cacheRoom(kind);
    const { h } = f;
    const generated = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Start the native cache receipt workload." });
    let slot = generated.messages.find(({ role }) => role === "assistant");
    expect(slot).toBeDefined();
    if (slot === undefined) {
      throw new Error("the real cached send produced no assistant slot");
    }
    const source = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, slot.selectedVariantId)).get();
    expect(source?.responseCache).toEqual({ status: kind, ageSeconds: 0, ttlSeconds: 300, sourceGenerationId: SOURCE_IDS[0] });
    expect(source?.costUsd).toBe(kind === "hit" ? 0 : 0.25);
    expect(source?.costProvenance).toBe("measured");
    if (source === undefined) {
      throw new Error("the native send lost its canonical generation record");
    }
    if (kind === "hit") {
      const swiped = await h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: slot.id });
      const alternate = swiped.messages.find(({ role }) => role === "assistant");
      if (alternate === undefined) {
        throw new Error("the public swipe produced no selected alternate");
      }
      slot = alternate;
    }
    expect(slot.selectedVariantId === source.id).toBe(kind !== "hit");
    const args = { principal: h.owner, chatId: h.chatId, messageId: slot.id };
    await h.root.services.chat.continueTurn(args);
    const before = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, slot.selectedVariantId)).get();
    expect(before).toMatchObject({
      content: "Base.A.",
      tokensIn: 12,
      tokensOut: 3,
      costUsd: 0.25,
      costProvenance: "measured",
      responseCache: { status: "miss", ageSeconds: 1, ttlSeconds: 300, sourceGenerationId: SOURCE_IDS[1] },
    });
    if (method === "revertContinue") {
      await h.root.services.chat.undoContinue(args);
    }
    await h.root.services.chat[method](args);
    const restored = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, slot.selectedVariantId)).get();
    expect(restored).toEqual({
      ...before,
      content: method === "undoContinue" ? "Base." : "Base.A.",
      reasoning: null,
      rawContent: null,
      macroFreezes: null,
    });
    await h.root.services.chat.continueTurn(args);
    const after = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, slot.selectedVariantId)).get();
    expect(after).toMatchObject({
      content: `${method === "undoContinue" ? "Base." : "Base.A."}B.`,
      tokensIn: 0,
      tokensOut: 0,
      cacheReadTokens: 0,
      reasoningTokens: 0,
      costUsd: 0,
      costProvenance: "measured",
      costDetails: { totalUsd: 0 },
      responseCache: { status: "miss", ageSeconds: 2, ttlSeconds: 300, sourceGenerationId: SOURCE_IDS[2] },
    });
    expect(f.replayHeaders).toEqual(kind === "hit" ? ["true", "false", "false", "false"] : ["true", "false", "false"]);
    expect(await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, source.id)).get()).toEqual(kind === "hit" ? source : after);
  },
);

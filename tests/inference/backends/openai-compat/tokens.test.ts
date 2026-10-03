// backends/openai-compat/tokens — word-keyed logit bias on the bytes: each server's tokenize endpoint and body, the
// per-(server, model, word) cache a turn reads (never one lookup per turn), its persistence and its forgetting.

import type { Capability } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { NO_PROVIDER_SECRETS } from "../../../../packages/inference/src/backends/kit/sanitize.ts";
import { runOpenAiCompatChatTurn } from "../../../../packages/inference/src/backends/openai-compat/chat.ts";
import type { TokenTarget } from "../../../../packages/inference/src/backends/openai-compat/tokens.ts";
import { createTokenLexicon } from "../../../../packages/inference/src/backends/openai-compat/tokens.ts";
import { curatedRows } from "../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../packages/inference/src/capability/synthesize.ts";
import { endpointTokensKey } from "../../../../packages/inference/src/catalog/keys.ts";
import type { ChatResult } from "../../../../packages/inference/src/contract/chat.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { testProviderId } from "../../../support/inference-identities.ts";
import { fakeApiKeySecret, fakeResolved, memoryStores } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { openAiTextStream, scriptedSseFetch } from "../_hosted-support.ts";

const NOW = 1_700_000_000_000;
const APP = { name: "orbweaver-test", url: "http://localhost:0" };
const BASE_URL = "http://box.local:8080/v1";
const SERVER_ROOT = "http://box.local:8080";
const MODEL = "local-model";

// What the fake server tokenizes each word to: one id per character code, so two words never collide.
function idsOf(word: string): number[] {
  return [...word].map((char) => char.codePointAt(0) ?? 0);
}

/** A local server answering its tokenize endpoint in each server's own shape (and a chat turn with "ok"),
 *  recording every tokenize call. A word in `refuse` answers 500. */
function tokenizeServer(calls: RecordedRequest[], chats: RecordedRequest[] = [], refuse: readonly string[] = []): typeof fetch {
  const chat = scriptedSseFetch([openAiTextStream("ok")], chats);
  return (input, init): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/chat/completions")) {
      return chat(input, init);
    }
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>;
    calls.push({ url, body });
    const word = String(body["content"] ?? body["prompt"] ?? "");
    if (refuse.includes(word)) {
      return Promise.resolve(Response.json({ error: "tokenizer offline" }, { status: 500 }));
    }
    const ids = idsOf(word);
    if (url.endsWith("/api/extra/tokenize")) {
      return Promise.resolve(Response.json({ value: ids.length, ids }));
    }
    if ("content" in body) {
      return Promise.resolve(Response.json({ tokens: ids.map((id) => ({ id, piece: String.fromCodePoint(id) })) }));
    }
    return Promise.resolve(Response.json({ count: ids.length, max_model_len: 4096, tokens: ids, token_strs: ids.map((id) => String.fromCodePoint(id)) }));
  };
}

function target(api: TokenTarget["api"], model = MODEL): TokenTarget {
  return { baseUrl: BASE_URL, model, api, secret: null, secrets: NO_PROVIDER_SECRETS };
}

function localCapability(providerId: string): Capability {
  return synthesizeCapability("generation", "other", { curated: curatedRows({ model: MODEL, providerId: testProviderId(providerId), wire: "openai-compat" }) })
    .capability;
}

function silentLog(): Parameters<typeof runOpenAiCompatChatTurn>[1]["log"] {
  const noop = (): void => undefined;
  return { debug: noop, info: noop, warn: noop, error: noop };
}

function droppedBias(turn: ChatResult): readonly string[] {
  return turn.events.flatMap((event) => (event.kind === "warning" && event.knob === "logitBias" ? [event.message] : []));
}

/** One chat turn on `providerId` at `model` through one shared lexicon; the server records what was posted. */
async function biasTurn(
  args: { readonly providerId: string; readonly model?: string; readonly params: UserIntent; readonly fetch: typeof fetch },
  lexicon: ReturnType<typeof createTokenLexicon>,
): Promise<ChatResult> {
  const model = args.model ?? MODEL;
  return await runOpenAiCompatChatTurn(
    {
      api: "chat-completions",
      connection: fakeResolved({
        task: "chat",
        providerId: args.providerId,
        model,
        capability: localCapability(args.providerId),
        baseUrl: BASE_URL,
        secret: fakeApiKeySecret("not-a-real-key"),
      }),
      params: args.params,
      systemPrompt: { static: "You narrate.", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "Go on." }] }],
    },
    { now: () => NOW, log: silentLog(), transport: { fetch: args.fetch, app: APP }, tokens: lexicon },
  );
}

test("each server is asked at its own tokenize endpoint, with no special tokens added", async () => {
  const calls: RecordedRequest[] = [];
  const lexicon = createTokenLexicon({ fetch: tokenizeServer(calls), snapshotStore: memoryStores().snapshotStore });
  await lexicon.lookup(target("llama-cpp"), ["hi"]);
  await lexicon.lookup(target("vllm", "vllm-model"), ["hi"]);
  await lexicon.lookup(target("koboldcpp", "kobold-model"), ["hi"]);
  expect(calls).toEqual([
    { url: `${SERVER_ROOT}/tokenize`, body: { content: "hi", add_special: false, parse_special: false, with_pieces: true, model: MODEL } },
    { url: `${SERVER_ROOT}/tokenize`, body: { model: "vllm-model", prompt: "hi", add_special_tokens: false, return_token_strs: true } },
    { url: `${SERVER_ROOT}/api/extra/tokenize`, body: { prompt: "hi", special: false } },
  ]);
});

test("a lookup answers ids and pieces; llama.cpp's byte-array piece reads as its hex bytes", async () => {
  const server: typeof fetch = () =>
    Promise.resolve(
      Response.json({
        tokens: [
          { id: 9, piece: [226, 150] },
          { id: 4, piece: "a" },
        ],
      }),
    );
  const lexicon = createTokenLexicon({ fetch: server, snapshotStore: memoryStores().snapshotStore });
  expect(await lexicon.lookup(target("llama-cpp"), ["x"])).toEqual([{ ok: true, word: "x", ids: [9, 4], pieces: ["<0xE2><0x96>", "a"] }]);
});

test("a vLLM turn sends a word as each of its token ids; the same preset's second turn makes no tokenize call; a model change asks once", async () => {
  const calls: RecordedRequest[] = [];
  const chats: RecordedRequest[] = [];
  const server = tokenizeServer(calls, chats);
  const lexicon = createTokenLexicon({ fetch: server, snapshotStore: memoryStores().snapshotStore });
  const params = { logitBias: { Elara: -100, "13": 5 } } satisfies UserIntent;

  const first = await biasTurn({ providerId: "vllm", params, fetch: server }, lexicon);
  expect(chats[0]?.body["logit_bias"]).toEqual({ "13": 5, "69": -100, "108": -100, "97": -100, "114": -100 });
  expect(droppedBias(first)).toEqual([]);
  expect(calls).toHaveLength(1);

  await biasTurn({ providerId: "vllm", params, fetch: server }, lexicon);
  expect(calls, "the second turn reads the cache").toHaveLength(1);
  expect(chats[1]?.body["logit_bias"]).toEqual(chats[0]?.body["logit_bias"]);

  await biasTurn({ providerId: "vllm", model: "another-model", params, fetch: server }, lexicon);
  expect(calls, "another model has its own tokenizer, asked once").toHaveLength(2);
  expect(calls[1]?.body["model"]).toBe("another-model");
});

test("KoboldCpp takes ids only too: its word bias resolves through /api/extra/tokenize", async () => {
  const calls: RecordedRequest[] = [];
  const chats: RecordedRequest[] = [];
  const server = tokenizeServer(calls, chats);
  const lexicon = createTokenLexicon({ fetch: server, snapshotStore: memoryStores().snapshotStore });
  await biasTurn({ providerId: "koboldcpp", params: { logitBias: { ok: 10 } }, fetch: server }, lexicon);
  expect(chats[0]?.body["logit_bias"]).toEqual({ "111": 10, "107": 10 });
  expect(calls.map((call) => call.url)).toEqual([`${SERVER_ROOT}/api/extra/tokenize`]);
});

test("llama.cpp takes word keys natively, so a turn sends the word as is and asks nothing", async () => {
  const calls: RecordedRequest[] = [];
  const chats: RecordedRequest[] = [];
  const server = tokenizeServer(calls, chats);
  const lexicon = createTokenLexicon({ fetch: server, snapshotStore: memoryStores().snapshotStore });
  await biasTurn({ providerId: "llama-cpp", params: { logitBias: { Elara: -50, "13": 5 } }, fetch: server }, lexicon);
  expect(chats[0]?.body["logit_bias"]).toEqual({ Elara: -50, "13": 5 });
  expect(calls).toEqual([]);
});

test("a word the server cannot tokenize is dropped with a warning, the turn still runs, and the failure is not cached", async () => {
  const calls: RecordedRequest[] = [];
  const chats: RecordedRequest[] = [];
  const server = tokenizeServer(calls, chats, ["Elara"]);
  const lexicon = createTokenLexicon({ fetch: server, snapshotStore: memoryStores().snapshotStore });
  const params = { logitBias: { Elara: -100, "13": 5 } } satisfies UserIntent;
  const turn = await biasTurn({ providerId: "vllm", params, fetch: server }, lexicon);
  expect(chats[0]?.body["logit_bias"]).toEqual({ "13": 5 });
  expect(droppedBias(turn)).toHaveLength(1);
  expect(droppedBias(turn)[0]).toContain('"Elara"');

  await biasTurn({ providerId: "vllm", params, fetch: server }, lexicon);
  expect(calls, "a failed word is asked again on the next turn").toHaveLength(2);
});

test("a server with no tokenize endpoint (Custom) drops each word key with a warning and keeps the id keys", async () => {
  const calls: RecordedRequest[] = [];
  const chats: RecordedRequest[] = [];
  const server = tokenizeServer(calls, chats);
  const lexicon = createTokenLexicon({ fetch: server, snapshotStore: memoryStores().snapshotStore });
  const turn = await biasTurn({ providerId: "custom-openai", params: { logitBias: { Elara: -100, "13": 5 } }, fetch: server }, lexicon);
  expect(chats[0]?.body["logit_bias"]).toEqual({ "13": 5 });
  expect(droppedBias(turn)).toHaveLength(1);
  expect(calls).toEqual([]);
});

test("the cache persists beside the endpoint facts: a new lexicon over the same store asks nothing", async () => {
  const calls: RecordedRequest[] = [];
  const store = memoryStores().snapshotStore;
  await createTokenLexicon({ fetch: tokenizeServer(calls), snapshotStore: store }).lookup(target("vllm"), ["hi"]);
  expect([...store.entries.keys()]).toEqual([endpointTokensKey(BASE_URL, MODEL)]);

  const restarted = createTokenLexicon({ fetch: tokenizeServer(calls), snapshotStore: store });
  expect(await restarted.lookup(target("vllm"), ["hi"])).toEqual([{ ok: true, word: "hi", ids: [104, 105], pieces: ["h", "i"] }]);
  expect(calls).toHaveLength(1);
});

test("forget drops one server's lookups in memory and in the store, and leaves another server's", async () => {
  const calls: RecordedRequest[] = [];
  const store = memoryStores().snapshotStore;
  const lexicon = createTokenLexicon({ fetch: tokenizeServer(calls), snapshotStore: store });
  const other: TokenTarget = { ...target("vllm"), baseUrl: "http://other.local:8000/v1" };
  await lexicon.lookup(target("vllm"), ["hi"]);
  await lexicon.lookup(other, ["hi"]);

  await lexicon.forget(BASE_URL);
  expect([...store.entries.keys()]).toEqual([endpointTokensKey(other.baseUrl, MODEL)]);
  await lexicon.lookup(target("vllm"), ["hi"]);
  await lexicon.lookup(other, ["hi"]);
  expect(calls, "only the forgotten server is asked again").toHaveLength(3);
});

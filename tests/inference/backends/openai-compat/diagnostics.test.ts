// The LIVE OpenAI-compatible credential probe. These pins replace the retired server-local `/models`
// classifier with the behavior the provider runtime actually calls: auth refusals revoke, every other
// failure is unreachable, and no upstream prose may carry configured credential literals to the result.

// @orb-waive-file no-test-fabrication(Record<string, unknown>): baselined when the gate widened to value casts; burn-down item 906.
import { runOpenAiCompatChatTurn } from "#inference/backends/openai-compat/chat.ts";
import { inspectOpenAiCompatEndpoint, probeOpenAiCompat } from "#inference/backends/openai-compat/diagnostics.ts";
import type { OpenAiCompatChatRequest } from "#inference/contract/chat.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeApiKeySecret, fakeResolved, memoryTokenLexicon } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { generationCapability } from "../_hosted-support.ts";

const NOW = 1_700_000_000_000;
const API_KEY = "sk-probe-not-a-real-key";
const HEADER_SECRET = "header-probe-not-a-real-secret";

function connection(): Parameters<typeof probeOpenAiCompat>[0]["connection"] {
  return fakeResolved({
    task: "chat",
    providerId: "custom-openai",
    model: "m",
    capability: generationCapability(),
    baseUrl: "https://byo.example.com/v1",
    secret: fakeApiKeySecret(API_KEY),
    transport: { headers: { "x-api-key": HEADER_SECRET } },
  });
}

function responseFetch(status: number, body: string, capture?: { url?: string; headers?: Headers }): typeof fetch {
  return (input, init) => {
    if (capture !== undefined) {
      capture.url = String(input);
      capture.headers = new Headers(init?.headers);
    }
    return Promise.resolve(new Response(body, { status, headers: { "content-type": "application/json" } }));
  };
}

test.each([401, 403])("an authenticated HTTP %s refusal is revoked and its reason is credential-safe", async (status) => {
  const seen: { url?: string; headers?: Headers } = {};
  const body = JSON.stringify({ error: `<b>Bearer ${API_KEY}</b> custom=${HEADER_SECRET}` });

  const health = await probeOpenAiCompat({ connection: connection() }, { fetch: responseFetch(status, body, seen), now: () => NOW });

  expect(seen.url).toBe("https://byo.example.com/v1/models");
  expect(seen.headers?.get("authorization")).toBe(`Bearer ${API_KEY}`);
  expect(seen.headers?.get("x-api-key")).toBe(HEADER_SECRET);
  expect(health).toMatchObject({ status: "revoked", checkedAt: NOW });
  if (health.status !== "revoked") {
    throw new Error(`expected revoked credential health, received ${health.status}`);
  }
  expect(health.reason).toContain(`HTTP ${status}`);
  expect(health.reason).not.toContain(API_KEY);
  expect(health.reason).not.toContain(HEADER_SECRET);
  expect(health.reason).not.toContain("<b>");
});

test("a non-auth HTTP 500 is unreachable, not the retired unchecked verdict", async () => {
  const body = JSON.stringify({ error: "temporary outage: invalid api key cache is unavailable" });

  const health = await probeOpenAiCompat({ connection: connection() }, { fetch: responseFetch(500, body), now: () => NOW });

  expect(health).toMatchObject({ status: "unreachable", checkedAt: NOW });
  if (health.status !== "unreachable") {
    throw new Error(`expected unreachable credential health, received ${health.status}`);
  }
  expect(health.reason).toContain("HTTP 500");
  expect(health.reason).toContain("invalid api key cache is unavailable");
});

// "Check again" told a 404 the server may be down. A server that answered carries its status, so the pane can
// say it is running and a wrong path is a 404; a dial nothing answered carries none.
test("an unreachable verdict carries the status when the server answered, and none when nothing did", async () => {
  const answered = await probeOpenAiCompat({ connection: connection() }, { fetch: responseFetch(404, JSON.stringify({ error: "not found" })), now: () => NOW });
  expect(answered).toMatchObject({ status: "unreachable", httpStatus: 404 });

  const dead: typeof fetch = () => Promise.reject(new TypeError("fetch failed"));
  const silent = await probeOpenAiCompat({ connection: connection() }, { fetch: dead, now: () => NOW });
  expect(silent.status).toBe("unreachable");
  expect(silent).not.toHaveProperty("httpStatus");
});

// ── the inspector rides the route chat uses (D310) ──────────────────────────────────────────────────────

const APP = { name: "t", url: "http://localhost:0" };
const OLLAMA_BASE = "http://127.0.0.1:11434/v1";
const OLLAMA_WINDOW = 8192;
const OLLAMA_REPLY = JSON.stringify({ model: "qwen2.5:0.5b", message: { role: "assistant", content: "p" }, done: true, ["done_reason"]: "length" });
const OPENAI_REPLY = JSON.stringify({
  id: "c1",
  object: "chat.completion",
  created: 1,
  model: "m",
  choices: [{ index: 0, message: { role: "assistant", content: "p" }, ["finish_reason"]: "length" }],
});

function silentLog(): Parameters<typeof runOpenAiCompatChatTurn>[1]["log"] {
  const noop = (): void => undefined;
  return { debug: noop, info: noop, warn: noop, error: noop };
}

/** Answers every send with `reply` as JSON and records where each went and what it carried. */
function answering(reply: string, recorded: RecordedRequest[]): typeof fetch {
  return (input, init) => {
    recorded.push({ url: String(input), body: JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown> });
    return Promise.resolve(new Response(reply, { status: 200, headers: { "content-type": "application/json" } }));
  };
}

/** One chat turn and one inspection on the same row; each returns the first send it made. */
async function chatAndInspect(
  row: OpenAiCompatChatRequest["connection"],
  reply: string,
): Promise<{ chat: RecordedRequest | undefined; inspect: RecordedRequest | undefined; ok: boolean }> {
  const chatSends: RecordedRequest[] = [];
  const turn: OpenAiCompatChatRequest = {
    api: "chat-completions",
    connection: row,
    params: { temperature: 0.8, maxOutputTokens: 64 },
    systemPrompt: { static: "", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "Say hello." }] }],
  };
  await runOpenAiCompatChatTurn(turn, {
    now: () => NOW,
    log: silentLog(),
    transport: { fetch: answering(reply, chatSends), app: APP },
    tokens: memoryTokenLexicon(),
  }).catch(() => undefined);
  const inspectSends: RecordedRequest[] = [];
  const inspection = await inspectOpenAiCompatEndpoint({ connection: row }, { fetch: answering(reply, inspectSends), app: APP });
  return { chat: chatSends[0], inspect: inspectSends[0], ok: inspection.ok };
}

test("an Ollama row's test request rides the native /api/chat route its chat turn takes, with the same native shaping", async () => {
  const row = fakeResolved({
    task: "chat",
    providerId: "ollama",
    model: "qwen2.5:0.5b",
    capability: generationCapability({ reasoning: { mode: "none", enabled: false }, context: { window: OLLAMA_WINDOW } }),
    baseUrl: OLLAMA_BASE,
  });
  const { chat, inspect, ok } = await chatAndInspect(row, OLLAMA_REPLY);
  expect(chat?.url).toBe("http://127.0.0.1:11434/api/chat");
  expect(inspect?.url).toBe(chat?.url);
  // The native translation ran on both: the window as num_ctx, the cap as num_predict, no OpenAI-only cap key.
  expect(inspect?.body["options"]).toMatchObject({ ["num_ctx"]: OLLAMA_WINDOW, ["num_predict"]: 1 });
  expect(chat?.body["options"]).toMatchObject({ ["num_ctx"]: OLLAMA_WINDOW });
  expect(Object.hasOwn(inspect?.body ?? {}, "max_tokens")).toBe(false);
  expect(ok).toBe(true);
});

test("a Custom row's test request rides /v1/chat/completions with the row's own body, as its chat turn does", async () => {
  const row = fakeResolved({
    task: "chat",
    providerId: "custom-openai",
    model: "m",
    capability: generationCapability(),
    baseUrl: "https://byo.example.com/v1",
    secret: fakeApiKeySecret(API_KEY),
    extras: { ["mirostat_tau"]: 5 },
    declaredFeatures: { outputCapField: "max_completion_tokens" },
  });
  const { chat, inspect, ok } = await chatAndInspect(row, OPENAI_REPLY);
  expect(chat?.url).toBe("https://byo.example.com/v1/chat/completions");
  expect(inspect?.url).toBe(chat?.url);
  // The body shaper ran on both: the user's extras ride, and the cap uses the row's spelling.
  expect(chat?.body["mirostat_tau"]).toBe(5);
  expect(inspect?.body["mirostat_tau"]).toBe(5);
  expect(inspect?.body["max_completion_tokens"]).toBe(1);
  expect(Object.hasOwn(inspect?.body ?? {}, "max_tokens")).toBe(false);
  expect(ok).toBe(true);
});

test("a test request whose 2xx reply the chat path cannot read is not ok, and says why", async () => {
  const row = connection();
  const inspection = await inspectOpenAiCompatEndpoint({ connection: row }, { fetch: responseFetch(200, "not json at all"), app: APP });
  expect(inspection.ok).toBe(false);
  expect(inspection.response?.status).toBe(200);
  expect(inspection.response?.bodyPreview).toBe("not json at all");
  expect(inspection.error).toBeDefined();
});

// The test fails as fast as a chat turn would: the row's own idle bound ends a hung endpoint.
test("a hung endpoint fails the test request within the row's requestTimeoutMs, not at the transport's own timeout", async () => {
  const idleMs = 50;
  const row = fakeResolved({
    task: "chat",
    providerId: "custom-openai",
    model: "m",
    capability: generationCapability(),
    baseUrl: "https://byo.example.com/v1",
    secret: fakeApiKeySecret(API_KEY),
    declaredFeatures: { requestTimeoutMs: idleMs },
  });
  const hung: typeof fetch = (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(init.signal?.reason);
      });
    });

  const inspection = await inspectOpenAiCompatEndpoint({ connection: row }, { fetch: hung, app: APP });

  expect(inspection.ok).toBe(false);
  expect(inspection.error).toContain(`${idleMs} ms`);
});

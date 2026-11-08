// "Send a test request" rides the route and the body shaper a chat turn uses, so a green test means chat works.
// @subject packages/inference/src/backends/openai-compat/diagnostics.ts

import { toError } from "@orb/kit/error-message";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { RecordedRequest } from "@orb/testkit/node/helpers";
import { openAiServer, recordRequest } from "@orb/testkit/node/helpers";
import { createRuntimeRoot, generationCapability, observeRuntimeTimers, wireConnection } from "../../roles/runtime.fixtures.ts";

const OLLAMA_WINDOW = 8192;
const OLLAMA_BASE = "http://127.0.0.1:11434/v1";
const OLLAMA_REPLY = { model: "qwen2.5:0.5b", message: { role: "assistant", content: "p" }, done: true, ["done_reason"]: "length" };
const HELLO = [{ role: "user" as const, content: [{ type: "text" as const, text: "Say hello." }] }];

function bodyOf(inspectedBody: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(inspectedBody);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("the inspector showed a body that is not an object");
  }
  return Object.fromEntries(Object.entries(parsed));
}

test("an Ollama row's test request takes the native route its chat turn takes, with the same native shaping", async () => {
  const recorded: RecordedRequest[] = [];
  const native: typeof fetch = async (input, init) => {
    const request = await recordRequest(input, init);
    recorded.push(request);
    // Ollama answers a streamed request with NDJSON lines and a `stream: false` request with one JSON object.
    return request.body["stream"] === false
      ? Response.json(OLLAMA_REPLY)
      : new Response(`${JSON.stringify(OLLAMA_REPLY)}\n`, { headers: { "content-type": "application/x-ndjson" } });
  };
  await using root = await createRuntimeRoot({ providerFetch: native });
  const connection = await wireConnection(root, {
    task: "chat",
    providerId: "ollama",
    model: "qwen2.5:0.5b",
    baseUrl: OLLAMA_BASE,
    capability: generationCapability({ reasoning: { mode: "none", enabled: false }, context: { window: OLLAMA_WINDOW } }),
  });

  await root.app.runtime.executor
    .runChatTurn({ api: "chat-completions", connection, params: { temperature: 0.8 }, systemPrompt: { static: "", dynamic: "" }, history: HELLO })
    .catch(() => undefined);
  const inspection = await root.app.runtime.diagnostics.inspect({ connection });

  const [chat, inspected] = recorded;
  expect(chat?.url).toBe("http://127.0.0.1:11434/api/chat");
  expect(inspected?.url).toBe(chat?.url);
  expect(inspection.request.url).toBe(chat?.url);
  expect(inspected?.body["options"]).toMatchObject({ ["num_ctx"]: OLLAMA_WINDOW, ["num_predict"]: 1 });
  expect(chat?.body["options"]).toMatchObject({ ["num_ctx"]: OLLAMA_WINDOW });
  expect(present(inspected).body).not.toHaveProperty("max_tokens");
  expect(inspection).toMatchObject({ ok: true });
});

test("a Custom row's test request takes /chat/completions with the row's own body, as its chat turn does", async () => {
  const recorded: RecordedRequest[] = [];
  using server = openAiServer(recorded, () => ({}), 2);
  await using root = await createRuntimeRoot({ providerFetch: server.execute });
  const connection = await wireConnection(root, {
    task: "chat",
    providerId: "custom-openai",
    model: "m",
    capability: generationCapability({ reasoning: { mode: "none", enabled: false } }),
    extras: { ["mirostat_tau"]: 5 },
    declaredFeatures: { outputCapField: "max_completion_tokens" },
  });

  await root.app.runtime.executor.runChatTurn({
    api: "chat-completions",
    connection,
    params: { maxOutputTokens: 64 },
    systemPrompt: { static: "", dynamic: "" },
    history: HELLO,
  });
  const inspection = await root.app.runtime.diagnostics.inspect({ connection });

  const [chat, inspected] = recorded;
  expect(chat?.url).toMatch(/\/v1\/chat\/completions$/u);
  expect(inspected?.url).toBe(chat?.url);
  expect(chat?.body["mirostat_tau"]).toBe(5);
  expect(inspected?.body["mirostat_tau"]).toBe(5);
  expect(inspected?.body["max_completion_tokens"]).toBe(1);
  expect(present(inspected).body).not.toHaveProperty("max_tokens");
  expect(bodyOf(inspection.request.body)).toEqual(inspected?.body);
  expect(inspection.ok).toBe(true);
});

test("a 2xx reply the chat path cannot read is not ok, shows the reply and says why", async () => {
  const unreadable: typeof fetch = () => Promise.resolve(new Response("not json at all", { status: 200, headers: { "content-type": "application/json" } }));
  await using root = await createRuntimeRoot({ providerFetch: unreadable });
  const connection = await wireConnection(root, { task: "chat", providerId: "custom-openai", model: "m", capability: generationCapability() });

  const inspection = await root.app.runtime.diagnostics.inspect({ connection });

  expect(inspection.ok).toBe(false);
  expect(inspection.response).toMatchObject({ status: 200, bodyPreview: "not json at all" });
  expect(inspection.error).toBeDefined();
});

test("a hung endpoint fails the test request at the row's request timeout, as it would fail a chat turn", async () => {
  const idleMs = 50;
  const timer = observeRuntimeTimers();
  const hung: typeof fetch = (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(toError(init.signal?.reason)));
    });
  await using root = await createRuntimeRoot({ providerFetch: hung, timers: timer.timers });
  const connection = await wireConnection(root, {
    task: "chat",
    providerId: "custom-openai",
    model: "m",
    capability: generationCapability(),
    declaredFeatures: { requestTimeoutMs: idleMs },
  });
  const cancel = new AbortController();
  const outcome = root.app.runtime.diagnostics.inspect({ connection, signal: cancel.signal });
  await using _cleanup = {
    async [Symbol.asyncDispose](): Promise<void> {
      cancel.abort();
      await outcome.catch(() => undefined);
    },
  };

  const idle = await timer.next((window) => window.ms === idleMs, cancel.signal);
  idle.fire();
  const inspection = await outcome;

  expect(inspection.ok).toBe(false);
  expect(inspection.error).toContain(`${idleMs} ms`);
});

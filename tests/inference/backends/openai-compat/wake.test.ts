// A row whose server sleeps (vLLM's `features.sleep` pair) is woken before a task is sent to it: the availability read
// calls a sleeping engine available because it wakes on the turn, so the turn must do the waking. Fakes only.

import type { Resolved } from "@orb/inference";
import { createInferenceRuntime } from "@orb/inference";
import { principal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeConnection, fakeDeps, memoryStores, newUserId } from "../../_support.ts";

const BASE_URL = "http://engine.test:8000";
const MODEL = "qwen3-8b";

function isChat(resolved: Resolved): resolved is Resolved<"chat"> {
  return resolved.task === "chat";
}

function chunk(delta: Record<string, unknown>, finish: string | null): string {
  const data = { id: "c1", object: "chat.completion.chunk", created: 1, model: MODEL, choices: [{ index: 0, delta, finish_reason: finish }] };
  return `data: ${JSON.stringify(data)}\n\n`;
}

/** A vLLM engine in sleep mode: it refuses work until `/wake_up` is posted. Records each request as `METHOD path`. */
function sleepingEngine(): { readonly fetch: typeof fetch; readonly requests: string[] } {
  let sleeping = true;
  const requests: string[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    requests.push(`${method} ${url.pathname}`);
    if (url.pathname === "/is_sleeping") {
      return Promise.resolve(Response.json({ is_sleeping: sleeping }));
    }
    if (url.pathname === "/wake_up") {
      sleeping = false;
      return Promise.resolve(new Response(null, { status: 200 }));
    }
    if (sleeping) {
      return Promise.resolve(new Response("the engine is sleeping", { status: 503 }));
    }
    if (url.pathname === "/v1/models") {
      return Promise.resolve(Response.json({ object: "list", data: [{ id: MODEL, object: "model", max_model_len: 8192 }] }));
    }
    if (url.pathname === "/v1/chat/completions") {
      const body = `${chunk({ role: "assistant", content: "awake and answering" }, null)}${chunk({}, "stop")}data: [DONE]\n\n`;
      return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  };
  return { fetch: fetchImpl, requests };
}

test("a sleeping engine reads available, and the turn wakes it before sending, then answers", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "vllm", model: MODEL, baseUrl: BASE_URL });
  stores.connections.rows.set(row.id, row);
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "chat", connectionId: row.id });
  const engine = sleepingEngine();
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: engine.fetch }));
  const asker = principal(ownerId);

  expect(await runtime.availability({ task: "chat", principal: asker })).toEqual({ available: true });
  const { resolved } = await runtime.resolve({ task: "chat", principal: asker });
  if (!isChat(resolved)) {
    throw new Error("expected a chat resolve");
  }
  const turn = await runtime.executor.runChatTurn({
    api: "chat-completions",
    connection: resolved,
    params: {},
    systemPrompt: { static: "You are terse.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "Are you there?" }] }],
  });

  expect(turn.reply).toBe("awake and answering");
  const wake = engine.requests.indexOf("POST /wake_up");
  expect(wake, "the turn posted the wake path").toBeGreaterThanOrEqual(0);
  expect(engine.requests.indexOf("POST /v1/chat/completions")).toBeGreaterThan(wake);
});

// A row whose server sleeps (vLLM's `features.sleep` pair) is woken before a task is sent to it: the availability read
// calls a sleeping engine available because it wakes on the turn, so the turn must do the waking. Fakes only.

import type { ChatResult, Resolved } from "@orb/inference";
import { createInferenceRuntime } from "@orb/inference";
import { createReachabilityProber } from "../../../../packages/inference/src/backends/openai-compat/reachability.ts";
import { createFrozenClock } from "../../../support/clock.ts";
import { principal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeConnection, fakeDeps, memoryStores, newUserId } from "../../_support.ts";

const BASE_URL = "http://engine.test:8000";
const MODEL = "qwen3-8b";
const CHAT_PATH = "POST /v1/chat/completions";

function isChat(resolved: Resolved): resolved is Resolved<"chat"> {
  return resolved.task === "chat";
}

function chunk(delta: Record<string, unknown>, finish: string | null): string {
  const data = { id: "c1", object: "chat.completion.chunk", created: 1, model: MODEL, choices: [{ index: 0, delta, finish_reason: finish }] };
  return `data: ${JSON.stringify(data)}\n\n`;
}

interface Engine {
  readonly fetch: typeof fetch;
  readonly requests: string[];
  sleeping: boolean;
  /** Sleep reads the engine still answers asleep after a wake is posted. */
  wakeLag: number;
}

/** What the engine answers outside its sleep pair. Its model list names vLLM as the owner, as vLLM's does, and is
 *  served asleep or awake. */
function engineAnswer(path: string, sleeping: boolean): Response {
  if (path === "/v1/models") {
    return Response.json({ object: "list", data: [{ id: MODEL, object: "model", ["owned_by"]: "vllm", ["max_model_len"]: 8192 }] });
  }
  if (sleeping) {
    return new Response("the engine is sleeping", { status: 503 });
  }
  if (path === "/v1/chat/completions") {
    const body = `${chunk({ role: "assistant", content: "awake and answering" }, null)}${chunk({}, "stop")}data: [DONE]\n\n`;
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  }
  return new Response("not found", { status: 404 });
}

/** A vLLM engine that may be in sleep mode: it refuses work until `/wake_up` is posted and its sleep read says awake.
 *  Records each request as `METHOD path`. */
function engine(sleeping: boolean): Engine {
  let waking = false;
  const sleepAnswer = (path: string): Response | null => {
    if (path === "/is_sleeping") {
      if (waking && state.wakeLag === 0) {
        state.sleeping = false;
      }
      state.wakeLag = Math.max(0, state.wakeLag - 1);
      return Response.json({ is_sleeping: state.sleeping });
    }
    if (path === "/wake_up") {
      waking = true;
      state.sleeping = state.wakeLag > 0;
      return new Response(null, { status: 200 });
    }
    return null;
  };
  const state: Engine = {
    sleeping,
    wakeLag: 0,
    requests: [],
    fetch: (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      state.requests.push(`${method} ${url.pathname}`);
      return Promise.resolve(sleepAnswer(url.pathname) ?? engineAnswer(url.pathname, state.sleeping));
    },
  };
  return state;
}

interface BoundEngine {
  readonly runtime: Awaited<ReturnType<typeof createInferenceRuntime>>;
  readonly asker: ReturnType<typeof principal>;
  readonly turn: (signal?: AbortSignal) => Promise<ChatResult>;
  readonly resolved: Resolved<"chat">;
}

interface BindOptions {
  readonly now?: () => number;
  readonly providerId?: string;
  readonly baseUrl?: string;
}

async function boundEngine(eng: Engine, options: BindOptions = {}): Promise<BoundEngine> {
  const { now, providerId = "vllm", baseUrl = BASE_URL } = options;
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId, model: MODEL, baseUrl });
  stores.connections.rows.set(row.id, row);
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "chat", connectionId: row.id });
  const runtime = await createInferenceRuntime({ ...fakeDeps({ stores, fetch: eng.fetch }), ...(now === undefined ? {} : { now }) });
  const asker = principal(ownerId);
  const { resolved } = await runtime.resolve({ task: "chat", principal: asker });
  if (!isChat(resolved)) {
    throw new Error("expected a chat resolve");
  }
  const turn = (signal?: AbortSignal): Promise<ChatResult> =>
    runtime.executor.runChatTurn({
      api: "chat-completions",
      connection: resolved,
      params: {},
      systemPrompt: { static: "You are terse.", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "Are you there?" }] }],
      ...(signal === undefined ? {} : { signal }),
    });
  return { runtime, asker, turn, resolved };
}

test("a sleeping engine reads available, and the turn wakes it before sending, then answers", async () => {
  const eng = engine(true);
  const { runtime, asker, turn } = await boundEngine(eng);

  expect(await runtime.availability({ task: "chat", principal: asker })).toEqual({ available: true });
  const answer = await turn();

  expect(answer.reply).toBe("awake and answering");
  const wake = eng.requests.indexOf("POST /wake_up");
  expect(wake, "the turn posted the wake path").toBeGreaterThanOrEqual(0);
  expect(eng.requests.indexOf(CHAT_PATH)).toBeGreaterThan(wake);
});

// The availability read caches "up" for a few seconds; an engine put to sleep inside that window must still be woken,
// because a sleeping vLLM queues a request without answering.
test("an engine that falls asleep after an availability read is asked again, and woken, before the turn", async () => {
  const eng = engine(false);
  let clock = 1_700_000_000_000;
  const { runtime, asker, turn } = await boundEngine(eng, { now: () => clock });
  expect(await runtime.availability({ task: "chat", principal: asker })).toEqual({ available: true });
  eng.sleeping = true;
  clock += 5000;
  eng.requests.length = 0;

  await turn();

  expect(eng.requests[0]).toBe("GET /is_sleeping");
  expect(eng.requests[1]).toBe("POST /wake_up");
  expect(eng.requests.at(-1)).toBe(CHAT_PATH);
});

test("a cancel while the engine wakes stops the turn at once with an aborted error, and nothing is sent", async () => {
  const eng = engine(true);
  eng.wakeLag = 4;
  const { turn } = await boundEngine(eng);
  eng.requests.length = 0;
  const controller = new AbortController();
  setTimeout(() => {
    controller.abort();
  }, 50);
  // @orb-waive test-determinism(performance.now): the subject is how soon a cancel stops a real-time wake poll.
  const started = performance.now();

  await expect(turn(controller.signal)).rejects.toMatchObject({ kind: "aborted" });

  // @orb-waive test-determinism(performance.now): the subject is how soon a cancel stops a real-time wake poll.
  expect(performance.now() - started).toBeLessThan(500);
  expect(eng.requests).toContain("POST /wake_up");
  expect(eng.requests).not.toContain(CHAT_PATH);
});

// Nothing outside the app tells it a server is vLLM: a Custom connection learns it from the server itself.
test("a vLLM server added as a Custom connection is detected as vLLM and carries its sleep pair", async () => {
  const { resolved } = await boundEngine(engine(false), { providerId: "custom-openai" });

  expect(resolved.features.sleep).toEqual({ isSleepingPath: "/is_sleeping", wakePath: "/wake_up" });
});

test("a sleeping vLLM server added as a Custom connection is woken before the turn is sent", async () => {
  const eng = engine(true);
  const { turn } = await boundEngine(eng, { providerId: "custom-openai" });

  const answer = await turn();

  expect(answer.reply).toBe("awake and answering");
  const wake = eng.requests.indexOf("POST /wake_up");
  expect(wake, "the turn posted the wake path").toBeGreaterThanOrEqual(0);
  expect(eng.requests.indexOf(CHAT_PATH)).toBeGreaterThan(wake);
});

test("concurrent turns on one sleeping engine share one wake, and each is sent once it is awake", async () => {
  const eng = engine(true);
  eng.wakeLag = 1;
  const { turn } = await boundEngine(eng);
  eng.requests.length = 0;

  const answers = await Promise.all([turn(), turn(), turn()]);

  expect(answers.map((answer) => answer.reply)).toEqual(["awake and answering", "awake and answering", "awake and answering"]);
  expect(eng.requests.filter((request) => request === "POST /wake_up")).toHaveLength(1);
  expect(eng.requests.filter((request) => request === CHAT_PATH)).toHaveLength(3);
});

// vLLM serves its sleep pair at the server root only; a base URL typed with `/v1` must still reach it.
for (const providerId of ["vllm", "custom-openai"]) {
  test(`a sleeping ${providerId} row whose base URL ends in /v1 is woken at the server root before the turn`, async () => {
    const eng = engine(true);
    const { turn } = await boundEngine(eng, { providerId, baseUrl: `${BASE_URL}/v1` });
    eng.requests.length = 0;

    const answer = await turn();

    expect(answer.reply).toBe("awake and answering");
    expect(eng.requests.slice(0, 2)).toEqual(["GET /is_sleeping", "POST /wake_up"]);
    expect(eng.requests.at(-1)).toBe(CHAT_PATH);
  });
}

test("one server's base URL spellings share one wake", async () => {
  const eng = engine(true);
  eng.wakeLag = 1;
  const prober = createReachabilityProber({ fetch: eng.fetch, now: createFrozenClock().now });
  const spellings = [BASE_URL, `${BASE_URL}/`, `${BASE_URL}/v1`];

  const woke = await Promise.all(
    spellings.map((baseUrl) => prober.wake({ baseUrl, secret: null, headers: undefined, sleepPath: "/is_sleeping", wakePath: "/wake_up" }, undefined)),
  );

  expect(woke).toEqual([true, true, true]);
  expect(eng.requests.filter((request) => request === "POST /wake_up")).toHaveLength(1);
});

test("all cancelled wake waiters own the rejection and a later task starts a fresh flight", async () => {
  const eng = engine(true);
  eng.wakeLag = 4;
  const prober = createReachabilityProber({ fetch: eng.fetch, now: createFrozenClock().now });
  const target = { baseUrl: BASE_URL, secret: null, headers: undefined, sleepPath: "/is_sleeping", wakePath: "/wake_up" };
  const controller = new AbortController();
  const first = prober.wake(target, controller.signal);
  const second = prober.wake(target, controller.signal);
  const outcomes = Promise.allSettled([first, second]);
  controller.abort();
  for (const outcome of await outcomes) {
    expect(outcome).toMatchObject({ status: "rejected", reason: { kind: "aborted" } });
  }
  eng.wakeLag = 0;
  expect(await prober.wake(target, undefined)).toBe(true);
  expect(eng.requests.filter((request) => request === "POST /wake_up")).toHaveLength(2);
});

test("an already-cancelled waiter stops its owned flight before a subsequent wake", async () => {
  const eng = engine(true);
  const prober = createReachabilityProber({ fetch: eng.fetch, now: createFrozenClock().now });
  const target = { baseUrl: BASE_URL, secret: null, headers: undefined, sleepPath: "/is_sleeping", wakePath: "/wake_up" };
  const controller = new AbortController();
  controller.abort();
  await expect(prober.wake(target, controller.signal)).rejects.toMatchObject({ kind: "aborted" });
  expect(await prober.wake(target, undefined)).toBe(true);
});

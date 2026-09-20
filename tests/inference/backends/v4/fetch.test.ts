// backends/v4/fetch — the four non-body controls that survive the SDK cut-over (§8.1): the redirect
// HOST-PIN (any 3xx is a hard non-retryable error, never followed — the Authorization header would ride to
// the attacker's host), the 64 KiB error-body cap, the by-value secret scrub on the wire capture (a
// `transport.includeBody` key-in-body credential must not reach the ring), and the `responseMap` /
// `reasoningKeys` reshape that lands a non-OpenAI reply on the SDK's schema BEFORE it parses.

import type { Wire } from "@orb/contracts/inference";
import { resolvedScrubSet } from "../../../../packages/inference/src/backends/kit/sanitize.ts";
import type { WrapFetchArgs } from "../../../../packages/inference/src/backends/v4/fetch.ts";
import { wrapFetch } from "../../../../packages/inference/src/backends/v4/fetch.ts";
import type { WireCaptureSink } from "../../../../packages/inference/src/contract/backend.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import { expect, test } from "../../../support/fixtures.ts";

const SECRET = "sk-live-super-secret";
const secrets = resolvedScrubSet({ credential: { secret: SECRET }, transport: { includeBody: { api_key: SECRET } } });

function wrap(fetchImpl: typeof fetch, overrides: Partial<WrapFetchArgs> = {}): typeof fetch {
  return wrapFetch({ fetch: fetchImpl, secrets, label: "test", responseMap: undefined, reasoningKeys: undefined, ...overrides });
}

function respond(body: string, init: ResponseInit): typeof fetch {
  return () => Promise.resolve(new Response(body, init));
}

test("host pin: every request goes out with redirect: manual, and a 3xx is a hard non-retryable error", async () => {
  let seenInit: RequestInit | undefined;
  const upstream: typeof fetch = (_input, init) => {
    seenInit = init;
    return Promise.resolve(Response.redirect("https://attacker.example/steal", 302));
  };
  const fetchImpl = wrap(upstream);
  const err = await fetchImpl("https://api.example/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "m" }) }).catch((e: unknown) => e);
  expect(seenInit?.redirect).toBe("manual");
  expect(err).toBeInstanceOf(ProviderError);
  expect(err).toMatchObject({ kind: "invalid", retryable: false, apiErrorStatus: 302 });
});

test("an error body is capped at 64 KiB and scrubbed before the SDK reads it", async () => {
  const huge = `${"x".repeat(70_000)}${SECRET}`;
  const fetchImpl = wrap(respond(huge, { status: 500 }));
  const res = await fetchImpl("https://api.example/v1/x", { method: "POST" });
  const text = await res.text();
  expect(res.status).toBe(500);
  expect(text.length).toBeLessThanOrEqual(65_536);
  expect(text).not.toContain(SECRET);
  const short = wrap(respond(`{"error":{"message":"bad key ${SECRET}"}}`, { status: 401 }));
  expect(await (await short("https://api.example/v1/x", { method: "POST" })).text()).not.toContain(SECRET);
});

test("the wire capture is secret-scrubbed by value, including a key-in-body credential", async () => {
  const captured: Parameters<WireCaptureSink>[0][] = [];
  const sink: WireCaptureSink = (entry) => {
    captured.push(entry);
  };
  const fetchImpl = wrap(respond("{}", { status: 200 }), {
    capture: { sink, chatId: undefined, api: "chat-completions", wire: "openai-compat" satisfies Wire, providerId: "custom-openai", model: "m" },
  });
  await fetchImpl("https://box.local/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: "m", api_key: SECRET, messages: [{ role: "user", content: `hi ${SECRET}` }] }),
  });
  expect(captured).toHaveLength(1);
  expect(JSON.stringify(captured[0]?.body)).not.toContain(SECRET);
  expect(captured[0]?.body["model"]).toBe("m");
});

test("shapeBody rewrites the outbound body once (the openrouter transport's post-convert hook)", async () => {
  let sent: string | undefined;
  const upstream: typeof fetch = (_input, init) => {
    sent = typeof init?.body === "string" ? init.body : undefined;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const fetchImpl = wrap(upstream, { shapeBody: (body) => ({ ...body, shaped: true }) });
  await fetchImpl("https://openrouter.ai/api/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "m" }) });
  expect(JSON.parse(sent ?? "{}")).toEqual({ model: "m", shaped: true });
});

test("responseMap reshapes a non-OpenAI JSON body onto the SDK's shape", async () => {
  const body = JSON.stringify({ id: "r1", output: { text: "hello", thought: "hmm" }, done: "end", stats: { in: 3, out: 5 } });
  const fetchImpl = wrap(respond(body, { status: 200, headers: { "content-type": "application/json" } }), {
    responseMap: {
      contentPath: "output.text",
      reasoningPath: "output.thought",
      finishReasonPath: "done",
      promptTokensPath: "stats.in",
      completionTokensPath: "stats.out",
    },
  });
  const res = await fetchImpl("https://box.local/v1/chat/completions", { method: "POST" });
  const json = (await res.json()) as Record<string, unknown>;
  expect(json).toEqual({
    id: "r1",
    choices: [{ message: { content: "hello", reasoning_content: "hmm", role: "assistant" }, finish_reason: "end" }],
    usage: { prompt_tokens: 3, completion_tokens: 5 },
  });
});

test("a declared JSON body that does not parse is a retryable server error, never an empty reply (#1400)", async () => {
  const fetchImpl = wrap(respond('{"choices": ', { status: 200, headers: { "content-type": "application/json" } }), { responseMap: { contentPath: "x" } });
  const err = await fetchImpl("https://box.local/v1/chat/completions", { method: "POST" }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ProviderError);
  expect(err).toMatchObject({ kind: "server", retryable: true });
});

test("reasoningKeys: the first present key becomes reasoning_content on every SSE chunk", async () => {
  const sse = [
    'data: {"choices":[{"delta":{"content":"a","reasoning":"think"}}]}',
    "",
    'data: {"choices":[{"delta":{"content":"b"}}]}',
    "",
    "data: [DONE]",
    "",
  ].join("\n");
  const fetchImpl = wrap(respond(sse, { status: 200, headers: { "content-type": "text/event-stream" } }), {
    reasoningKeys: ["reasoning", "reasoning_content"],
  });
  const res = await fetchImpl("https://box.local/v1/chat/completions", { method: "POST" });
  const text = await res.text();
  const chunks = text
    .split("\n")
    .filter((line) => line.startsWith("data: ") && !line.includes("[DONE]"))
    .map((line) => JSON.parse(line.slice("data: ".length)) as { choices: { delta: Record<string, unknown> }[] });
  expect(chunks[0]?.choices[0]?.delta["reasoning_content"]).toBe("think");
  expect(chunks[1]?.choices[0]?.delta["reasoning_content"]).toBeUndefined();
  expect(text.trimEnd().endsWith("data: [DONE]")).toBe(true);
});

test("an untouched stream passes through by reference when nothing needs reshaping", async () => {
  const original = new Response("data: {}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
  const fetchImpl = wrap(() => Promise.resolve(original));
  expect(await fetchImpl("https://box.local/v1/x", { method: "POST" })).toBe(original);
});

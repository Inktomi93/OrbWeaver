// backends/v4/fetch — the four non-body controls that survive the SDK cut-over (§8.1): the redirect
// HOST-PIN (any 3xx is a hard non-retryable error, never followed — the Authorization header would ride to
// the attacker's host), the 64 KiB error-body cap, the by-value secret scrub on the wire capture (a
// `transport.includeBody` key-in-body credential must not reach the ring), and the `responseMap` /
// `reasoningKeys` reshape that lands a non-OpenAI reply on the SDK's schema BEFORE it parses.
//
// Plus the REPLY TAP (audit D2/D3, control 4b): the opt-in tee that puts the provider's literal reply bytes
// on the SAME capture entry as the request that produced them — off unless asked, scrubbed on the same terms
// as the request body, and emitted even when the SDK abandons the stream without cancelling it.

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
    capture: { sink, chatId: undefined, api: "chat-completions", wire: "openai-compat" satisfies Wire, providerId: "custom-openai", model: "m", reply: false },
  });
  await fetchImpl("https://box.local/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: "m", api_key: SECRET, messages: [{ role: "user", content: `hi ${SECRET}` }] }),
  });
  expect(captured).toHaveLength(1);
  expect(JSON.stringify(captured[0]?.body)).not.toContain(SECRET);
  expect(captured[0]?.body["model"]).toBe("m");
});

test("the capture carries the RESPONSE headers beside the request body (D1 — what came back, not just what went out)", async () => {
  const captured: Parameters<WireCaptureSink>[0][] = [];
  const sink: WireCaptureSink = (entry) => {
    captured.push(entry);
  };
  const headers = { "request-id": "req_011CfE", "anthropic-ratelimit-requests-remaining": "42" };
  const fetchImpl = wrap(respond("{}", { status: 200, headers }), {
    capture: {
      sink,
      chatId: undefined,
      api: "anthropic-messages",
      wire: "anthropic-messages" satisfies Wire,
      providerId: "anthropic",
      model: "m",
      reply: false,
    },
  });
  await fetchImpl("https://api.anthropic.com/v1/messages", { method: "POST", body: JSON.stringify({ model: "m" }) });
  expect(captured).toHaveLength(1);
  expect(captured[0]?.responseHeaders?.["request-id"]).toBe("req_011CfE");
  expect(captured[0]?.responseHeaders?.["anthropic-ratelimit-requests-remaining"]).toBe("42");
  expect(captured[0]?.body["model"]).toBe("m");
});

test("a transport failure still records the request, with no response headers to claim", async () => {
  const captured: Parameters<WireCaptureSink>[0][] = [];
  const sink: WireCaptureSink = (entry) => {
    captured.push(entry);
  };
  const boom: typeof fetch = () => Promise.reject(new Error("socket hang up"));
  const fetchImpl = wrap(boom, {
    capture: { sink, chatId: undefined, api: "chat-completions", wire: "openai-compat" satisfies Wire, providerId: "vllm", model: "m", reply: false },
  });
  await fetchImpl("https://box.local/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "m" }) }).catch(() => undefined);
  expect(captured).toHaveLength(1);
  expect(captured[0]?.responseHeaders).toBeUndefined();
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

// ── the reply tap (audit D2/D3) ──────────────────────────────────────────────────────────────────────────

/** OpenRouter's `debug.echo_upstream_body` answer: the FIRST SSE frame, carrying the body OR sent upstream.
 *  The echo replays our own request — including, on a key-in-body endpoint, our credential. */
const ECHO_FRAME = `data: ${JSON.stringify({ debug: { echo_upstream_body: { model: "m", api_key: SECRET } } })}\n\n`;
const TEXT_FRAME = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n';
const DONE_FRAME = "data: [DONE]\n\n";
const SSE_BODY = `${ECHO_FRAME}${TEXT_FRAME}${DONE_FRAME}`;

function sseRespond(body: string, headers: Record<string, string> = {}): typeof fetch {
  return respond(body, { status: 200, headers: { "content-type": "text/event-stream", ...headers } });
}

function replyCapture(sink: WireCaptureSink, reply: boolean): WrapFetchArgs["capture"] {
  return { sink, chatId: undefined, api: "chat-completions", wire: "openai-compat" satisfies Wire, providerId: "openrouter", model: "m", reply };
}

/** The tap emits from a floating read of its OWN tee branch, so the entry lands a turn or two after the
 *  caller has the Response. Poll rather than guess a tick count. */
async function settled(entries: readonly unknown[]): Promise<void> {
  for (let attempt = 0; attempt < 200 && entries.length === 0; attempt += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

test("the reply tap is OFF unless asked: the entry still carries the request and the headers, never the reply", async () => {
  const captured: Parameters<WireCaptureSink>[0][] = [];
  const sink: WireCaptureSink = (entry) => {
    captured.push(entry);
  };
  const fetchImpl = wrap(sseRespond(SSE_BODY, { "x-openrouter-id": "gen-1" }), { capture: replyCapture(sink, false) });
  const res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "m" }) });
  await res.text();
  await settled(captured);

  expect(captured).toHaveLength(1);
  expect(captured[0]?.responseBody).toBeUndefined();
  expect(captured[0]?.responseHeaders?.["x-openrouter-id"]).toBe("gen-1");
  expect(captured[0]?.body["model"]).toBe("m");
});

test("the reply tap ON: ONE entry carries the request body, the response headers AND the literal reply bytes", async () => {
  const captured: Parameters<WireCaptureSink>[0][] = [];
  const sink: WireCaptureSink = (entry) => {
    captured.push(entry);
  };
  const fetchImpl = wrap(sseRespond(SSE_BODY, { "x-openrouter-id": "gen-2" }), { capture: replyCapture(sink, true) });
  const res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: "m", debug: { echo_upstream_body: true } }),
  });
  // The consumer's tee branch is byte-for-byte what the endpoint sent — the tap is an observer, not a filter.
  expect(await res.text()).toBe(SSE_BODY);
  await settled(captured);

  // ONE row, not a request row and a correlated reply row: that correlation is the whole D1 argument.
  expect(captured).toHaveLength(1);
  expect(captured[0]?.body).toMatchObject({ model: "m", debug: { echo_upstream_body: true } });
  expect(captured[0]?.responseHeaders?.["x-openrouter-id"]).toBe("gen-2");
  // D3: the echo is reachable, and it is the FIRST frame — which is why the cap is a HEAD cap.
  expect(captured[0]?.responseBody).toContain("echo_upstream_body");
  expect(captured[0]?.responseBody?.startsWith("data: ")).toBe(true);
});

test("the captured reply is secret-scrubbed by value: an echoed key-in-body credential never reaches the ring", async () => {
  const captured: Parameters<WireCaptureSink>[0][] = [];
  const sink: WireCaptureSink = (entry) => {
    captured.push(entry);
  };
  const fetchImpl = wrap(sseRespond(SSE_BODY), { capture: replyCapture(sink, true) });
  const res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: "m", api_key: SECRET }),
  });
  await res.text();
  await settled(captured);

  expect(captured).toHaveLength(1);
  expect(captured[0]?.responseBody).not.toContain(SECRET);
  expect(captured[0]?.responseBody).toContain("echo_upstream_body");
  expect(JSON.stringify(captured[0]?.body)).not.toContain(SECRET);
});

test("a credential straddling the reply cap is still scrubbed — the read over-reads, scrubs, THEN slices (#1820)", async () => {
  const captured: Parameters<WireCaptureSink>[0][] = [];
  const sink: WireCaptureSink = (entry) => {
    captured.push(entry);
  };
  // OPAQUE on purpose: `redactSecretsFromText`'s `sk-…`/`Bearer …` SHAPE sweep would catch a fragment of the
  // file's usual `sk-live-…` literal and hide whether the over-read ran at all. The BY-VALUE guarantee — the
  // one `secretScrubOverhang` sizes — is the only belt that can reach this token.
  const opaque = "Zm9vYmFyLXN1cGVyLW9wYXF1ZS1jcmVk";
  const opaqueSecrets = resolvedScrubSet({ credential: { secret: opaque }, transport: {} });
  // The credential STRADDLES the 64 KiB cut, 16 of its 32 characters on the near side: a truncate-first
  // reader keeps half a credential, which is real key material and is the whole of #1820.
  const lead = "y".repeat(65_536 - 16);
  const fetchImpl = wrapFetch({
    fetch: sseRespond(`${lead}${opaque}tail`),
    secrets: opaqueSecrets,
    label: "test",
    responseMap: undefined,
    reasoningKeys: undefined,
    capture: replyCapture(sink, true),
  });
  const res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "m" }) });
  await res.text();
  await settled(captured);

  const body = captured[0]?.responseBody;
  // Assert the capture EXISTS first: an absent `responseBody` trivially contains no secret, which would make
  // the rest of this test a fence rather than a proof.
  expect(body?.startsWith("yyyy")).toBe(true);
  expect(body).not.toContain(opaque);
  expect(body).not.toContain(opaque.slice(0, 16));
});

test("a FAILED response records its (capped, scrubbed) error body as the reply, on the same entry", async () => {
  const captured: Parameters<WireCaptureSink>[0][] = [];
  const sink: WireCaptureSink = (entry) => {
    captured.push(entry);
  };
  const fetchImpl = wrap(respond(`{"error":{"message":"bad key ${SECRET}"}}`, { status: 401 }), { capture: replyCapture(sink, true) });
  const res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "m" }) });
  await res.text();
  await settled(captured);

  expect(captured).toHaveLength(1);
  expect(captured[0]?.responseBody).toContain("bad key");
  expect(captured[0]?.responseBody).not.toContain(SECRET);
});

test("the entry still lands when the consumer ABANDONS the stream — the tap owns its own tee branch", async () => {
  const captured: Parameters<WireCaptureSink>[0][] = [];
  const sink: WireCaptureSink = (entry) => {
    captured.push(entry);
  };
  const fetchImpl = wrap(sseRespond(SSE_BODY), { capture: replyCapture(sink, true) });
  // Never read the returned body: this is `drainStream`'s truncated-turn path, which releases its reader
  // without cancelling. A pass-through wrapper's flush would never run; an owned branch still finishes.
  await fetchImpl("https://openrouter.ai/api/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "m" }) });
  await settled(captured);

  expect(captured).toHaveLength(1);
  expect(captured[0]?.responseBody).toContain("echo_upstream_body");
});

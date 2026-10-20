// backends/openai-compat/chat — OR Anthropic history breakpoints, web_search_options, the mandatory-reasoning 400 replay, the Anthropic route alias and the forced tool choice.

import { createInferenceRuntime } from "@orb/inference";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { principal } from "../../../db/schema/_support.ts";
import { openRouterCatalogFetch } from "../../_openrouter-catalog.ts";
import { fakeApiKeySecret, fakeConnection, fakeDeps, fakeResolved, memoryStores, newUserId } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { generationCapability, openAiTextStream, scriptedSseFetch } from "../_hosted-support.ts";
import { extrasConnection, orCuratedConnection, orRequest, ProviderError, runOpenAiCompatChatTurn, sentBody, turnDeps, warningCodes } from "./_chat-support.ts";

test("OR Anthropic history breakpoints ride the content part, never the message", async () => {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "anthropic/claude-sonnet-5",
    capability: generationCapability({
      turns: {
        assistantPrefill: false,
        midConversationSystem: false,
        historySystemRows: false,
        roleHandlingFloor: "strict",
        explicitPromptCache: true,
        cacheMinTokens: 1,
      },
    }),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
  });
  const text = (value: string): [{ type: "text"; text: string }] => [{ type: "text", text: value }];
  const body = await sentBody(
    orRequest({
      connection,
      tools: undefined,
      cacheBreakpointDepth: 1,
      history: [
        { role: "assistant", content: text("Greeting.") },
        { role: "user", content: text("u1") },
        { role: "assistant", content: text("a1") },
        { role: "user", content: text("u2") },
        { role: "assistant", content: text("a2") },
        { role: "user", content: text("u3") },
      ],
    }),
  );
  const messages = body["messages"] as Record<string, unknown>[];
  for (const message of messages) {
    expect(message, `${String(message["role"])} row carries a message-level marker`).not.toHaveProperty("cache_control");
  }
  const marked = messages.flatMap((message, index) =>
    Array.isArray(message["content"]) && (message["content"] as Record<string, unknown>[]).some((part) => part["cache_control"] !== undefined) ? [index] : [],
  );
  // system (0) plus depth 1 (a2, index 5) and depth 3 (a1, index 3).
  expect(marked).toEqual([0, 3, 5]);
  expect(messages[5]).toEqual({ role: "assistant", content: [{ type: "text", text: "a2", cache_control: { type: "ephemeral", ttl: "1h" } }] });
});

test("C3: `web_search_options` rides when declared, and the body carries nothing when it is not", async () => {
  const withOptions = await sentBody(orRequest({ tools: undefined, connection: extrasConnection({ web_search_options: { max_results: 5, engine: "exa" } }) }));
  expect(withOptions["web_search_options"]).toMatchObject({ max_results: 5, engine: "exa" });

  const without = await sentBody(orRequest({ tools: undefined }));
  expect(without["web_search_options"]).toBeUndefined();
});

// THE MANDATORY-REASONING STRIP-AND-REPLAY-ONCE (`drainWithReplay`) — previously UNTESTED anywhere
// (`rg isMandatoryReasoningRejection` hit only the source), and now load-bearing twice over.
//
// It is the recovery for an endpoint that rejects `reasoning.effort:"none"` with a 400: the runner peels the
// upstream body off the RAW thrown error, recognises the refusal, and replays the turn ONCE with the
// reasoning block omitted. That peel is also the reason `backends/http/retry.ts` re-throws the ORIGINAL error
// rather than its classification — `providerErrorFromHttp` replaces `cause` with a scrubbed `new Error(safe)`
// on any credential-bearing scrub set, which would destroy exactly the body this reads.
//
// WHICH IS WHY THIS PIN EXISTS NOW. The 2026-09-20 conformance work added a typed-failure boundary to this
// runner so a streaming failure leaves the package as a `ProviderError` instead of a raw SDK object. Its
// whole safety argument is that the classify sits OUTSIDE `drainWithReplay`, so the replay still sees the
// raw error. Nothing proved that. This does: if the classify is ever moved inside — or `retry.ts` is
// "simplified" to throw `mapped` — the peel stops matching, the replay never fires, and this reds with a
// 400 instead of a reply.
test("the openrouter mandatory-reasoning 400 is peeled, stripped and replayed once — and the classify boundary does not break it", async () => {
  const recorded: RecordedRequest[] = [];
  const rejection = JSON.stringify({ error: { message: "Reasoning is mandatory for this endpoint and cannot be disabled.", code: 400 } });
  const success = openAiTextStream("replayed.");
  let call = 0;
  const fetchImpl: typeof fetch = (input, init) => {
    call += 1;
    const raw = typeof init?.body === "string" ? init.body : "{}";
    recorded.push({ url: String(input), body: JSON.parse(raw) as Record<string, unknown> });
    if (call === 1) {
      return Promise.resolve(new Response(rejection, { status: 400, headers: { "content-type": "application/json" } }));
    }
    const body = success.map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`).join("");
    return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
  };

  // A chosen `effort: "none"` is what makes the turn REPLAYABLE: `drainWithReplay`'s second argument is
  // `dialect === "openrouter" && knobs.reasoning.offChosen === true`, the only case that sends the off block.
  const req = orRequest({ params: { effort: "none" }, tools: undefined });
  const turn = await runOpenAiCompatChatTurn(req, turnDeps(fetchImpl));

  expect(recorded, "the turn was sent twice: the rejected attempt and the stripped replay").toHaveLength(2);
  const first = recorded[0]?.body ?? {};
  const second = recorded[1]?.body ?? {};
  expect(JSON.stringify(first), "attempt 1 carried the reasoning block the endpoint refuses").toContain('"reasoning"');
  expect(JSON.stringify(second), "the replay omitted it entirely — stripped, not re-spelled").not.toContain('"reasoning"');
  expect(turn.reply, "the replay produced the turn").toBe("replayed.");
});

test("a 400 that is NOT a mandatory-reasoning refusal is NOT replayed, and reaches the caller as a typed ProviderError", async () => {
  // The negative control for the arm above — without it, a `drainWithReplay` that replayed EVERY failure
  // would pass it — and simultaneously the proof for the typed-failure boundary: the raw `APICallError` the
  // SDK threw must arrive as `ProviderError`, which is what `contract/errors.ts` promises every consumer.
  const recorded: RecordedRequest[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const raw = typeof init?.body === "string" ? init.body : "{}";
    recorded.push({ url: String(input), body: JSON.parse(raw) as Record<string, unknown> });
    return Promise.resolve(
      new Response(JSON.stringify({ error: { message: "model not found on this route", code: 400 } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  const req = orRequest({ params: { effort: "none" }, tools: undefined });
  const failure = await runOpenAiCompatChatTurn(req, turnDeps(fetchImpl)).then(
    () => null,
    (err: unknown) => err,
  );
  expect(failure, "an unrelated 400 must surface as the contract's ONE error class, never a raw SDK object").toBeInstanceOf(ProviderError);
  expect(failure instanceof ProviderError ? failure.kind : null, "a 400 is a structurally-invalid request").toBe("invalid");
  expect(recorded, "an unrelated failure is not replayed").toHaveLength(1);
});

// ── the Anthropic route follows the id the model FACTS come from ─────────────────────────────────────────
// A floating `~anthropic/…-latest` alias folds Claude's capability through its catalog target, so the wire's
// Anthropic decisions (the pinned provider routing, the system split and cache placement) must read the same
// id — never the raw alias spelling.

async function runtimeTurnBody(model: string): Promise<Record<string, unknown>> {
  const db = await freshDb();
  const recorded: RecordedRequest[] = [];
  const catalog = openRouterCatalogFetch();
  const chat = scriptedSseFetch([openAiTextStream("ok")], recorded);
  const fetchImpl: typeof fetch = (input, init) => (String(input).includes("/chat/completions") ? chat(input, init) : catalog(input, init));
  const stores = memoryStores();
  const ownerId = newUserId();
  const credentialId = mintTypeId(ID_PREFIX.userCredential);
  const row = fakeConnection({ ownerId, providerId: "openrouter", model, allowBackground: true, credentialId });
  stores.connections.rows.set(row.id, row);
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "chat", connectionId: row.id });
  const secrets = new Map([[credentialId, fakeApiKeySecret("sk-or-not-a-real-key")]]);
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: fetchImpl, secrets }));
  const { resolved } = await runtime.resolve({ task: "chat", principal: await principal({ db }, ownerId) });
  await runtime.executor.runChatTurn({
    api: "chat-completions",
    connection: { ...resolved, task: "chat" },
    params: {},
    systemPrompt: { static: "You are a helpful assistant.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "Hi." }] }],
  });
  return recorded[0]?.body ?? {};
}

test("a `~anthropic/…-latest` alias rides the Anthropic route: pinned routing and a cached system block", async () => {
  const body = await runtimeTurnBody("~anthropic/claude-fable-latest");
  expect(body["provider"]).toEqual({ order: ["Anthropic"], allow_fallbacks: false });
  expect(body["messages"]).toMatchObject([{ role: "system", content: [{ type: "text", cache_control: { type: "ephemeral", ttl: "1h" } }] }, { role: "user" }]);
  // PLANTED CONTROL: an alias whose catalog row names no target is not treated as Claude by its spelling.
  expect((await runtimeTurnBody("~anthropic/claude-mystery-latest"))["provider"]).toBeUndefined();
});

// ── forced tool choice on the openai-compat wire ─────────────────────────────────────────────────────────
// OpenRouter forwards `tool_choice` upstream verbatim, so a model that rejects forced tool use 400s here as it
// does on the direct wire. The downgrade reads the capability: a row that states no refusal keeps `required`.

const FORCED = [{ mode: "required" }, { mode: "tool", name: "get_weather" }] as const;

test("#2575: OpenRouter + a model that rejects forced tool use sends `auto`, warned once", async () => {
  for (const model of ["anthropic/claude-fable-5.1", "anthropic/claude-opus-5.5"]) {
    for (const toolChoice of FORCED) {
      const recorded: RecordedRequest[] = [];
      const turn = await runOpenAiCompatChatTurn(
        orRequest({ connection: orCuratedConnection(model), toolChoice }),
        turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)),
      );
      expect(recorded[0]?.body["tool_choice"], `${model} · ${toolChoice.mode}`).toBe("auto");
      expect(recorded[0]?.body["tools"], model).toMatchObject([{ function: { name: "get_weather" } }]);
      expect(
        warningCodes(turn).filter((code) => code === "tool_choice_downgraded"),
        model,
      ).toHaveLength(1);
    }
  }
});

test("#2575 (controls): Opus 5 on OpenRouter and a vLLM-shaped endpoint keep the forced choice byte-for-byte", async () => {
  const vllm = fakeResolved({
    task: "chat",
    providerId: "vllm",
    model: "Qwen/Qwen3-8B",
    capability: generationCapability({ tools: { parallel: true, silencesProse: true } }),
    baseUrl: "http://127.0.0.1:8000/v1",
  });
  for (const connection of [orCuratedConnection("anthropic/claude-opus-5"), vllm]) {
    const recorded: RecordedRequest[] = [];
    const turn = await runOpenAiCompatChatTurn(
      orRequest({ connection, toolChoice: { mode: "required" } }),
      turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)),
    );
    expect(recorded[0]?.body["tool_choice"], connection.model).toBe("required");
    expect(warningCodes(turn), connection.model).not.toContain("tool_choice_downgraded");
    const named: RecordedRequest[] = [];
    await runOpenAiCompatChatTurn(orRequest({ connection, toolChoice: FORCED[1] }), turnDeps(scriptedSseFetch([openAiTextStream("ok")], named)));
    expect(named[0]?.body["tool_choice"], connection.model).toMatchObject({ type: "function", function: { name: "get_weather" } });
  }
});

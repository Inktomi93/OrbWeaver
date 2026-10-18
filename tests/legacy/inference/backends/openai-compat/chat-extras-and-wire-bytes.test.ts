// backends/openai-compat/chat — the OpenRouter plugin list merge, the request debug block, modelled extras, and the full-body byte-equality pin per dialect.

// @orb-waive-file no-test-fabrication(Record<string, unknown> | undefined): baselined when the gate widened to value casts; burn-down item 906.
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { fakeApiKeySecret, fakeResolved, wireSchema } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { generationCapability, openAiTextStream, scriptedSseFetch } from "../_hosted-support.ts";
import { extrasConnection, orRequest, runOpenAiCompatChatTurn, sentBody, turnDeps } from "./_chat-support.ts";

// ── C3: the OpenRouter plugin list is a MERGE, not a hard-coded single entry ─────────────────────────────
// The transport owns context-compression (off the preset's `providerContextCompression`); the user owns
// everything else OR models. Before this the whole `plugins` array was one hard-coded entry, so
// `response-healing` — the server-side answer to the malformed JSON our non-streaming structured task has to
// re-ask for — was unreachable no matter what the connection declared.

test("C3: a user's declared plugins merge AFTER the turn-owned compression entry", async () => {
  const body = await sentBody(
    orRequest({
      tools: undefined,
      connection: extrasConnection({ plugins: [{ id: "response-healing" }, { id: "web", max_results: 3 }] }),
    }),
  );

  // Order IS the precedence: compression leads because it is the one entry this layer decides.
  expect(body["plugins"]).toMatchObject([{ id: "context-compression" }, { id: "response-healing" }, { id: "web", max_results: 3 }]);
});

test("C3: a user entry re-declaring `context-compression` is dropped loudly — MODELLED WINS", async () => {
  const events: string[] = [];
  const recorded: RecordedRequest[] = [];
  const req = orRequest({
    tools: undefined,
    connection: extrasConnection({ plugins: [{ id: "context-compression", enabled: true }, { id: "moderation" }] }),
    onEvent: (event) => {
      if (event.kind === "warning") {
        events.push(event.code);
      }
    },
  });
  await runOpenAiCompatChatTurn(req, turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)));

  expect(recorded[0]?.body["plugins"]).toMatchObject([{ id: "context-compression", enabled: false }, { id: "moderation" }]);
  expect(events).toContain("custom_parameters_ignored");
});

test("C3: a MALFORMED plugin block is dropped whole, loudly — never sent half-valid", async () => {
  const events: string[] = [];
  const recorded: RecordedRequest[] = [];
  const req = orRequest({
    tools: undefined,
    connection: extrasConnection({ plugins: [{ id: "not-a-real-plugin" }] }),
    onEvent: (event) => {
      if (event.kind === "warning") {
        events.push(event.code);
      }
    },
  });
  await runOpenAiCompatChatTurn(req, turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)));

  expect(recorded[0]?.body["plugins"]).toMatchObject([{ id: "context-compression" }]);
  expect(events).toContain("custom_parameters_ignored");
});

// ── D3: OpenRouter's request DEBUG block ────────────────────────────────────────────────────────────────
// `debug.echo_upstream_body` is the only way to see what a ROUTED provider actually received — OR answers
// with the upstream body as the FIRST SSE frame. It was unreachable: the transport models two extras keys
// and drops the rest, so a user could declare it and it would never be sent. The SDK's `includeRawChunks` is
// NOT the door (it only re-surfaces already-parsed chunks as `raw` PARTS); the capture's own reply tap is
// (`backends/v4/fetch.ts` control 4b, which records why the raw part was refused).

test("D3: `extras.debug` rides the OR body, and nothing is sent when it is not declared", async () => {
  const withDebug = await sentBody(orRequest({ tools: undefined, connection: extrasConnection({ debug: { echo_upstream_body: true } }) }));
  expect(withDebug["debug"]).toMatchObject({ echo_upstream_body: true });

  const without = await sentBody(orRequest({ tools: undefined, connection: extrasConnection({}) }));
  expect(without["debug"]).toBeUndefined();
});

test("D3: a MALFORMED debug block is dropped whole, loudly — never sent half-valid", async () => {
  const messages: string[] = [];
  const recorded: RecordedRequest[] = [];
  const req = orRequest({
    tools: undefined,
    connection: extrasConnection({ debug: { echo_upstream_body: "yes please" } }),
    onEvent: (event) => {
      if (event.kind === "warning") {
        messages.push(event.message);
      }
    },
  });
  await runOpenAiCompatChatTurn(req, turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)));

  expect(recorded[0]?.body["debug"]).toBeUndefined();
  // The READER'S refusal, not the belt's generic drop: an `extras` key the transport takes must never be
  // reported as "ignored: the openrouter transport takes only …" — see `body.ts`'s modelled-key list.
  expect(messages).toContain("extras.debug ignored: not a valid openrouter debug block");
});

// OpenRouter answers `provider.require_parameters` beside `response_format` with 404 "no endpoints", so the layer
// never adds it; the user's own `provider` block is theirs and rides as set.
test("a structured OpenRouter turn never adds provider.require_parameters; the user's own provider block rides as set", async () => {
  const responseFormat = { name: "row", schema: wireSchema({ type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }) };
  const ours = await sentBody(orRequest({ tools: undefined, responseFormat, connection: extrasConnection({}) }));
  expect(ours["response_format"]).toBeDefined();
  expect((ours["provider"] as Record<string, unknown> | undefined)?.["require_parameters"]).toBeUndefined();
  const theirs = await sentBody(orRequest({ tools: undefined, responseFormat, connection: extrasConnection({ provider: { require_parameters: true } }) }));
  expect(theirs["provider"]).toMatchObject({ require_parameters: true });
});

test("a modelled extras door does not ALSO report itself ignored (the belt's list and the readers agree)", async () => {
  const messages: string[] = [];
  const req = orRequest({
    tools: undefined,
    connection: extrasConnection({ debug: { echo_upstream_body: true }, plugins: [{ id: "moderation" }], web_search_options: { max_results: 2 } }),
    onEvent: (event) => {
      if (event.kind === "warning") {
        messages.push(event.message);
      }
    },
  });
  await runOpenAiCompatChatTurn(req, turnDeps(scriptedSseFetch([openAiTextStream("ok")], [])));

  expect(messages.filter((message) => message.includes("the openrouter transport takes only"))).toEqual([]);
});

// ── E1/§15c: the wire-capture BYTE-EQUALITY pin, one per DIALECT — a caret bump of `@ai-sdk/openai-
// compatible` or `@openrouter/ai-sdk-provider` that reshapes ANY field of the converted request fails
// here, where every other pin in this file only checks the fields it names.

test("byte-equality (openai-compatible dialect): the FULL request body for a minimal deterministic turn", async () => {
  const connection = fakeResolved({
    task: "chat",
    providerId: "custom-openai",
    model: "qwen3",
    capability: generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } }),
    baseUrl: "https://box.local/v1",
    secret: fakeApiKeySecret("sk-box-probe-not-a-real-key"),
    declaredFeatures: { effort: "reasoning_effort" },
  });
  const recorded: RecordedRequest[] = [];
  await runOpenAiCompatChatTurn(orRequest({ connection, tools: undefined }), turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)));
  expect(recorded[0]?.body).toEqual({
    model: "qwen3",
    reasoning_effort: "high",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "What is the weather in Paris?" },
    ],
    stream: true,
    stream_options: { include_usage: true },
    // The preset's effort turns the template's thinking on, spelled where the row has a switch (Custom does), and the
    // reasoning carry left off tells the template not to replay prior thinking (body rule 5c).
    chat_template_kwargs: { enable_thinking: true, preserve_reasoning: false },
  });
});

test("byte-equality (openrouter dialect): the FULL request body for a minimal deterministic turn", async () => {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "anthropic/claude-opus-4-5",
    capability: generationCapability(),
    secret: fakeApiKeySecret("sk-or-probe-not-a-real-key"),
  });
  const recorded: RecordedRequest[] = [];
  await runOpenAiCompatChatTurn(orRequest({ connection, tools: undefined }), turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)));
  expect(recorded[0]?.body).toEqual({
    model: "anthropic/claude-opus-4-5",
    messages: [
      { role: "system", content: [{ type: "text", text: "You are a helpful assistant.", cache_control: { type: "ephemeral", ttl: "1h" } }] },
      { role: "user", content: "What is the weather in Paris?" },
    ],
    reasoning: { effort: "high" },
    usage: { include: true },
    stream: true,
    stream_options: { include_usage: true },
    provider: { order: ["Anthropic"], allow_fallbacks: false },
    plugins: [{ id: "context-compression", enabled: false }],
  });
});

// OpenRouter forwards `cache_control` to Anthropic only from a CONTENT PART. A marker at message level on
// string content is dropped upstream, so the history is never cached (measured: gen-1790134941-TdEvy3D9exFNfO6cf830
// sent breakpoints on two assistant rows and read only the system block; the content-part A/B read the history,
// gen-1790135929 vs gen-1790135933). The provider converter spells an assistant row as a string with a
// message-level marker, and history breakpoints at depth d and d+2 land on assistant rows in an ordinary chat.

// backends/openai-compat/body — the outbound-body shaper's rules in the order `body.ts`'s header lists them (§8.1,
// D143(b)/D156): the user's extras and includeBody/excludeBody merge first, and every later rule leaves a key
// they settled as the user set it.

import type { EndpointFeatures } from "@orb/contracts/inference";
import { connectionExtrasSchema, WIRE_DEFAULT_FEATURES } from "@orb/contracts/inference";
import type { ShapeArgs } from "../../../../packages/inference/src/backends/openai-compat/body.ts";
import { shapeOutboundBody } from "../../../../packages/inference/src/backends/openai-compat/body.ts";
import type { WirePlan } from "../../../../packages/inference/src/backends/v4/prompt.ts";
import type { ResolvedWarning } from "../../../../packages/inference/src/contract/resolve.ts";
import { expect, test } from "../../../support/fixtures.ts";

/** A row that SPELLS `reasoning_effort` (OpenAI-shaped), so the effort rule stays out of the other pins. */
const SPELLS_EFFORT: EndpointFeatures = { ...WIRE_DEFAULT_FEATURES, effort: "reasoning_effort" };

function args(overrides: Partial<ShapeArgs> = {}): ShapeArgs & { readonly warnings: ResolvedWarning[] } {
  return {
    plan: null,
    features: SPELLS_EFFORT,
    extras: null,
    transport: null,
    dialect: "openai-compatible",
    prefillAllowed: false,
    templateThinking: undefined,
    templatePreserveReasoning: undefined,
    reasoningMandatory: false,
    foldSameRole: false,
    replyImages: false,
    warnings: [],
    ...overrides,
  };
}

const RAW = { model: "m", messages: [{ role: "user", content: "hi" }], temperature: 0.7, reasoning_effort: "high" };

test("image detail is applied to normalized user and assistant image parts only when admitted", () => {
  const raw = {
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: "data:image/png;base64,YQ==" } },
          { type: "text", text: "inspect" },
        ],
      },
      { role: "assistant", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,Yg==" } }] },
      { role: "user", content: [{ type: "video_url", video_url: { url: "data:video/mp4;base64,Yw==" } }] },
    ],
  };
  for (const detail of ["auto", "low", "high"] as const) {
    const admitted = { ...args(), imageDetail: detail };
    expect(shapeOutboundBody(raw, admitted)).toEqual({
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: "data:image/png;base64,YQ==", detail } },
            { type: "text", text: "inspect" },
          ],
        },
        { role: "assistant", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,Yg==", detail } }] },
        raw.messages[2],
      ],
    });
  }
  expect(shapeOutboundBody(raw, args())).toEqual(raw);
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A typed read of one body slot — a guard, never a cast (no-test-fabrication). */
function recordAt(body: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = body[key];
  if (!isRecord(value)) {
    throw new Error(`expected body.${key} to be an object`);
  }
  return value;
}

function recordsAt(body: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = body[key];
  if (!(Array.isArray(value) && value.every(isRecord))) {
    throw new Error(`expected body.${key} to be an array of objects`);
  }
  return value;
}

test("extras: belt keys drop with the key named; the user's value beats a modelled one; a fresh key reaches the wire", () => {
  const a = args({
    extras: { model: "evil", stream: true, temperature: 1.2, reasoning_effort: "low", chat_template_kwargs: { enable_thinking: false }, mirostat_tau: 5 },
  });
  const out = shapeOutboundBody(RAW, a);
  expect(out["model"]).toBe("m");
  expect(out["stream"]).toBeUndefined();
  // The preset sent temperature 0.7 and effort high; the connection's own body says 1.2 and low, and wins.
  expect(out["temperature"]).toBe(1.2);
  expect(out["reasoning_effort"]).toBe("low");
  expect(out["chat_template_kwargs"]).toEqual({ enable_thinking: false });
  // A key nothing models passes through untouched.
  expect(out["mirostat_tau"]).toBe(5);
  expect(a.warnings.map((w) => [w.code, w.key])).toEqual([
    ["custom_parameters_ignored", "model"],
    ["custom_parameters_ignored", "stream"],
  ]);
  // Pure: the SDK's object is untouched.
  expect(RAW["model"]).toBe("m");
  expect("chat_template_kwargs" in RAW).toBe(false);
});

test("extras: the openrouter transport takes only its two modelled keys and drops the rest loudly", () => {
  const a = args({ dialect: "openrouter", extras: { provider: { order: ["x"] }, models: ["a"], chat_template_kwargs: {} } });
  const out = shapeOutboundBody(RAW, a);
  expect(out["chat_template_kwargs"]).toBeUndefined();
  expect(out["provider"]).toBeUndefined(); // the chat surface reads the modelled keys off extras itself
  expect(a.warnings.map((w) => w.key)).toEqual(["chat_template_kwargs"]);
});

test("extras: a prototype-pollution key never lands, at any depth", () => {
  // Parsed from JSON so the poison keys are REAL own properties (an object literal's `__proto__` is the
  // prototype setter, not a key); typed through the same zod the connection column uses.
  const poisoned = connectionExtrasSchema.parse(JSON.parse('{"__proto__": {"polluted": true}, "nested": {"constructor": {"prototype": {"x": 1}}, "ok": 1}}'));
  const out = shapeOutboundBody(RAW, args({ extras: poisoned }));
  expect(Object.hasOwn(out, "__proto__")).toBe(false);
  const nested = recordAt(out, "nested");
  expect(nested["ok"]).toBe(1);
  expect(Object.hasOwn(nested, "constructor")).toBe(false);
  const probe: Record<string, unknown> = {};
  expect(probe["polluted"]).toBeUndefined();
});

test("transport include/exclude is the endpoint's final word, applied after extras", () => {
  const a = args({ extras: { top_k: 40 }, transport: { includeBody: { api_key: "in-body" }, excludeBody: ["top_k", "reasoning_effort"] } });
  const out = shapeOutboundBody(RAW, a);
  expect(out["api_key"]).toBe("in-body");
  expect(out["top_k"]).toBeUndefined();
  expect(out["reasoning_effort"]).toBeUndefined();
});

// The editor's promise for "Fields to add or replace": a key there replaces the one we send, an extra's too,
// shallowly (a nested object is replaced whole), and an exclusion still drops a key the overrides set.
test("transport includeBody replaces a modelled field and an extra, whole, and an exclusion still wins", () => {
  const out = shapeOutboundBody(
    { ...RAW, stop: ["</s>"] },
    args({ extras: { top_k: 40 }, transport: { includeBody: { temperature: 0.1, top_k: 10, stop: { replaced: true }, seed: 7 }, excludeBody: ["seed"] } }),
  );
  expect(out["temperature"]).toBe(0.1);
  expect(out["top_k"]).toBe(10);
  expect(out["stop"]).toEqual({ replaced: true });
  expect(Object.hasOwn(out, "seed")).toBe(false);
  expect(out["messages"]).toEqual(RAW.messages);
});

function plan(rows: WirePlan["rows"], extras: Partial<Pick<WirePlan, "names" | "assistantMedia" | "endsOnAssistant">> = {}): WirePlan {
  return { prompt: [], names: new Map(), assistantMedia: new Map(), rows, toolResultErrorDropped: false, endsOnAssistant: false, ...extras };
}

test("re-attachment: assistant media parts and participant names land on the planned wire index", () => {
  const body = {
    ...RAW,
    messages: [
      { role: "user", content: "look" },
      { role: "assistant", content: "a picture:" },
    ],
  };
  const p = plan(
    [
      { role: "user", toolExchange: false, text: "look" },
      { role: "assistant", toolExchange: false, text: "a picture:" },
    ],
    {
      names: new Map([[0, "Alice"]]),
      assistantMedia: new Map([[1, [{ kind: "image", url: "https://cdn/x.png" }]]]),
    },
  );
  const a = args({ plan: p });
  const out = shapeOutboundBody(body, a);
  const messages = recordsAt(out, "messages");
  expect(messages[0]?.["name"]).toBe("Alice");
  expect(messages[1]?.["content"]).toEqual([
    { type: "text", text: "a picture:" },
    { type: "image_url", image_url: { url: "https://cdn/x.png" } },
  ]);
  expect(a.warnings).toEqual([]);
});

test("re-attachment refuses on a row-count mismatch instead of stamping the wrong row", () => {
  const body = { ...RAW, messages: [{ role: "user", content: "merged" }] };
  const p = plan(
    [
      { role: "user", toolExchange: false, text: "a" },
      { role: "assistant", toolExchange: false, text: "b" },
    ],
    { names: new Map([[0, "Alice"]]) },
  );
  const a = args({ plan: p });
  const out = shapeOutboundBody(body, a);
  expect(recordsAt(out, "messages")[0]?.["name"]).toBeUndefined();
  expect(a.warnings.map((w) => w.code)).toEqual(["image_edit_dropped"]);
});

const CONTINUE: EndpointFeatures = { ...SPELLS_EFFORT, prefill: "continue-final-message", prefillSuppressesThinking: true };

test("prefill pair only when the row, the capability and the array all agree; the thinking interlock strips the toggle", () => {
  const ends = plan([{ role: "assistant", toolExchange: false, text: "…" }], { endsOnAssistant: true });
  const off = shapeOutboundBody(RAW, args({ plan: ends, features: CONTINUE, prefillAllowed: false }));
  expect(off["continue_final_message"]).toBeUndefined();
  const notEnding = shapeOutboundBody(RAW, args({ plan: plan([{ role: "user", toolExchange: false, text: "…" }]), features: CONTINUE, prefillAllowed: true }));
  expect(notEnding["continue_final_message"]).toBeUndefined();
  const a = args({ plan: ends, features: CONTINUE, prefillAllowed: true });
  const on = shapeOutboundBody(RAW, a);
  expect(on["continue_final_message"]).toBe(true);
  expect(on["add_generation_prompt"]).toBe(false);
  expect(on["chat_template_kwargs"]).toEqual({ enable_thinking: false });
  expect(on["reasoning_effort"]).toBeUndefined();
  expect(a.warnings.map((w) => w.code)).toEqual(["reasoning_dropped_for_prefill"]);
  // A row that already turned thinking off pays no warning.
  const quiet = args({ plan: ends, features: CONTINUE, prefillAllowed: true, extras: { chat_template_kwargs: { enable_thinking: false } } });
  shapeOutboundBody(RAW, quiet);
  expect(quiet.warnings).toEqual([]);
});

const KWARGS_OFF: EndpointFeatures = { ...SPELLS_EFFORT, thinkingOff: "chat_template_kwargs" };

test("a reasoning-off turn tells the template not to think, keeping the user's own kwargs from extras and includeBody", () => {
  const fromExtras = shapeOutboundBody(RAW, args({ features: KWARGS_OFF, templateThinking: false, extras: { chat_template_kwargs: { custom_flag: "x" } } }));
  expect(fromExtras["chat_template_kwargs"]).toEqual({ custom_flag: "x", enable_thinking: false });
  const fromInclude = shapeOutboundBody(
    RAW,
    args({ features: KWARGS_OFF, templateThinking: false, transport: { includeBody: { chat_template_kwargs: { documents: [] } } } }),
  );
  expect(fromInclude["chat_template_kwargs"]).toEqual({ documents: [], enable_thinking: false });
  // Unset sends nothing new, and a row with no template switch is left alone.
  expect("chat_template_kwargs" in shapeOutboundBody(RAW, args({ features: KWARGS_OFF, templateThinking: undefined }))).toBe(false);
  expect("chat_template_kwargs" in shapeOutboundBody(RAW, args({ features: { ...KWARGS_OFF, thinkingOff: "none" }, templateThinking: false }))).toBe(false);
});

test("the user's own body outranks every computed key after the merge: the switch, modalities, the effort strip, the cap rename", () => {
  // Their kwargs' enable_thinking beats the folded turn's off.
  const kwargs = shapeOutboundBody(RAW, args({ features: KWARGS_OFF, templateThinking: false, extras: { chat_template_kwargs: { enable_thinking: true } } }));
  expect(kwargs["chat_template_kwargs"]).toEqual({ enable_thinking: true });
  // An excluded key stays excluded.
  const excluded = shapeOutboundBody(RAW, args({ features: KWARGS_OFF, templateThinking: false, transport: { excludeBody: ["chat_template_kwargs"] } }));
  expect("chat_template_kwargs" in excluded).toBe(false);
  // Their modalities stand over replyImages'.
  expect(shapeOutboundBody(RAW, args({ replyImages: true, extras: { modalities: ["text"] } }))["modalities"]).toEqual(["text"]);
  // Their reasoning_effort survives a row that spells no effort field.
  expect(shapeOutboundBody(RAW, args({ features: WIRE_DEFAULT_FEATURES, transport: { includeBody: { reasoning_effort: "low" } } }))["reasoning_effort"]).toBe(
    "low",
  );
  // Their max_tokens is not renamed.
  const capped = shapeOutboundBody(
    { ...RAW, max_tokens: 100 },
    args({ features: { ...SPELLS_EFFORT, outputCapField: "max_completion_tokens" }, extras: { max_tokens: 50 } }),
  );
  expect([capped["max_tokens"], capped["max_completion_tokens"]]).toEqual([50, undefined]);
});

// One pin per later rule that writes a key: a top-level key the user's own body settled (extras, includeBody or
// excludeBody) leaves that rule's computed value off the wire.
const MAX_COMPLETION: EndpointFeatures = { ...SPELLS_EFFORT, outputCapField: "max_completion_tokens" };

test("rule 8: the cap rename never overwrites the user's own max_completion_tokens, and the preset's max_tokens does not ride beside it", () => {
  const capped = { ...RAW, max_tokens: 512 };
  const fromExtras = shapeOutboundBody(capped, args({ features: MAX_COMPLETION, extras: { max_completion_tokens: 4096 } }));
  expect([fromExtras["max_completion_tokens"], "max_tokens" in fromExtras]).toEqual([4096, false]);
  const fromInclude = shapeOutboundBody(capped, args({ features: MAX_COMPLETION, transport: { includeBody: { max_completion_tokens: 2048 } } }));
  expect([fromInclude["max_completion_tokens"], "max_tokens" in fromInclude]).toEqual([2048, false]);
  // An excluded max_completion_tokens is not brought back by the rename.
  const excluded = shapeOutboundBody(capped, args({ features: MAX_COMPLETION, transport: { excludeBody: ["max_completion_tokens"] } }));
  expect(["max_completion_tokens" in excluded, "max_tokens" in excluded]).toEqual([false, false]);
});

test("rule 5: on a model whose reasoning is mandatory the interlock sends the prefill pair but never turns thinking off", () => {
  const ends = plan([{ role: "assistant", toolExchange: false, text: "…" }], { endsOnAssistant: true });
  const a = args({ plan: ends, features: CONTINUE, prefillAllowed: true, reasoningMandatory: true });
  const out = shapeOutboundBody(RAW, a);
  expect([out["continue_final_message"], out["add_generation_prompt"]]).toEqual([true, false]);
  expect(["chat_template_kwargs" in out, out["reasoning_effort"]]).toEqual([false, "high"]);
  expect(a.warnings).toEqual([]);
});

test("rule 5: the prefill interlock turns the template off but keeps the user's own reasoning_effort", () => {
  const ends = plan([{ role: "assistant", toolExchange: false, text: "…" }], { endsOnAssistant: true });
  const fromExtras = args({ plan: ends, features: CONTINUE, prefillAllowed: true, extras: { reasoning_effort: "low" } });
  const out = shapeOutboundBody(RAW, fromExtras);
  expect(out["reasoning_effort"]).toBe("low");
  expect(out["chat_template_kwargs"]).toEqual({ enable_thinking: false });
  expect(fromExtras.warnings.map((w) => w.code)).toEqual(["reasoning_dropped_for_prefill"]);
  const fromInclude = shapeOutboundBody(
    RAW,
    args({ plan: ends, features: CONTINUE, prefillAllowed: true, transport: { includeBody: { reasoning_effort: "medium" } } }),
  );
  expect(fromInclude["reasoning_effort"]).toBe("medium");
});

test("rule 5: a user who sets or excludes either prefill key decides the prefill: no pair, no interlock, no warning", () => {
  const ends = plan([{ role: "assistant", toolExchange: false, text: "…" }], { endsOnAssistant: true });
  const transports = [
    { includeBody: { continue_final_message: false } },
    { includeBody: { add_generation_prompt: true } },
    { excludeBody: ["continue_final_message"] },
    { excludeBody: ["add_generation_prompt"] },
  ];
  for (const transport of transports) {
    const a = args({ plan: ends, features: { ...CONTINUE, thinkingOff: "chat_template_kwargs" }, prefillAllowed: true, templateThinking: true, transport });
    const out = shapeOutboundBody(RAW, a);
    const label = JSON.stringify(transport);
    expect(out["continue_final_message"], label).toBe(transport.includeBody?.continue_final_message);
    expect(out["add_generation_prompt"], label).toBe(transport.includeBody?.add_generation_prompt);
    // The interlock's off did not run, so the turn's own on reaches the template, and the effort stays.
    expect([out["chat_template_kwargs"], out["reasoning_effort"]], label).toEqual([{ enable_thinking: true }, "high"]);
    expect(a.warnings, label).toEqual([]);
  }
});

test("rule 6: modalities the user excluded stay off a replyImages turn", () => {
  expect("modalities" in shapeOutboundBody(RAW, args({ replyImages: true, transport: { excludeBody: ["modalities"] } }))).toBe(false);
});

test("rule 7: the effort strip keeps a reasoning_effort the user's extras set", () => {
  const a = args({ features: { ...WIRE_DEFAULT_FEATURES, effort: "none" }, extras: { reasoning_effort: "low" } });
  expect(shapeOutboundBody(RAW, a)["reasoning_effort"]).toBe("low");
  expect(a.warnings).toEqual([]);
});

// A `messages` array the user's includeBody set is theirs whole: no rule rewrites its rows.
test("rule 9: a messages array the user set keeps its message-level marker", () => {
  const marked = [{ role: "user", content: "b", cache_control: { type: "ephemeral" } }];
  expect(shapeOutboundBody(RAW, args({ dialect: "openrouter", transport: { includeBody: { messages: marked } } }))["messages"]).toEqual(marked);
});

test("rules 3 and 4 and image detail: a messages array the user set gets no name, media or detail stamped on it", () => {
  const theirs = [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://cdn/u.png" } }] }];
  const p = plan([{ role: "user", toolExchange: false, text: "" }], {
    names: new Map([[0, "Alice"]]),
    assistantMedia: new Map([[0, [{ kind: "image", url: "https://cdn/x.png" }]]]),
  });
  const out = shapeOutboundBody(RAW, { ...args({ plan: p, transport: { includeBody: { messages: theirs } } }), imageDetail: "high" });
  expect(out["messages"]).toEqual(theirs);
});

test("rules 5 and 5b: kwargs the user set to a non-object stay as set, under the switch and the prefill interlock", () => {
  const ends = plan([{ role: "assistant", toolExchange: false, text: "…" }], { endsOnAssistant: true });
  for (const value of [null, "none", 0, []]) {
    for (const own of [{ extras: { chat_template_kwargs: value } }, { transport: { includeBody: { chat_template_kwargs: value } } }]) {
      for (const templateThinking of [false, true]) {
        expect(shapeOutboundBody(RAW, args({ ...own, features: KWARGS_OFF, templateThinking }))["chat_template_kwargs"]).toEqual(value);
      }
      const interlock = args({ ...own, plan: ends, features: { ...CONTINUE, thinkingOff: "chat_template_kwargs" }, prefillAllowed: true });
      const out = shapeOutboundBody(RAW, interlock);
      expect([out["chat_template_kwargs"], out["reasoning_effort"]]).toEqual([value, "high"]);
      expect(interlock.warnings).toEqual([]);
    }
  }
});

test("rule 5: a messages array the user set takes no prefill pair and no interlock from the app's plan", () => {
  const ends = plan([{ role: "assistant", toolExchange: false, text: "…" }], { endsOnAssistant: true });
  const theirs = [{ role: "user", content: "a" }];
  const a = args({ plan: ends, features: CONTINUE, prefillAllowed: true, transport: { includeBody: { messages: theirs } } });
  const out = shapeOutboundBody(RAW, a);
  expect(["continue_final_message" in out, "add_generation_prompt" in out, "chat_template_kwargs" in out, out["reasoning_effort"]]).toEqual([
    false,
    false,
    false,
    "high",
  ]);
  expect(a.warnings).toEqual([]);
});

test("rule 10: a messages array the user set is not folded", () => {
  const plainRun = [
    { role: "user", content: "a" },
    { role: "user", content: "b" },
  ];
  expect(shapeOutboundBody(RAW, args({ foldSameRole: true, transport: { includeBody: { messages: plainRun } } }))["messages"]).toEqual(plainRun);
});

test("a reasoning-on turn tells the template to think, but never over an off already in the kwargs", () => {
  expect(shapeOutboundBody(RAW, args({ features: KWARGS_OFF, templateThinking: true }))["chat_template_kwargs"]).toEqual({ enable_thinking: true });
  // The user's own off (extras), like the prefill interlock's, outranks a preset that asks for thinking.
  const userOff = shapeOutboundBody(RAW, args({ features: KWARGS_OFF, templateThinking: true, extras: { chat_template_kwargs: { enable_thinking: false } } }));
  expect(userOff["chat_template_kwargs"]).toEqual({ enable_thinking: false });
});

test("replyImages spells modalities; an effort the row cannot spell is stripped with effort_dropped", () => {
  const withImages = shapeOutboundBody(RAW, args({ replyImages: true }));
  expect(withImages["modalities"]).toEqual(["text", "image"]);
  // THE OTHER HALF (§6.7, receipt 4): the funnel drops the knob on a text-only model, and the drop must
  // reach the wire as ABSENCE. A body that asked for images anyway is what a text-only endpoint 400s on,
  // so "no warning" and "no field" are one claim.
  expect("modalities" in shapeOutboundBody(RAW, args({ replyImages: false }))).toBe(false);
  expect(withImages["reasoning_effort"]).toBe("high");
  const a = args({ features: { ...WIRE_DEFAULT_FEATURES, effort: "none" } });
  const stripped = shapeOutboundBody(RAW, a);
  expect(stripped["reasoning_effort"]).toBeUndefined();
  expect(a.warnings.map((w) => w.code)).toEqual(["effort_dropped"]);
  // The openrouter transport models effort itself; nothing is stripped there.
  const or = args({ dialect: "openrouter", features: { ...WIRE_DEFAULT_FEATURES, effort: "none" } });
  expect(shapeOutboundBody(RAW, or)["reasoning_effort"]).toBe("high");
});

// Rule 8 (H2, measured 2026-09-20): OpenAI's reasoning models 400 on the SDK's `max_tokens`
// (`req_f68c8dc2e4a24908a2e5be64132edbc0`: "Unsupported parameter: 'max_tokens' … Use 'max_completion_tokens'")
// and accept the renamed cap (`req_8eff1a4cbff5461b820f47331f2c26b2`); the row's `features.outputCapField` says which
// word the server takes. The openrouter transport speaks OR's own body and is never renamed.
test("outputCapField: max_completion_tokens renames the SDK's max_tokens; absent / max_tokens / openrouter leave it", () => {
  const capped = { ...RAW, max_tokens: 100 };
  const renamed = shapeOutboundBody(capped, args({ features: { ...SPELLS_EFFORT, outputCapField: "max_completion_tokens" } }));
  expect(renamed["max_completion_tokens"]).toBe(100);
  expect("max_tokens" in renamed).toBe(false);
  // The default (absent) and the explicit `max_tokens` spelling both keep the SDK's word.
  expect(shapeOutboundBody(capped, args())["max_tokens"]).toBe(100);
  expect(shapeOutboundBody(capped, args({ features: { ...SPELLS_EFFORT, outputCapField: "max_tokens" } }))["max_tokens"]).toBe(100);
  // The openrouter dialect is untouched even when a row (wrongly) declares the field.
  const or = shapeOutboundBody(capped, args({ dialect: "openrouter", features: { ...SPELLS_EFFORT, outputCapField: "max_completion_tokens" } }));
  expect(or["max_tokens"]).toBe(100);
  expect("max_completion_tokens" in or).toBe(false);
  // Pure: the SDK's object is untouched.
  expect(capped["max_tokens"]).toBe(100);
});

// Rule 9 on a row with no text to carry the marker: an assistant tool-call row has `content: null`, and an empty
// text block cannot hold `cache_control`. OpenRouter drops a message-level marker there
// (gen-1790145899-YEYx8CfmJdExgPTOB9u4) and forwards the same marker on the preceding user text part
// (gen-1790145901-ZwS0tawK8pqSw284khqj), so the breakpoint moves to the nearest earlier row with text — a shorter
// prefix of the same history, still a valid cache entry.
const CC = { type: "ephemeral", ttl: "1h" };

test("rule 9: a marker on a text-less tool-call row moves to the nearest earlier text part", () => {
  const raw = {
    model: "anthropic/claude-sonnet-5",
    messages: [
      { role: "system", content: [{ type: "text", text: "You are Mira.", cache_control: CC }] },
      { role: "user", content: "What is the tide?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_1", type: "function", function: { name: "get_tide", arguments: "{}" } }],
        cache_control: CC,
      },
      { role: "tool", tool_call_id: "call_1", content: "High tide at 6." },
      { role: "user", content: "And tomorrow?" },
    ],
  };
  const messages = recordsAt(shapeOutboundBody(raw, args({ dialect: "openrouter" })), "messages");
  for (const message of messages) {
    expect(message, String(message["role"])).not.toHaveProperty("cache_control");
  }
  expect(messages[1]).toEqual({ role: "user", content: [{ type: "text", text: "What is the tide?", cache_control: CC }] });
  expect(messages[2]).toMatchObject({ role: "assistant", content: null });
});

test("rule 9: a moved marker never doubles up on a row that already carries one", () => {
  const raw = {
    model: "anthropic/claude-sonnet-5",
    messages: [
      { role: "user", content: [{ type: "text", text: "What is the tide?", cache_control: CC }] },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_1", type: "function", function: { name: "get_tide", arguments: "{}" } }],
        cache_control: CC,
      },
    ],
  };
  const messages = recordsAt(shapeOutboundBody(raw, args({ dialect: "openrouter" })), "messages");
  expect(JSON.stringify(messages).split("cache_control").length - 1).toBe(1);
  expect(messages[1]).not.toHaveProperty("cache_control");
});

// Rule 10: SHAPE keeps the stored rows of a same-role run apart when the turn caches by explicit Anthropic
// markers; the body folds them into one message of parts so the wire alternates and each marked row keeps its end.
const ROUND = {
  model: "anthropic/claude-sonnet-5",
  messages: [
    { role: "system", content: [{ type: "text", text: "You are the narrator.", cache_control: CC }] },
    { role: "user", content: "We head for the harbor." },
    { role: "assistant", content: "Mira: Mira leads." },
    { role: "assistant", content: "Wren: Wren scouts.", cache_control: CC },
    { role: "user", content: "[Write the next reply only as Kai.]" },
  ],
};

test("rule 10: consecutive plain rows fold into one message, one part per row, the marker on its own row's part", () => {
  const messages = recordsAt(shapeOutboundBody(ROUND, args({ dialect: "openrouter", foldSameRole: true })), "messages");
  expect(messages.map((message) => message["role"])).toEqual(["system", "user", "assistant", "user"]);
  expect(messages[2]).toEqual({
    role: "assistant",
    content: [
      { type: "text", text: "Mira: Mira leads." },
      { type: "text", text: "Wren: Wren scouts.", cache_control: CC },
    ],
  });
});

test("rule 10: an absent field spelled as an undefined key does not block the fold (the openai-compatible converter)", () => {
  const raw = {
    model: "claude-sonnet-5",
    messages: [
      { role: "user", content: "Go." },
      { role: "assistant", content: "Mira: on it.", tool_calls: undefined },
      { role: "assistant", content: "Wren: me too.", tool_calls: undefined },
    ],
  };
  const messages = recordsAt(shapeOutboundBody(raw, args({ foldSameRole: true })), "messages");
  expect(messages.map((message) => message["role"])).toEqual(["user", "assistant"]);
  expect(messages[1]?.["content"]).toEqual([
    { type: "text", text: "Mira: on it." },
    { type: "text", text: "Wren: me too." },
  ]);
});

test("rule 10: off, the rows pass through untouched (every wire that does not cache by Anthropic markers)", () => {
  const off = shapeOutboundBody(ROUND, args({ dialect: "openrouter" }));
  expect(recordsAt(off, "messages").map((message) => message["role"])).toEqual(["system", "user", "assistant", "assistant", "user"]);
});

test("rule 10: a row carrying a name, tool calls or replayed reasoning keeps its own message", () => {
  const raw = {
    model: "anthropic/claude-sonnet-5",
    messages: [
      { role: "user", content: "Go." },
      { role: "assistant", content: "Mira: on it." },
      { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "roll", arguments: "{}" } }] },
      { role: "assistant", content: "Kai: done.", reasoning: "…", reasoning_details: [] },
      { role: "user", content: "Joe's line", name: "Joe" },
      { role: "user", content: "Alex's line" },
    ],
  };
  const messages = recordsAt(shapeOutboundBody(raw, args({ dialect: "openrouter", foldSameRole: true })), "messages");
  expect(messages).toHaveLength(raw.messages.length);
});

// ── rules 5c and 5d: the carry-off preserve switch and the budget at zero ──────────────────────────────────────

/** A llama.cpp-shaped row: the template switch is the kwarg, and the reasoning budget has its own field. */
const LLAMA_SWITCH: EndpointFeatures = { ...SPELLS_EFFORT, thinkingOff: "chat_template_kwargs", reasoningBudgetField: "thinking_budget_tokens" };

test("rule 5c: a turn whose reasoning carry is off sends preserve_reasoning false beside the switch; the user's own kwarg wins", () => {
  const off = shapeOutboundBody(RAW, args({ features: LLAMA_SWITCH, templateThinking: true, templatePreserveReasoning: false }));
  expect(off["chat_template_kwargs"]).toEqual({ enable_thinking: true, preserve_reasoning: false });
  const theirs = shapeOutboundBody(
    RAW,
    args({ features: LLAMA_SWITCH, templateThinking: true, templatePreserveReasoning: false, extras: { chat_template_kwargs: { preserve_reasoning: true } } }),
  );
  expect(theirs["chat_template_kwargs"]).toEqual({ preserve_reasoning: true, enable_thinking: true });
  // A carry left on sends nothing new; neither does a turn that sends no switch at all, so a proxy that refuses the
  // kwargs never starts seeing them.
  expect(
    shapeOutboundBody(RAW, args({ features: LLAMA_SWITCH, templateThinking: true, templatePreserveReasoning: undefined }))["chat_template_kwargs"],
  ).toEqual({
    enable_thinking: true,
  });
  expect(
    "chat_template_kwargs" in shapeOutboundBody(RAW, args({ features: LLAMA_SWITCH, templateThinking: undefined, templatePreserveReasoning: false })),
  ).toBe(false);
});

test("rule 5d: a turn the template must not think on sends the row's budget field at 0 beside the switch; a user budget key wins", () => {
  const off = shapeOutboundBody(RAW, args({ features: LLAMA_SWITCH, templateThinking: false }));
  expect(off["thinking_budget_tokens"]).toBe(0);
  expect(off["chat_template_kwargs"]).toEqual({ enable_thinking: false });
  const theirs = shapeOutboundBody(RAW, args({ features: LLAMA_SWITCH, templateThinking: false, extras: { thinking_budget_tokens: 256 } }));
  expect(theirs["thinking_budget_tokens"]).toBe(256);
  // vLLM's own field name rides the same rule.
  const vllm = shapeOutboundBody(RAW, args({ features: { ...LLAMA_SWITCH, reasoningBudgetField: "thinking_token_budget" }, templateThinking: false }));
  expect(vllm["thinking_token_budget"]).toBe(0);
  // PLANTED CONTROLS: a thinking turn, a row with no switch, and a row with no budget field send no budget.
  expect("thinking_budget_tokens" in shapeOutboundBody(RAW, args({ features: LLAMA_SWITCH, templateThinking: true }))).toBe(false);
  expect("thinking_budget_tokens" in shapeOutboundBody(RAW, args({ features: { ...LLAMA_SWITCH, thinkingOff: "none" }, templateThinking: false }))).toBe(false);
  expect(Object.keys(shapeOutboundBody(RAW, args({ features: KWARGS_OFF, templateThinking: false })))).not.toContain("thinking_budget_tokens");
});

test("rule 5d defers like 5b wherever the user's body decides the thinking switch: their thinking-on is not cancelled by a budget of 0", () => {
  const theirsOn = shapeOutboundBody(
    RAW,
    args({ features: LLAMA_SWITCH, templateThinking: false, extras: { chat_template_kwargs: { enable_thinking: true } } }),
  );
  expect(theirsOn["chat_template_kwargs"]).toEqual({ enable_thinking: true });
  expect("thinking_budget_tokens" in theirsOn).toBe(false);
  const excluded = shapeOutboundBody(
    RAW,
    args({ features: LLAMA_SWITCH, templateThinking: false, transport: { includeBody: {}, excludeBody: ["chat_template_kwargs"] } }),
  );
  expect("thinking_budget_tokens" in excluded).toBe(false);
  // PLANTED CONTROL: kwargs the user set without the switch leave the switch, and so the budget, to the rules.
  const otherKwarg = shapeOutboundBody(RAW, args({ features: LLAMA_SWITCH, templateThinking: false, extras: { chat_template_kwargs: { foo: 1 } } }));
  expect(otherKwarg["thinking_budget_tokens"]).toBe(0);
  expect(otherKwarg["chat_template_kwargs"]).toEqual({ foo: 1, enable_thinking: false });
});

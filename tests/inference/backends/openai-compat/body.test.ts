// backends/openai-compat/body — the outbound-body shaper's seven rules (§8.1, D143(b)/D156): a belt key or
// a modelled collision in `extras` is DROPPED with `custom_parameters_ignored{key}` and a non-colliding key
// reaches the wire (the H4 order pin); the openrouter transport drops everything but its two modelled keys;
// a prototype-pollution key never lands (the Layer-2 merge); include/exclude apply AFTER extras; the
// assistant-media + name re-attachment walks the plan by index and refuses on a length mismatch; the prefill
// pair only when features + capability + array agree, with the measured thinking interlock; `modalities`
// on replyImages; `reasoning_effort` stripped with `effort_dropped` when the row spells no effort.

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
    foldSameRole: false,
    replyImages: false,
    warnings: [],
    ...overrides,
  };
}

const RAW = { model: "m", messages: [{ role: "user", content: "hi" }], temperature: 0.7, reasoning_effort: "high" };

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

test("extras: belt keys and modelled collisions drop with the key named; a fresh key reaches the wire (H4 order)", () => {
  const a = args({ extras: { model: "evil", stream: true, temperature: 0.1, chat_template_kwargs: { enable_thinking: false } } });
  const out = shapeOutboundBody(RAW, a);
  expect(out["model"]).toBe("m");
  expect(out["stream"]).toBeUndefined();
  expect(out["temperature"]).toBe(0.7);
  expect(out["chat_template_kwargs"]).toEqual({ enable_thinking: false });
  expect(a.warnings.map((w) => [w.code, w.key])).toEqual([
    ["custom_parameters_ignored", "model"],
    ["custom_parameters_ignored", "stream"],
    ["custom_parameters_ignored", "temperature"],
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
      { role: "system", content: [{ type: "text", text: "You are Mara.", cache_control: CC }] },
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
    { role: "assistant", content: "Mara: Mara leads." },
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
      { type: "text", text: "Mara: Mara leads." },
      { type: "text", text: "Wren: Wren scouts.", cache_control: CC },
    ],
  });
});

test("rule 10: an absent field spelled as an undefined key does not block the fold (the openai-compatible converter)", () => {
  const raw = {
    model: "claude-sonnet-5",
    messages: [
      { role: "user", content: "Go." },
      { role: "assistant", content: "Mara: on it.", tool_calls: undefined },
      { role: "assistant", content: "Wren: me too.", tool_calls: undefined },
    ],
  };
  const messages = recordsAt(shapeOutboundBody(raw, args({ foldSameRole: true })), "messages");
  expect(messages.map((message) => message["role"])).toEqual(["user", "assistant"]);
  expect(messages[1]?.["content"]).toEqual([
    { type: "text", text: "Mara: on it." },
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
      { role: "assistant", content: "Mara: on it." },
      { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "roll", arguments: "{}" } }] },
      { role: "assistant", content: "Kai: done.", reasoning: "…", reasoning_details: [] },
      { role: "user", content: "Joe's line", name: "Joe" },
      { role: "user", content: "the owner's line" },
    ],
  };
  const messages = recordsAt(shapeOutboundBody(raw, args({ dialect: "openrouter", foldSameRole: true })), "messages");
  expect(messages).toHaveLength(raw.messages.length);
});

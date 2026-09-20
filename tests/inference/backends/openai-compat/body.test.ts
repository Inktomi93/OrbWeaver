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
  expect(withImages["reasoning_effort"]).toBe("high");
  const a = args({ features: { ...WIRE_DEFAULT_FEATURES, effort: "none" } });
  const stripped = shapeOutboundBody(RAW, a);
  expect(stripped["reasoning_effort"]).toBeUndefined();
  expect(a.warnings.map((w) => w.code)).toEqual(["effort_dropped"]);
  // The openrouter transport models effort itself; nothing is stripped there.
  const or = args({ dialect: "openrouter", features: { ...WIRE_DEFAULT_FEATURES, effort: "none" } });
  expect(shapeOutboundBody(RAW, or)["reasoning_effort"]).toBe("high");
});

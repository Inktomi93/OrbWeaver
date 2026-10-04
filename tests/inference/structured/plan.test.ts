// planStructured — the one structured-output layer: a need in, one wire plan or every violation out. The recorded
// Anthropic refusals are reproduced from the vendor's own arithmetic, and each refusal row carries a planted control
// that plans.

import type { WireSchemaLimits } from "@orb/contracts/inference";
import { effectiveStructuredLimits } from "@orb/contracts/inference";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import type { ResponseFormat } from "../../../packages/inference/src/contract/chat.ts";
import { planStructured, planStructuredFor } from "../../../packages/inference/src/structured/plan.ts";
import type { StructuredTarget } from "../../../packages/inference/src/structured/target.ts";
import { makeCapability, makeGenerationCapability, makeResolved } from "../../support/factories/resolved-connection.ts";
import { expect, test } from "../../support/fixtures.ts";
import { wireSchema } from "../../support/wire-ready.ts";

const ANTHROPIC = effectiveStructuredLimits("anthropic-format", undefined);

function target(overrides: Partial<StructuredTarget> = {}): StructuredTarget {
  return {
    mode: "hosted-common",
    limits: undefined,
    vehicles: ["response-format", "forced-tool", "offered-tool"],
    strictTools: undefined,
    requiredChoice: true,
    namedChoice: true,
    ...overrides,
  };
}

/** A schema of `n` optional string properties, all nullable-free. */
function optionals(n: number): ResponseFormat {
  return {
    name: "wide",
    schema: wireSchema({
      type: "object",
      properties: Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${String(i)}`, { type: "string" }])),
      required: [],
    }),
  };
}

const SMALL: ResponseFormat = { name: "small", schema: wireSchema({ type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }) };

test("the first vehicle on which a format fits wins, an enforcing carrier before a weaker one", () => {
  const plan = planStructured({ formats: [optionals(30), SMALL] }, target({ mode: "anthropic-format", limits: ANTHROPIC, vehicles: ["response-format"] }));
  expect(plan).toMatchObject({ ok: true, shape: 1, responseFormat: { name: "small", vehicle: "response-format" } });
});

test("the recorded Anthropic refusals reproduce: 41 optionals as projected, 41 unions once strict-compatible reshapes them", () => {
  const anthropic = planStructured({ formats: [optionals(41)] }, target({ mode: "anthropic-format", limits: ANTHROPIC, vehicles: ["response-format"] }));
  expect(anthropic).toEqual({
    ok: false,
    violations: [{ kind: "optional-props", mode: "anthropic-format", count: 41, limit: 24, shape: 0, vehicle: "response-format" }],
  });
  // A reshaped optional counts as a union: OpenRouter's strict-compatible wire under Anthropic's ceilings.
  const routed = planStructured({ formats: [optionals(41)] }, target({ mode: "strict-compatible", limits: ANTHROPIC, vehicles: ["response-format"] }));
  expect(routed).toEqual({
    ok: false,
    violations: [{ kind: "union-props", mode: "strict-compatible", count: 41, limit: 16, shape: 0, vehicle: "response-format" }],
  });
  // PLANTED CONTROL: the same schema under a target that states no ceiling plans.
  expect(planStructured({ formats: [optionals(41)] }, target({ mode: "strict-compatible", vehicles: ["response-format"] })).ok).toBe(true);
});

test("a capability with neither structured output nor tools has no vehicle; one with tools only plans the forced tool", () => {
  expect(planStructured({ formats: [SMALL] }, target({ vehicles: [] }))).toEqual({
    ok: false,
    violations: [{ kind: "no-vehicle", mode: "hosted-common", cause: "unsupported" }],
  });
  const forced = planStructured({ formats: [SMALL] }, target({ vehicles: ["forced-tool", "offered-tool"] }));
  expect(forced).toMatchObject({ ok: true, responseFormat: { vehicle: "forced-tool" }, toolChoice: { mode: "tool", name: "small" }, parallelToolCalls: false });
  expect(forced.ok && forced.tools?.map((tool) => tool.name)).toEqual(["small"]);
});

test("a model that refuses forced tool use (Claude 5.x) has `required` and a named choice sent as auto, loudly", () => {
  const tools = [{ name: "set", description: "Set.", parameters: { type: "object", properties: {} } }];
  const refusing = target({ requiredChoice: false, namedChoice: false });
  for (const toolChoice of [{ mode: "required" as const }, { mode: "tool" as const, name: "set" }]) {
    const plan = planStructured({ tools, toolChoice }, refusing);
    expect(plan).toMatchObject({ ok: true, toolChoice: { mode: "auto" } });
    expect(plan.ok && plan.downgrades.map((warning) => warning.code)).toEqual(["tool_choice_downgraded"]);
  }
  // PLANTED CONTROL: a model that takes forced use keeps the choice and raises nothing.
  const kept = planStructured({ tools, toolChoice: { mode: "required" } }, target());
  expect(kept).toMatchObject({ ok: true, toolChoice: { mode: "required" }, downgrades: [] });
});

test("reshapedPaths lists exactly the reshaped properties, with [*] for an array of objects, and only under a reshaping mode", () => {
  const format: ResponseFormat = {
    name: "changes",
    schema: projectJsonSchema(z.object({ note: z.string().optional(), changes: z.array(z.object({ field: z.string(), value: z.string().optional() })) })),
  };
  const strict = planStructured({ formats: [format] }, target({ mode: "strict-compatible", vehicles: ["response-format"] }));
  expect(strict).toMatchObject({ ok: true, responseFormat: { strict: true, nullMeansAbsent: true } });
  expect(strict.ok && strict.responseFormat?.reshapedPaths.toSorted()).toEqual(["changes[*].value", "note"]);
  const hosted = planStructured({ formats: [format] }, target({ vehicles: ["response-format"] }));
  expect(hosted).toMatchObject({ ok: true, responseFormat: { strict: false, nullMeansAbsent: false, reshapedPaths: [] } });
});

test("an optional AND nullable property under strict-compatible refuses with ambiguous-null naming its path", () => {
  const format: ResponseFormat = { name: "x", schema: projectJsonSchema(z.object({ keep: z.string(), maybe: z.string().nullable().optional() })) };
  expect(planStructured({ formats: [format] }, target({ mode: "strict-compatible", vehicles: ["response-format"] }))).toEqual({
    ok: false,
    violations: [{ kind: "ambiguous-null", mode: "strict-compatible", path: "maybe", shape: 0, vehicle: "response-format" }],
  });
  // PLANTED CONTROL: the same field required (the author's own null) plans and is never dropped.
  const required: ResponseFormat = { name: "x", schema: projectJsonSchema(z.object({ keep: z.string(), maybe: z.string().nullable() })) };
  const plan = planStructured({ formats: [required] }, target({ mode: "strict-compatible", vehicles: ["response-format"] }));
  expect(plan).toMatchObject({ ok: true, responseFormat: { reshapedPaths: [] } });
});

test("a capability row's own lower ceiling beats the mode's default, field by field", () => {
  const limits: WireSchemaLimits | undefined = effectiveStructuredLimits("anthropic-format", { maxOptionalProps: 4 });
  expect(limits).toMatchObject({ maxOptionalProps: 4, maxUnionProps: 16 });
  expect(planStructured({ formats: [optionals(5)] }, target({ mode: "anthropic-format", limits, vehicles: ["response-format"] }))).toMatchObject({
    ok: false,
    violations: [{ kind: "optional-props", count: 5, limit: 4 }],
  });
  expect(planStructured({ formats: [optionals(4)] }, target({ mode: "anthropic-format", limits, vehicles: ["response-format"] })).ok).toBe(true);
});

test("strict tools count against the shared ceilings with the response schema: their strict-tools ceiling refuses the request", () => {
  const strictTool = (name: string): { name: string; description: string; parameters: Record<string, unknown>; strict: true } => ({
    name,
    description: name,
    parameters: { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
    strict: true,
  });
  const many = Array.from({ length: 21 }, (_, i) => strictTool(`t${String(i)}`));
  expect(planStructured({ tools: many }, target({ mode: "anthropic-format", limits: ANTHROPIC }))).toMatchObject({
    ok: false,
    violations: [{ kind: "strict-tools", count: 21, limit: 20 }],
  });
  // PLANTED CONTROL: the same tools without `strict` are prompt material, counted by nobody.
  const loose = many.map(({ strict: _strict, ...tool }) => tool);
  expect(planStructured({ tools: loose }, target({ mode: "anthropic-format", limits: ANTHROPIC })).ok).toBe(true);
});

const UNIQUE_TAGS = wireSchema({ type: "object", properties: { t: { type: "array", items: { type: "string" }, uniqueItems: true } } });

test("a caller tool whose schema the grammar refuses goes out non-strict, loudly, and the turn's other tools stay strict", () => {
  const tools = [
    { name: "tags", description: "Tags.", parameters: UNIQUE_TAGS },
    { name: "plain", description: "Plain.", parameters: { type: "object", properties: { a: { type: "string" } } } },
  ];
  const plan = planStructured({ tools }, target({ mode: "guided-decoding", strictTools: "default-on" }));
  expect(plan).toMatchObject({
    ok: true,
    tools: [
      { name: "tags", strict: false },
      { name: "plain", strict: true },
    ],
  });
  expect(plan.ok && plan.downgrades.map((warning) => warning.code)).toEqual(["sdk_unsupported_tool"]);
  // The structured payload is the caller's reply contract, so its own refusal still blocks rather than relaxing.
  const payload = planStructured(
    { formats: [{ name: "row", schema: UNIQUE_TAGS }] },
    target({ mode: "guided-decoding", vehicles: ["forced-tool"], strictTools: "default-on" }),
  );
  expect(payload).toMatchObject({ ok: false, violations: [{ kind: "refused-keyword", keyword: "uniqueItems" }] });
});

test("a schema over the ceilings still rides one offered tool where the model takes tools, because no grammar compiles it", () => {
  const plan = planStructured(
    { formats: [optionals(30)] },
    target({ mode: "anthropic-format", limits: ANTHROPIC, vehicles: ["response-format", "offered-tool"] }),
  );
  expect(plan).toMatchObject({ ok: true, responseFormat: { vehicle: "offered-tool" }, toolChoice: { mode: "auto" } });
});

test("agent-sdk: the CLI sends StructuredOutput as a non-strict tool it validates itself, so Anthropic's ceilings do not refuse there", () => {
  const claude = makeCapability(
    makeGenerationCapability({
      output: { maxTokens: { min: 1, max: 8192 }, structured: true, modalities: ["text"], structuredLimitsFrom: "anthropic-format" },
    }),
  );
  const sdk = planStructuredFor(makeResolved({ providerId: "claude-sub", capability: claude }), { formats: [optionals(41)] });
  expect(sdk).toMatchObject({ ok: true, responseFormat: { vehicle: "response-format" } });
  // PLANTED CONTROL: the same capability on the Messages wire compiles a grammar and is refused at the ceiling.
  const messages = planStructuredFor(makeResolved({ providerId: "anthropic", capability: claude }), { formats: [optionals(41)] });
  expect(messages).toMatchObject({ ok: false, violations: [{ kind: "optional-props", count: 41, limit: 24 }] });
});

test("a turn whose own settings refuse forced tool use gets no forced choice and no forced-tool vehicle", () => {
  const tools = [{ name: "set", description: "Set.", parameters: { type: "object", properties: {} } }];
  const plan = planStructured({ tools, toolChoice: { mode: "required" }, forcedChoice: false }, target());
  expect(plan).toMatchObject({ ok: true, toolChoice: { mode: "auto" } });
  expect(plan.ok && plan.downgrades.map((warning) => warning.code)).toEqual(["tool_choice_downgraded"]);
  const format = planStructured({ formats: [SMALL], forcedChoice: false }, target({ vehicles: ["forced-tool", "offered-tool"] }));
  expect(format).toMatchObject({ ok: true, responseFormat: { vehicle: "offered-tool" }, toolChoice: { mode: "auto" } });
});

test("a turn whose shape refuses the native carrier (an Anthropic prefill) rides the payload on a tool instead", () => {
  const plan = planStructured({ formats: [SMALL], nativeFormat: false }, target());
  expect(plan).toMatchObject({ ok: true, responseFormat: { vehicle: "forced-tool" } });
  // With no tool to fall back on, the plan refuses before the call instead of sending a request that 400s, and names
  // the prefill as the reason: the model does take structured output, just not on a turn that ends on one.
  expect(planStructured({ formats: [SMALL], nativeFormat: false }, target({ vehicles: ["response-format"] }))).toEqual({
    ok: false,
    violations: [{ kind: "no-vehicle", mode: "hosted-common", cause: "assistant-prefill" }],
  });
  // A turn carrying the caller's own tools can only send the payload natively, so the model's tools are no fallback:
  // the cause names those tools, with the prefill or with a model that has no native carrier.
  const callerTools = [{ name: "roll", description: "Roll.", parameters: { type: "object", properties: {} } }];
  expect(planStructured({ formats: [SMALL], tools: callerTools, nativeFormat: false }, target())).toMatchObject({
    violations: [{ kind: "no-vehicle", cause: "tools-with-prefill" }],
  });
  expect(planStructured({ formats: [SMALL], tools: callerTools }, target({ vehicles: ["forced-tool", "offered-tool"] }))).toMatchObject({
    violations: [{ kind: "no-vehicle", cause: "tools-without-native" }],
  });
  // PLANTED CONTROL: a model with no carrier at all is refused for that, prefill or not.
  expect(planStructured({ formats: [SMALL], nativeFormat: false }, target({ vehicles: [] }))).toMatchObject({
    violations: [{ kind: "no-vehicle", cause: "unsupported" }],
  });
});

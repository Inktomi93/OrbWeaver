// planStructured — the one structured-output layer: a need in, one wire plan or every violation out. The recorded
// Anthropic refusals are reproduced from the vendor's own arithmetic, and each refusal row carries a planted control
// that plans.

import type { EndpointFeatures, WireSchemaLimits, WireSchemaMode } from "@orb/contracts/inference";
import { effectiveStructuredLimits } from "@orb/contracts/inference";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import type { ResponseFormat } from "../../../packages/inference/src/contract/chat.ts";
import type { Resolved } from "../../../packages/inference/src/contract/resolved.ts";
import { planStructuredFor } from "../../../packages/inference/src/structured/plan.ts";
import { makeCapability, makeGenerationCapability, makeResolved } from "../../support/factories/resolved-connection.ts";
import { expect, test } from "../../support/fixtures.ts";
import { wireSchema } from "../../support/wire-ready.ts";

const ANTHROPIC = effectiveStructuredLimits("anthropic-format", undefined);

function target(
  overrides: {
    readonly mode?: WireSchemaMode;
    readonly limits?: WireSchemaLimits | undefined;
    readonly native?: boolean;
    readonly tools?: boolean;
    readonly strictTools?: EndpointFeatures["strictJson"];
    readonly requiredChoice?: boolean;
    readonly namedChoice?: boolean;
    readonly noneChoice?: boolean;
    readonly requiresReasoningOff?: boolean;
  } = {},
): Resolved {
  const generation = makeGenerationCapability({
    ...(overrides.tools === false
      ? {}
      : {
          tools: {
            parallel: true,
            requiredChoice: overrides.requiredChoice ?? true,
            namedChoice: overrides.namedChoice ?? true,
            noneChoice: overrides.noneChoice ?? true,
            requiresReasoningOff: overrides.requiresReasoningOff ?? false,
          },
        }),
    output: {
      maxTokens: { min: 1, max: 8192 },
      modalities: ["text"],
      structured: overrides.native !== false,
      ...(overrides.limits === undefined ? {} : { structuredLimits: overrides.limits }),
    },
  });
  const resolved = makeResolved({ generation });
  return {
    ...resolved,
    features: {
      ...resolved.features,
      structuredMode: overrides.mode ?? "hosted-common",
      ...(overrides.strictTools === undefined ? {} : { strictJson: overrides.strictTools }),
    },
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
  const plan = planStructuredFor(target({ mode: "anthropic-format", limits: ANTHROPIC, tools: false }), { formats: [optionals(30), SMALL] });
  expect(plan).toMatchObject({ ok: true, shape: 1, responseFormat: { name: "small", vehicle: "response-format" } });
});

test("the recorded Anthropic refusals reproduce: 41 optionals as projected, 41 unions once strict-compatible reshapes them", () => {
  const anthropic = planStructuredFor(target({ mode: "anthropic-format", limits: ANTHROPIC, tools: false }), { formats: [optionals(41)] });
  expect(anthropic).toEqual({
    ok: false,
    violations: [{ kind: "optional-props", mode: "anthropic-format", count: 41, limit: 24, shape: 0, vehicle: "response-format" }],
  });
  // A reshaped optional counts as a union: OpenRouter's strict-compatible wire under Anthropic's ceilings.
  const routed = planStructuredFor(target({ mode: "strict-compatible", limits: ANTHROPIC, tools: false }), { formats: [optionals(41)] });
  expect(routed).toEqual({
    ok: false,
    violations: [{ kind: "union-props", mode: "strict-compatible", count: 41, limit: 16, shape: 0, vehicle: "response-format" }],
  });
  // PLANTED CONTROL: the same schema under a target that states no ceiling plans.
  expect(planStructuredFor(target({ mode: "strict-compatible", tools: false }), { formats: [optionals(41)] }).ok).toBe(true);
});

test("a capability with neither structured output nor tools has no vehicle; one with tools only plans the forced tool", () => {
  expect(planStructuredFor(target({ native: false, tools: false }), { formats: [SMALL] })).toEqual({
    ok: false,
    violations: [{ kind: "no-vehicle", mode: "hosted-common", cause: "unsupported" }],
  });
  const forced = planStructuredFor(target({ native: false }), { formats: [SMALL] });
  expect(forced).toMatchObject({ ok: true, responseFormat: { vehicle: "forced-tool" }, toolChoice: { mode: "tool", name: "small" }, parallelToolCalls: false });
  expect(forced.ok && forced.tools?.map((tool) => tool.name)).toEqual(["small"]);
});

test("a model that refuses forced tool use (Claude 5.x) has `required` and a named choice sent as auto, loudly", () => {
  const tools = [{ name: "set", description: "Set.", parameters: { type: "object", properties: {} } }];
  const refusing = target({ requiredChoice: false, namedChoice: false });
  for (const toolChoice of [{ mode: "required" as const }, { mode: "tool" as const, name: "set" }]) {
    const plan = planStructuredFor(refusing, { tools, toolChoice });
    expect(plan).toMatchObject({ ok: true, toolChoice: { mode: "auto" } });
    expect(plan.ok && plan.downgrades.map((warning) => warning.code)).toEqual(["tool_choice_downgraded"]);
  }
  // PLANTED CONTROL: a model that takes forced use keeps the choice and raises nothing.
  const kept = planStructuredFor(target(), { tools, toolChoice: { mode: "required" } });
  expect(kept).toMatchObject({ ok: true, toolChoice: { mode: "required" }, downgrades: [] });
});

test("a `none` the server cannot carry offers no tools, loudly; where it can, the tools ride under none", () => {
  const tools = [{ name: "set", description: "Set.", parameters: { type: "object", properties: {} } }];
  const withdrawn = planStructuredFor(target({ noneChoice: false }), { tools, toolChoice: { mode: "none" } });
  expect(withdrawn.ok && withdrawn.tools).toBeUndefined();
  expect(withdrawn.ok && withdrawn.toolChoice).toBeUndefined();
  expect(withdrawn.ok && withdrawn.downgrades.map((warning) => warning.code)).toEqual(["tool_choice_downgraded"]);
  const carried = planStructuredFor(target(), { tools, toolChoice: { mode: "none" } });
  expect(carried).toMatchObject({ ok: true, toolChoice: { mode: "none" }, downgrades: [] });
  expect(carried.ok && carried.tools?.map((tool) => tool.name)).toEqual(["set"]);
  // `auto` on the same server keeps its tools: only an unsendable none withdraws them.
  expect(planStructuredFor(target({ noneChoice: false }), { tools, toolChoice: { mode: "auto" } })).toMatchObject({ ok: true, downgrades: [] });
});

test("reshapedPaths lists exactly the reshaped properties, with [*] for an array of objects, and only under a reshaping mode", () => {
  const format: ResponseFormat = {
    name: "changes",
    schema: projectJsonSchema(z.object({ note: z.string().optional(), changes: z.array(z.object({ field: z.string(), value: z.string().optional() })) })),
  };
  const strict = planStructuredFor(target({ mode: "strict-compatible", tools: false }), { formats: [format] });
  expect(strict).toMatchObject({ ok: true, responseFormat: { strict: true, nullMeansAbsent: true } });
  expect(strict.ok && strict.responseFormat?.reshapedPaths.toSorted()).toEqual(["changes[*].value", "note"]);
  const hosted = planStructuredFor(target({ tools: false }), { formats: [format] });
  expect(hosted).toMatchObject({ ok: true, responseFormat: { strict: false, nullMeansAbsent: false, reshapedPaths: [] } });
});

test("an optional AND nullable property under strict-compatible refuses with ambiguous-null naming its path", () => {
  const format: ResponseFormat = { name: "x", schema: projectJsonSchema(z.object({ keep: z.string(), maybe: z.string().nullable().optional() })) };
  expect(planStructuredFor(target({ mode: "strict-compatible", tools: false }), { formats: [format] })).toEqual({
    ok: false,
    violations: [{ kind: "ambiguous-null", mode: "strict-compatible", path: "maybe", shape: 0, vehicle: "response-format" }],
  });
  // PLANTED CONTROL: the same field required (the author's own null) plans and is never dropped.
  const required: ResponseFormat = { name: "x", schema: projectJsonSchema(z.object({ keep: z.string(), maybe: z.string().nullable() })) };
  const plan = planStructuredFor(target({ mode: "strict-compatible", tools: false }), { formats: [required] });
  expect(plan).toMatchObject({ ok: true, responseFormat: { reshapedPaths: [] } });
});

test("a capability row's own lower ceiling beats the mode's default, field by field", () => {
  const limits: WireSchemaLimits | undefined = effectiveStructuredLimits("anthropic-format", { maxOptionalProps: 4 });
  expect(limits).toMatchObject({ maxOptionalProps: 4, maxUnionProps: 16 });
  expect(planStructuredFor(target({ mode: "anthropic-format", limits, tools: false }), { formats: [optionals(5)] })).toMatchObject({
    ok: false,
    violations: [{ kind: "optional-props", count: 5, limit: 4 }],
  });
  expect(planStructuredFor(target({ mode: "anthropic-format", limits, tools: false }), { formats: [optionals(4)] }).ok).toBe(true);
});

test("strict tools count against the shared ceilings with the response schema: their strict-tools ceiling refuses the request", () => {
  const strictTool = (name: string): { name: string; description: string; parameters: Record<string, unknown>; strict: true } => ({
    name,
    description: name,
    parameters: { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
    strict: true,
  });
  const many = Array.from({ length: 21 }, (_, i) => strictTool(`t${String(i)}`));
  expect(planStructuredFor(target({ mode: "anthropic-format", limits: ANTHROPIC }), { tools: many })).toMatchObject({
    ok: false,
    violations: [{ kind: "strict-tools", count: 21, limit: 20 }],
  });
  // PLANTED CONTROL: the same tools without `strict` are prompt material, counted by nobody.
  const loose = many.map(({ strict: _strict, ...tool }) => tool);
  expect(planStructuredFor(target({ mode: "anthropic-format", limits: ANTHROPIC }), { tools: loose }).ok).toBe(true);
});

const UNIQUE_TAGS = wireSchema({ type: "object", properties: { t: { type: "array", items: { type: "string" }, uniqueItems: true } } });

test("a caller tool whose schema the grammar refuses goes out non-strict, loudly, and the turn's other tools stay strict", () => {
  const tools = [
    { name: "tags", description: "Tags.", parameters: UNIQUE_TAGS },
    { name: "plain", description: "Plain.", parameters: { type: "object", properties: { a: { type: "string" } } } },
  ];
  const plan = planStructuredFor(target({ mode: "guided-decoding", strictTools: "default-on" }), { tools });
  expect(plan).toMatchObject({
    ok: true,
    tools: [
      { name: "tags", strict: false },
      { name: "plain", strict: true },
    ],
  });
  expect(plan.ok && plan.downgrades.map((warning) => warning.code)).toEqual(["sdk_unsupported_tool"]);
  // The structured payload is the caller's reply contract, so its own refusal still blocks rather than relaxing.
  const payload = planStructuredFor(target({ mode: "guided-decoding", native: false, strictTools: "default-on" }), {
    formats: [{ name: "row", schema: UNIQUE_TAGS }],
  });
  expect(payload).toEqual({
    ok: false,
    violations: ["forced-tool", "offered-tool"].map((vehicle) => ({
      kind: "refused-keyword",
      mode: "guided-decoding",
      keyword: "uniqueItems",
      path: "t",
      shape: 0,
      vehicle,
    })),
  });
});

test("a schema over the ceilings still rides one offered tool where the model takes tools, because no grammar compiles it", () => {
  const plan = planStructuredFor(target({ mode: "anthropic-format", limits: ANTHROPIC, namedChoice: false }), { formats: [optionals(30)] });
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
  const plan = planStructuredFor(target(), { tools, toolChoice: { mode: "required" }, forcedChoice: false });
  expect(plan).toMatchObject({ ok: true, toolChoice: { mode: "auto" } });
  expect(plan.ok && plan.downgrades.map((warning) => warning.code)).toEqual(["tool_choice_downgraded"]);
  const format = planStructuredFor(target({ native: false }), { formats: [SMALL], forcedChoice: false });
  expect(format).toMatchObject({ ok: true, responseFormat: { vehicle: "offered-tool" }, toolChoice: { mode: "auto" } });
});

test("a turn whose shape refuses the native carrier (an Anthropic prefill) rides the payload on a tool instead", () => {
  const plan = planStructuredFor(target(), { formats: [SMALL], nativeFormat: false });
  expect(plan).toMatchObject({ ok: true, responseFormat: { vehicle: "forced-tool" } });
  // With no tool to fall back on, the plan refuses before the call instead of sending a request that 400s, and names
  // the prefill as the reason: the model does take structured output, just not on a turn that ends on one.
  expect(planStructuredFor(target({ tools: false }), { formats: [SMALL], nativeFormat: false })).toEqual({
    ok: false,
    violations: [{ kind: "no-vehicle", mode: "hosted-common", cause: "assistant-prefill" }],
  });
  // A turn carrying the caller's own tools can only send the payload natively, so the model's tools are no fallback:
  // the cause names those tools, with the prefill or with a model that has no native carrier.
  const callerTools = [{ name: "roll", description: "Roll.", parameters: { type: "object", properties: {} } }];
  expect(planStructuredFor(target(), { formats: [SMALL], tools: callerTools, nativeFormat: false })).toMatchObject({
    violations: [{ kind: "no-vehicle", cause: "tools-with-prefill" }],
  });
  expect(planStructuredFor(target({ native: false }), { formats: [SMALL], tools: callerTools })).toMatchObject({
    violations: [{ kind: "no-vehicle", cause: "tools-without-native" }],
  });
  // PLANTED CONTROL: a model with no carrier at all is refused for that, prefill or not.
  expect(planStructuredFor(target({ native: false, tools: false }), { formats: [SMALL], nativeFormat: false })).toMatchObject({
    violations: [{ kind: "no-vehicle", cause: "unsupported" }],
  });
});

test("Gemini payload semantics refuse before any carrier; optional recursion plans without invented vendor ceilings", () => {
  const endpoint = target({ mode: "gemini-schema", native: true });
  const unsupported: ResponseFormat = {
    name: "result",
    schema: wireSchema({ type: "object", properties: { value: { type: "string", not: { enum: ["bad"] } } } }),
  };
  const refused = planStructuredFor(endpoint, { formats: [unsupported] });
  expect(refused).toMatchObject({
    ok: false,
    violations: [
      { kind: "refused-keyword", keyword: "not", vehicle: "response-format" },
      { kind: "refused-keyword", keyword: "not", vehicle: "forced-tool" },
      { kind: "refused-keyword", keyword: "not", vehicle: "offered-tool" },
    ],
  });
  const schema = (required: readonly string[]): ResponseFormat => ({
    name: "tree",
    schema: wireSchema({ type: "object", properties: { next: { $ref: "#" } }, required }),
  });
  expect(planStructuredFor(endpoint, { formats: [schema([])] })).toMatchObject({ ok: true, responseFormat: { vehicle: "response-format" } });
  expect(planStructuredFor(endpoint, { formats: [schema(["next"])] })).toMatchObject({
    ok: false,
    violations: expect.arrayContaining([expect.objectContaining({ kind: "refused-keyword", keyword: "required recursive $ref" })]),
  });
  expect(planStructuredFor(endpoint, { formats: [optionals(41)] })).toMatchObject({ ok: true });
});

test("the OpenRouter adapter refuses explicit strict tools loudly without disabling strict response formats", () => {
  const generation = makeGenerationCapability({
    tools: { parallel: true },
    output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"], structured: true },
  });
  const tools = [
    { name: "write", description: "Write.", parameters: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, strict: true },
  ];
  const routed = planStructuredFor(makeResolved({ providerId: "openrouter", generation }), { formats: [SMALL], tools, toolChoice: { mode: "auto" } });
  expect(routed).toMatchObject({ ok: true, responseFormat: { strict: true }, tools: [{ name: "write", strict: undefined }] });
  expect(routed.ok && routed.downgrades.map((warning) => warning.code)).toEqual(["sdk_unsupported_tool"]);
  const native = planStructuredFor(makeResolved({ providerId: "google", generation }), { tools, toolChoice: { mode: "auto" } });
  expect(native).toMatchObject({ ok: true, tools: [{ name: "write", strict: true }], downgrades: [] });
});

test("Gemini inline required pointer cycles refuse on every available carrier and optional controls still plan", () => {
  const schema = (required: readonly string[]): ResponseFormat => ({
    name: "tree",
    schema: wireSchema({
      type: "object",
      required: ["node"],
      properties: {
        node: { type: "object", required, properties: { next: { $ref: "#/properties/node" } } },
      },
    }),
  });
  for (const vehicle of ["response-format", "forced-tool"] as const) {
    const endpoint = target({ mode: "gemini-schema", native: vehicle === "response-format", tools: vehicle !== "response-format" });
    const vehicles = vehicle === "response-format" ? [vehicle] : [vehicle, "offered-tool"];
    expect(planStructuredFor(endpoint, { formats: [schema(["next"])] })).toEqual({
      ok: false,
      violations: vehicles.map((carrier) => ({
        kind: "refused-keyword",
        mode: "gemini-schema",
        keyword: "required recursive $ref",
        path: "node.next",
        shape: 0,
        vehicle: carrier,
      })),
    });
    expect(planStructuredFor(endpoint, { formats: [schema([])] })).toMatchObject({ ok: true, responseFormat: { vehicle } });
  }
});

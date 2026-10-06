// `planStructured` — the one structured-output layer. A caller states a need (candidate schemas, or tools and a
// tool choice); the plan is the one request this endpoint can carry, or every reason it cannot. Pure: backends
// send the plan and spell nothing of their own; a caller that must choose between shapes asks the same planner.

import type { StructuredVehicle, WireSchemaMode, WireSchemaViolation } from "@orb/contracts/inference";
import { countWireSchemas, describeWireSchemaViolation, scrubViolations, scrubWireSchema, WIRE_SUBSETS } from "@orb/contracts/inference";
import type { RolePresetParams } from "@orb/contracts/preset";
import type { ResponseFormat, ToolChoice, WireTool } from "../contract/chat.ts";
import { assertNever, ProviderError, SCHEMA_REJECTED_DETAIL } from "../contract/errors.ts";
import type { ResolvedWarning } from "../contract/resolve.ts";
import type { Resolved } from "../contract/resolved.ts";
import type { StructuredFit } from "../contract/structured-turn.ts";
import { resolveChat } from "../funnel/resolve-chat.ts";
import type { StructuredTarget } from "./target.ts";
import { structuredTargetOf } from "./target.ts";

/** The description a structured tool carries when the caller gave none: the callers describe the schema, not
 *  the act, and a tool with no description is a measurably worse prompt on every family. */
export const STRUCTURED_TOOL_DESCRIPTION = "Record the result. Call this tool exactly once, with the complete result object.";

/** What a caller needs. A plan with `formats` produces one structured payload; `tools` alone is a tool turn. */
export interface StructuredAsk {
  /** Candidate schemas in preference order. The plan names the index it picked. */
  readonly formats?: readonly ResponseFormat[] | undefined;
  readonly tools?: readonly WireTool[] | undefined;
  readonly toolChoice?: ToolChoice | undefined;
  /** `false` when this turn's own settings refuse forced tool use (Anthropic's manual extended thinking): a forced
   *  choice goes out as `auto`, loudly, and the forced-tool vehicle is not tried. */
  readonly forcedChoice?: false | undefined;
  /** `false` when this turn's own shape refuses the native carrier (an Anthropic assistant prefill cannot ride
   *  `output_config.format`): the payload rides a tool or is refused. */
  readonly nativeFormat?: false | undefined;
  /** The funnel resolved an explicit off; omission leaves the model's reasoning default active. */
  readonly reasoningOff?: boolean | undefined;
}

/** The structured payload as planned: the scrubbed schema, how it rides, and the paths the reply drops a null at. */
export interface PlannedResponseFormat {
  readonly name: string;
  readonly description?: string | undefined;
  readonly schema: Record<string, unknown>;
  /** `response_format.json_schema.strict`: true where the mode compiles a strict grammar. */
  readonly strict: boolean;
  readonly vehicle: StructuredVehicle;
  /** True when the reshape made optionals nullable, so a null at `reshapedPaths` means absent. */
  readonly nullMeansAbsent: boolean;
  readonly reshapedPaths: readonly string[];
}

/** A tool as it goes out: parameters scrubbed for its mode, strictness resolved against the endpoint. */
export interface PlannedTool extends WireTool {
  readonly strict: boolean | undefined;
}

export interface StructuredPlan {
  readonly ok: true;
  /** The endpoint's grammar vocabulary the plan was built for. */
  readonly mode: WireSchemaMode;
  /** The index into `formats` the plan picked; absent on a tool-only plan. */
  readonly shape?: number | undefined;
  readonly responseFormat?: PlannedResponseFormat | undefined;
  readonly tools?: readonly PlannedTool[] | undefined;
  readonly toolChoice?: ToolChoice | undefined;
  /** A tool vehicle rides one call: parallel calls are off. */
  readonly parallelToolCalls?: false | undefined;
  readonly downgrades: readonly ResolvedWarning[];
}

export interface StructuredRefusal {
  readonly ok: false;
  readonly violations: readonly WireSchemaViolation[];
}

/** Modes whose response format is a strict grammar the endpoint enforces. */
const STRICT_FORMAT_MODES: ReadonlySet<WireSchemaMode> = new Set<WireSchemaMode>(["strict-compatible", "guided-decoding"]);

// The endpoint states what it can do and the tool states what it asks for: `never` refuses even an explicit
// `strict: true`, loudly, and `default-on` makes strict the default a tool opts out of.
function strictOf(tool: WireTool, target: StructuredTarget, downgrades: ResolvedWarning[]): boolean | undefined {
  if (target.strictTools === "never") {
    if (tool.strict !== undefined) {
      downgrades.push({
        code: "sdk_unsupported_tool",
        message: `tool "${tool.name}" asked for strict input mode: this endpoint's row declares no strict JSON support, so the flag was not sent`,
      });
    }
    return;
  }
  return tool.strict ?? (target.strictTools === "default-on" ? true : undefined);
}

/** A non-strict tool's schema is prompt material, so under the reshaping mode it takes the hosted subset; a strict
 *  tool compiles into the endpoint's grammar and takes the full mode. */
function toolModeOf(target: StructuredTarget, strict: boolean | undefined): WireSchemaMode {
  return target.mode === "strict-compatible" && strict !== true ? "hosted-common" : target.mode;
}

interface PlannedToolScrub {
  readonly tool: PlannedTool;
  readonly mode: WireSchemaMode;
  readonly scrub: ReturnType<typeof scrubWireSchema>;
}

function planTool(tool: WireTool, target: StructuredTarget, downgrades: ResolvedWarning[]): PlannedToolScrub {
  const strict = strictOf(tool, target, downgrades);
  const mode = toolModeOf(target, strict);
  const scrub = scrubWireSchema(tool.parameters, mode);
  return { tool: { ...tool, parameters: scrub.schema, strict }, mode, scrub };
}

/** A caller's tool as it goes out. One whose schema the strict grammar cannot carry goes out non-strict, loudly,
 *  instead of failing the whole turn: a non-strict tool is prompt material no grammar compiles, and the turn's
 *  other tools keep their strictness. */
function planCallerTool(tool: WireTool, target: StructuredTarget, downgrades: ResolvedWarning[]): PlannedToolScrub {
  const planned = planTool(tool, target, downgrades);
  const refused = planned.tool.strict === true ? scrubViolations(planned.scrub, planned.mode, false) : [];
  if (refused.length === 0) {
    return planned;
  }
  downgrades.push({
    code: "sdk_unsupported_tool",
    message: `tool "${tool.name}" sent without strict input: ${refused.map(describeWireSchemaViolation).join("; ")}`,
  });
  const mode = toolModeOf(target, false);
  const scrub = scrubWireSchema(tool.parameters, mode);
  return { tool: { ...tool, parameters: scrub.schema, strict: false }, mode, scrub };
}

/** A forced choice of a form the model refuses goes out as `auto` over the same tools, loudly: `auto` no longer
 *  guarantees a call, and a caller that relied on the guarantee must be able to see why it lapsed. */
function servableToolChoice(choice: ToolChoice, target: StructuredTarget, downgrades: ResolvedWarning[]): ToolChoice {
  switch (choice.mode) {
    case "auto":
    case "none":
      return choice;
    case "required":
    case "tool":
      if (choice.mode === "required" ? target.requiredChoice : target.namedChoice) {
        return choice;
      }
      downgrades.push({
        code: "tool_choice_downgraded",
        message: `tool choice "${choice.mode === "tool" ? `tool:${choice.name}` : choice.mode}" sent as "auto": this model rejects forced tool use`,
      });
      return { mode: "auto" };
    default:
      return assertNever(choice, "servableToolChoice");
  }
}

/** A `none` choice the endpoint cannot carry would leave every offered tool callable, so the tools are not offered,
 *  loudly: the caller asked for no call, and only withholding the tools guarantees one. */
function withdrawnForNone(ask: StructuredAsk, target: StructuredTarget, downgrades: ResolvedWarning[]): boolean {
  if (ask.toolChoice?.mode !== "none" || target.noneChoice || (ask.tools ?? []).length === 0) {
    return false;
  }
  downgrades.push({
    code: "tool_choice_downgraded",
    message: 'tool choice "none" sent as no tools: this model\'s server takes no tool choice, so offered tools would stay callable',
  });
  return true;
}

/** The violations a request's strict schemas break together. */
function ceilingViolations(target: StructuredTarget, schemas: readonly Record<string, unknown>[], strictTools: number): readonly WireSchemaViolation[] {
  return countWireSchemas(schemas, { mode: target.mode, limits: target.limits, strictTools });
}

function strictEntries(tools: readonly PlannedToolScrub[]): readonly PlannedToolScrub[] {
  return tools.filter((entry) => entry.tool.strict === true);
}

type Attempt =
  | { readonly ok: true; readonly plan: Omit<StructuredPlan, "downgrades" | "ok" | "mode"> }
  | { readonly ok: false; readonly violations: readonly WireSchemaViolation[] };

function responseFormatAttempt(format: ResponseFormat, target: StructuredTarget, callerTools: readonly PlannedToolScrub[]): Attempt {
  const scrub = scrubWireSchema(format.schema, target.mode);
  const strict = strictEntries(callerTools);
  const violations = [
    ...scrubViolations(scrub, target.mode, WIRE_SUBSETS[target.mode].requireAllAsNullable),
    ...ceilingViolations(target, [scrub.schema, ...strict.map((entry) => entry.scrub.schema)], strict.length),
  ];
  if (violations.length > 0) {
    return { ok: false, violations };
  }
  return {
    ok: true,
    plan: {
      responseFormat: {
        name: format.name,
        ...(format.description !== undefined ? { description: format.description } : {}),
        schema: scrub.schema,
        strict: STRICT_FORMAT_MODES.has(target.mode),
        vehicle: "response-format",
        nullMeansAbsent: scrub.reshapedPaths.length > 0,
        reshapedPaths: scrub.reshapedPaths,
      },
      ...(callerTools.length > 0 ? { tools: callerTools.map((entry) => entry.tool) } : {}),
    },
  };
}

function toolVehicleAttempt(
  format: ResponseFormat,
  vehicle: Exclude<StructuredVehicle, "response-format">,
  target: StructuredTarget,
  downgrades: ResolvedWarning[],
): Attempt {
  const planned = planTool(
    { name: format.name, description: format.description ?? STRUCTURED_TOOL_DESCRIPTION, parameters: format.schema },
    target,
    downgrades,
  );
  // The payload's refusals always block, strict or not: the caller reads its reply against this schema.
  const isStrict = planned.tool.strict === true;
  const violations = [...scrubViolations(planned.scrub, planned.mode, true), ...(isStrict ? ceilingViolations(target, [planned.scrub.schema], 1) : [])];
  if (violations.length > 0) {
    return { ok: false, violations };
  }
  return {
    ok: true,
    plan: {
      responseFormat: {
        name: format.name,
        ...(format.description !== undefined ? { description: format.description } : {}),
        schema: planned.scrub.schema,
        strict: isStrict,
        vehicle,
        nullMeansAbsent: planned.scrub.reshapedPaths.length > 0,
        reshapedPaths: planned.scrub.reshapedPaths,
      },
      tools: [planned.tool],
      toolChoice: vehicle === "forced-tool" ? { mode: "tool", name: format.name } : { mode: "auto" },
      parallelToolCalls: false,
    },
  };
}

// The endpoint's target narrowed by what this turn's own settings refuse.
function turnTarget(ask: StructuredAsk, endpoint: StructuredTarget): StructuredTarget {
  const forced = ask.forcedChoice !== false;
  const native = ask.nativeFormat !== false;
  const toolsSupported = endpoint.toolsSupported && (!endpoint.requiresReasoningOff || ask.reasoningOff === true);
  return {
    ...endpoint,
    toolsSupported,
    requiredChoice: endpoint.requiredChoice && forced,
    namedChoice: endpoint.namedChoice && forced,
    vehicles: endpoint.vehicles.filter((vehicle) => (vehicle === "response-format" ? native : toolsSupported && (vehicle !== "forced-tool" || forced))),
  };
}

/** Plan one structured request for `target`: the first vehicle (in the target's order) on which a format (in the
 *  caller's order) fits, or every violation each pair raised. A non-strict tool is not grammar-compiled, so a schema
 *  over the ceilings still rides one where the model takes tools; a model with no fitting vehicle is refused. */
export function planStructured(ask: StructuredAsk, endpoint: StructuredTarget): StructuredPlan | StructuredRefusal {
  const target = turnTarget(ask, endpoint);
  const downgrades: ResolvedWarning[] = [];
  const withdrawn = withdrawnForNone(ask, target, downgrades);
  if (!withdrawn && (ask.tools?.length ?? 0) > 0 && !target.toolsSupported) {
    return {
      ok: false,
      violations: [{ kind: "no-vehicle", mode: target.mode, cause: endpoint.toolsSupported ? "tools-with-reasoning" : "tools-unsupported" }],
    };
  }
  const turn: PlanningTurn = {
    prefillDroppedNative: ask.nativeFormat === false && endpoint.vehicles.includes("response-format"),
    target,
    downgrades,
    callerTools: (withdrawn ? [] : (ask.tools ?? [])).map((tool) => planCallerTool(tool, target, downgrades)),
    toolChoice: ask.toolChoice === undefined || withdrawn ? undefined : servableToolChoice(ask.toolChoice, target, downgrades),
  };
  const formats = ask.formats ?? [];
  return formats.length === 0 ? planToolTurn(turn) : planFormats(formats, turn);
}

interface PlanningTurn {
  /** The endpoint takes the native carrier, but this turn's assistant prefill removed it. */
  readonly prefillDroppedNative: boolean;
  readonly target: StructuredTarget;
  readonly downgrades: ResolvedWarning[];
  readonly callerTools: readonly PlannedToolScrub[];
  readonly toolChoice: ToolChoice | undefined;
}

// A tool turn with no structured payload: the caller's strict tools still count against the ceilings.
function planToolTurn({ target, downgrades, callerTools, toolChoice }: PlanningTurn): StructuredPlan | StructuredRefusal {
  const strict = strictEntries(callerTools);
  const violations = ceilingViolations(
    target,
    strict.map((entry) => entry.scrub.schema),
    strict.length,
  );
  if (violations.length > 0) {
    return { ok: false, violations };
  }
  return {
    ok: true,
    mode: target.mode,
    ...(callerTools.length > 0 ? { tools: callerTools.map((entry) => entry.tool) } : {}),
    ...(toolChoice !== undefined ? { toolChoice } : {}),
    downgrades,
  };
}

function vehicleAttempt(format: ResponseFormat, vehicle: StructuredVehicle, { target, downgrades, callerTools }: PlanningTurn): Attempt {
  return vehicle === "response-format" ? responseFormatAttempt(format, target, callerTools) : toolVehicleAttempt(format, vehicle, target, downgrades);
}

function noVehicleCause({ target, callerTools, prefillDroppedNative }: PlanningTurn): Extract<WireSchemaViolation, { kind: "no-vehicle" }>["cause"] {
  if (target.requiresReasoningOff && !target.toolsSupported) {
    return "tools-with-reasoning";
  }
  if (callerTools.length > 0 && target.vehicles.length > 0) {
    return prefillDroppedNative ? "tools-with-prefill" : "tools-without-native";
  }
  return prefillDroppedNative ? "assistant-prefill" : "unsupported";
}

function planFormats(formats: readonly ResponseFormat[], turn: PlanningTurn): StructuredPlan | StructuredRefusal {
  const { target, downgrades, callerTools, toolChoice } = turn;
  // A request that also carries the caller's tools keeps them, so its payload can only ride the native carrier.
  const vehicles = callerTools.length > 0 ? target.vehicles.filter((vehicle) => vehicle === "response-format") : target.vehicles;
  if (vehicles.length === 0) {
    return { ok: false, violations: [{ kind: "no-vehicle", mode: target.mode, cause: noVehicleCause(turn) }] };
  }
  const violations: WireSchemaViolation[] = [];
  // Vehicles outer: an enforcing carrier with the caller's fallback shape beats a weaker carrier with its first one.
  for (const vehicle of vehicles) {
    for (const [shape, format] of formats.entries()) {
      const attempt = vehicleAttempt(format, vehicle, turn);
      if (attempt.ok) {
        return {
          ok: true,
          mode: target.mode,
          shape,
          ...attempt.plan,
          ...(vehicle === "response-format" && toolChoice !== undefined ? { toolChoice } : {}),
          downgrades,
        };
      }
      violations.push(...attempt.violations.map((violation) => ({ ...violation, shape, vehicle })));
    }
  }
  return { ok: false, violations };
}

/** {@link planStructured} for a resolved connection. The one planning call the rest of the app makes. */
export function planStructuredFor(connection: Resolved, ask: StructuredAsk): StructuredPlan | StructuredRefusal {
  return planStructured(ask, structuredTargetOf(connection));
}

/** Side-generation preview with the same role parameters and reasoning posture as the request. */
export function structuredFitFor(connection: Resolved, format: ResponseFormat, params: RolePresetParams): StructuredFit {
  const reasoningOff =
    connection.capability.kind === "generation" &&
    resolveChat(params, connection.capability.generation, { posture: "side-gen", wire: connection.wire }).reasoning.offChosen === true;
  const plan = planStructuredFor(connection, { formats: [format], reasoningOff });
  if (plan.ok) {
    return { ok: true, native: plan.responseFormat?.vehicle === "response-format" };
  }
  const first = plan.violations[0]?.vehicle;
  return { ok: false, violations: plan.violations.filter((violation) => violation.vehicle === first) };
}

/** The plan a backend sends, or a typed refusal before any byte goes out. */
export function requireStructuredPlan(connection: Resolved, ask: StructuredAsk, label: string): StructuredPlan {
  const plan = planStructuredFor(connection, ask);
  if (plan.ok) {
    return plan;
  }
  throw new ProviderError({
    kind: "invalid",
    retryable: false,
    message: `${label}: the structured request does not fit this model — ${plan.violations.map(describeWireSchemaViolation).join("; ")}`,
    model: connection.model,
    detail: SCHEMA_REJECTED_DETAIL,
    violations: plan.violations,
  });
}

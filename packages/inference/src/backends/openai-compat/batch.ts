// The `summarize` + `structured` tasks on the openai-compat wire — the shared V4 batch runner with THIS wire's
// option slice. Fan-out is `features.concurrency.summarize` (the openrouter row ships 1 — its per-key rate
// limits make a parallel fan-out trip 429s).
//
// THE STRUCTURED VEHICLE (D79, live-probed 2026-08-02 / 2026-08-09, re-corrected 2026-08-14 — the receipts
// are in the tree's `backends/openrouter/index.ts` history): `response-format` = `response_format.json_schema`
// in the ALL-REQUIRED shape + `strict:true` (servable on the anthropic-, openai- and google-family endpoints
// once the schema rides `strict-compatible`); `forced-tool` = the schema as ONE forced tool call + no parallel
// calls (servable everywhere, compiles no grammar; `auto` over the tool on a model whose capability refuses forced
// tool use). The CALLER decided which (`resolveVehicle` at the role
// seam); an `auto` reaching here means nobody could and the forced tool is the servable-everywhere answer. On
// an endpoint row `features.strictJson` says whether `strict` rides at all.

import type { JSONObject, LanguageModelV4CallOptions, LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import type { GenerationCapability } from "@orb/contracts/inference";
import { scrubWireSchema } from "@orb/contracts/inference";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { WireTool } from "../../contract/chat.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { ResolvedReasoning, ResolvedWarning } from "../../contract/resolve.ts";
import type { StructuredRequest, SummarizeRequest } from "../../contract/roles.ts";
import type { InferenceLog } from "../../deps.ts";
import { resolveSideGenReasoning, sideGenOutputCap } from "../../funnel/resolve-chat.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import type { BatchRequest } from "../v4/batch.ts";
import { batchRequestOf, runV4Batch, STRUCTURED_TOOL_DESCRIPTION } from "../v4/batch.ts";
import { functionTools, jsonResponseFormat, servableToolChoice, standardSampling, toolChoiceOf, wireEffortOf } from "../v4/options.ts";
import type { ModelCall, TransportDeps } from "./model.ts";
import { languageModelFor } from "./model.ts";
import { wireSampling } from "./sampling.ts";

const OPENROUTER_KEY = "openrouter";
const REASONING_OFF = "none";
const EFFORT_UNSENT = "effort ignored: this endpoint's row spells no reasoning-effort field";
const BUDGET_UNSENT = "thinkingBudgetTokens ignored: this endpoint's row spells no reasoning-budget field";
// OpenRouter's refusal of an off it cannot pass upstream; the batch then runs once more with no reasoning block.
const MANDATORY_REASONING_RE = /reasoning is mandatory/iu;
const MANDATORY_REPLAY_WARNING = "reasoning is mandatory on this endpoint: the call ran at the model's own effort, with room for it";

export interface BatchDeps {
  readonly now: () => number;
  readonly log: InferenceLog;
  readonly transport: TransportDeps;
  readonly normalize: NormalizeImageBytes;
}

interface StructuredShape {
  readonly options: Partial<LanguageModelV4CallOptions>;
  readonly openRouterChat: ModelCall["openRouterChat"];
}

function vehicleOf(format: ResponseFormat): "response-format" | "forced-tool" {
  return format.vehicle === "response-format" ? "response-format" : "forced-tool";
}

function structuredWireTool(format: ResponseFormat, hosted: boolean): WireTool {
  return {
    name: format.name,
    description: format.description ?? STRUCTURED_TOOL_DESCRIPTION,
    parameters: hosted ? scrubWireSchema(format.schema, "hosted-common").schema : format.schema,
  };
}

/** The structured vehicle's option slice: the JSON response format (strict per the row / the measured cell)
 *  or the forced tool with parallel calls off — sent as `auto` over that one tool where the capability says the
 *  model rejects forced tool use. */
function structuredOptions(req: BatchRequest, format: ResponseFormat, generation: GenerationCapability, warnings: ResolvedWarning[]): StructuredShape {
  const { connection } = req;
  const hosted = connection.provider.dialect === "openrouter";
  if (vehicleOf(format) === "forced-tool" || connection.features.strictJson === "never") {
    const tool = structuredWireTool(format, hosted);
    return {
      options: { tools: functionTools([tool]), toolChoice: toolChoiceOf(servableToolChoice({ mode: "tool", name: tool.name }, generation, warnings)) },
      openRouterChat: hosted ? { parallelToolCalls: false } : undefined,
    };
  }
  // The measured hosted cell: the ALL-REQUIRED shape + strict. An endpoint row spells strict per its feature.
  const schema = hosted ? scrubWireSchema(format.schema, "strict-compatible").schema : format.schema;
  const strict = hosted || connection.features.strictJson === "default-on" ? (format.strict ?? true) : (format.strict ?? false);
  const providerOptions: Record<string, JSONObject> = hosted ? {} : { [connection.providerId]: { strictJsonSchema: strict } };
  return { options: { responseFormat: jsonResponseFormat(format, schema), providerOptions }, openRouterChat: hosted ? { strict } : undefined };
}

interface ReasoningSlice {
  readonly openRouter: JSONObject;
  readonly word: LanguageModelV4CallOptions["reasoning"];
  readonly body: Record<string, number>;
}

const NO_SLICE: ReasoningSlice = { openRouter: {}, word: undefined, body: {} };

/** OpenRouter's `reasoning` block: an off is `effort: "none"`, which OpenRouter forwards as the model's off. */
function openRouterSlice(reasoning: ResolvedReasoning): ReasoningSlice {
  if (!reasoning.enabled) {
    return reasoning.offChosen === true ? { ...NO_SLICE, openRouter: { reasoning: { effort: REASONING_OFF } } } : NO_SLICE;
  }
  if (reasoning.budgetTokens !== undefined) {
    return { ...NO_SLICE, openRouter: { reasoning: { max_tokens: reasoning.budgetTokens } } };
  }
  if (reasoning.effort === undefined) {
    return NO_SLICE;
  }
  // `max` rides verbatim only on the adaptive rows, where OpenRouter was measured forwarding it (the chat wire's rule).
  return { ...NO_SLICE, openRouter: { reasoning: { effort: reasoning.mode === "adaptive" ? reasoning.effort : wireEffortOf(reasoning.effort) } } };
}

/** The V4 `reasoning` word iff the row spells `reasoning_effort` (an off spells `none`), and the budget under the
 *  row's own field. A level or budget the row cannot spell is named, never dropped silently. */
function compatibleSlice(features: BatchRequest["connection"]["features"], reasoning: ResolvedReasoning, warnings: ResolvedWarning[]): ReasoningSlice {
  const spellsEffort = features.effort === "reasoning_effort";
  let word: LanguageModelV4CallOptions["reasoning"];
  if (reasoning.enabled && reasoning.effort !== undefined) {
    word = wireEffortOf(reasoning.effort);
  } else if (reasoning.offChosen === true) {
    word = REASONING_OFF;
  }
  if (word !== undefined && word !== REASONING_OFF && !spellsEffort) {
    warnings.push({ code: "effort_dropped", message: EFFORT_UNSENT });
  }
  const budget = reasoning.enabled ? reasoning.budgetTokens : undefined;
  const field = features.reasoningBudgetField;
  if (budget !== undefined && field === undefined) {
    warnings.push({ code: "sampling_knob_dropped", knob: "thinkingBudgetTokens", message: BUDGET_UNSENT });
  }
  return {
    openRouter: {},
    word: spellsEffort ? word : undefined,
    body: budget !== undefined && field !== undefined ? { [field]: budget } : {},
  };
}

/** The vendor `refusal` field, where the transport surfaces it (OpenRouter under its metadata). */
function refusalOf(result: LanguageModelV4GenerateResult): string {
  const refusal = result.providerMetadata?.[OPENROUTER_KEY]?.["refusal"];
  return typeof refusal === "string" ? refusal : "";
}

function runBatch(req: BatchRequest, deps: BatchDeps): Promise<SummarizeResult> {
  const { connection } = req;
  const label = `${connection.providerId} ${req.task} (${connection.model})`;
  if (connection.capability.kind !== "generation") {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `${label}: the connection's model is a ${connection.capability.kind} model, not a generation model`,
    });
  }
  const { generation } = connection.capability;
  const warnings: ResolvedWarning[] = [];
  const structured: StructuredShape =
    req.responseFormat !== undefined ? structuredOptions(req, req.responseFormat, generation, warnings) : { options: {}, openRouterChat: undefined };
  const sampling = wireSampling(req.sampling, connection.features, connection.provider.dialect ?? "openai-compatible", warnings);
  const sideGen = resolveSideGenReasoning(generation, connection.wire, warnings, req.sampling);
  const send = (reasoning: ResolvedReasoning, maxTokens: number | undefined, sent: ResolvedWarning[]): Promise<SummarizeResult> => {
    const slice = connection.provider.dialect === "openrouter" ? openRouterSlice(reasoning) : compatibleSlice(connection.features, reasoning, sent);
    const call: ModelCall = {
      connection,
      deps: deps.transport,
      label,
      api: req.task,
      plan: null,
      prefillAllowed: false,
      // The template switch follows the resolved side-gen reasoning: off when it does not run, on when it does.
      templateThinking: reasoning.enabled,
      foldSameRole: false,
      replyImages: false,
      warnings: [],
      extraBody: { ...sampling.body, ...slice.body },
      openRouterChat: structured.openRouterChat,
    };
    const providerOptions = Object.keys(slice.openRouter).length > 0 ? { [OPENROUTER_KEY]: slice.openRouter } : {};
    return runV4Batch({
      req,
      model: languageModelFor(call),
      options: {
        ...standardSampling(sampling.v4, maxTokens),
        ...structured.options,
        ...(slice.word !== undefined ? { reasoning: slice.word } : {}),
        providerOptions: { ...structured.options.providerOptions, ...providerOptions },
      },
      label,
      concurrency: connection.features.concurrency?.summarize ?? 1,
      now: deps.now,
      log: deps.log,
      normalize: deps.normalize,
      refusalOf,
      warnings: sent,
    });
  };
  const first = send(sideGen.reasoning, sideGen.maxTokens, warnings);
  if (connection.provider.dialect !== "openrouter" || sideGen.reasoning.offChosen !== true) {
    return first;
  }
  // An endpoint the capability did not mark mandatory refuses the off: run once more with no reasoning block, the
  // model reasoning at its own effort, and the output cap grown to fit it.
  return first.catch((err: unknown) => {
    if (!(err instanceof ProviderError && MANDATORY_REASONING_RE.test(err.message))) {
      throw err;
    }
    const { mode } = sideGen.reasoning;
    const replay: ResolvedWarning[] = [{ code: "reasoning_mandatory_clamp", message: MANDATORY_REPLAY_WARNING }];
    // `enabled: false` without a chosen off spells no reasoning block; the cap still makes room for the default.
    return send({ mode, enabled: false }, sideGenOutputCap(generation, { mode, enabled: true }, req.sampling.maxTokens), replay);
  });
}

export function runOpenAiCompatSummarize(req: SummarizeRequest, deps: BatchDeps): Promise<SummarizeResult> {
  return runBatch(batchRequestOf(req, "summarize"), deps);
}

export function runOpenAiCompatStructured(req: StructuredRequest, deps: BatchDeps): Promise<SummarizeResult> {
  return runBatch(batchRequestOf(req, "structured"), deps);
}

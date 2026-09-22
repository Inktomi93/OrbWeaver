// The `summarize` + `structured` tasks on the anthropic-messages wire — the shared V4 batch runner with THIS
// wire's option slice. The structured vehicle: `response-format` → the SDK's `outputFormat` mode (Anthropic's
// `output_config.format`, the schema in the `anthropic-format` subset — `oneOf` is REFUSED, never sent as a
// cryptic 400, D93); `forced-tool` → the schema as ONE forced tool with parallel use disabled — sent as `auto`
// over that one tool where the capability says the model rejects forced tool use (#2575). The reasoning posture
// is OFF, resolved through the funnel's mandatory clamp (`resolveSideGenReasoning`), never a bare `disabled`.

import type { JSONObject, LanguageModelV4CallOptions } from "@ai-sdk/provider";
import type { GenerationCapability } from "@orb/contracts/inference";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import { scrubWireSchema } from "@orb/kit/json-schema";
import { ProviderError } from "../../contract/errors.ts";
import type { ResolvedWarning } from "../../contract/resolve.ts";
import type { StructuredRequest, SummarizeRequest } from "../../contract/roles.ts";
import type { InferenceLog } from "../../deps.ts";
import { resolveSideGenReasoning } from "../../funnel/resolve-chat.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import type { BatchRequest } from "../v4/batch.ts";
import { batchRequestOf, runV4Batch, STRUCTURED_TOOL_DESCRIPTION } from "../v4/batch.ts";
import { functionTools, jsonResponseFormat, servableToolChoice, standardSampling, toolChoiceOf } from "../v4/options.ts";
import { sdkEffortOf, thinkingOf } from "./chat.ts";
import type { AnthropicTransportDeps } from "./model.ts";
import { ANTHROPIC_KEY, anthropicModelFor } from "./model.ts";

const DEFAULT_CONCURRENCY = 4;

export interface AnthropicBatchDeps {
  readonly now: () => number;
  readonly log: InferenceLog;
  readonly transport: AnthropicTransportDeps;
  readonly normalize: NormalizeImageBytes;
}

/** The `anthropic-format` subset, refusing what the wire cannot carry (D93: `oneOf` → flatten upstream). */
function anthropicSchemaOf(schema: Record<string, unknown>, label: string): Record<string, unknown> {
  const { schema: clean, refused } = scrubWireSchema(schema, "anthropic-format");
  if (refused.length > 0) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `${label}: structured-output schema is not Anthropic-clean — '${refused.join("', '")}' is rejected by the wire. Flatten the discriminated union to an enum-tagged object (D93).`,
    });
  }
  return clean;
}

interface StructuredShape {
  readonly options: Partial<LanguageModelV4CallOptions>;
  readonly anthropic: JSONObject;
}

/** The forced tool rides with parallel use OFF, so it is at most one call even where the capability downgrades
 *  the forcing to `auto` (#2575 — the tool's own description already asks for exactly one call). */
function structuredOptions(format: ResponseFormat, label: string, generation: GenerationCapability, warnings: ResolvedWarning[]): StructuredShape {
  if (format.vehicle === "response-format") {
    return {
      options: { responseFormat: jsonResponseFormat(format, anthropicSchemaOf(format.schema, label)) },
      anthropic: { structuredOutputMode: "outputFormat" },
    };
  }
  const tool = { name: format.name, description: format.description ?? STRUCTURED_TOOL_DESCRIPTION, parameters: anthropicSchemaOf(format.schema, label) };
  return {
    options: { tools: functionTools([tool]), toolChoice: toolChoiceOf(servableToolChoice({ mode: "tool", name: tool.name }, generation, warnings)) },
    anthropic: { disableParallelToolUse: true },
  };
}

/** The side-generation `thinking` + `effort` slice: reasoning OFF, through the funnel's mandatory clamp — a model
 *  that cannot disable thinking runs adaptive at its lowest effort instead of 400-ing on `disabled` (#2575). */
function reasoningOptions(generation: GenerationCapability, warnings: ResolvedWarning[]): JSONObject {
  const reasoning = resolveSideGenReasoning(generation, warnings);
  const effort = reasoning.enabled ? sdkEffortOf(reasoning.effort, warnings, "side-generation") : undefined;
  return { thinking: thinkingOf(reasoning), ...(effort !== undefined ? { effort } : {}) };
}

function runBatch(req: BatchRequest, deps: AnthropicBatchDeps): Promise<SummarizeResult> {
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
  const reasoning = reasoningOptions(generation, warnings);
  const structured: StructuredShape =
    req.responseFormat !== undefined ? structuredOptions(req.responseFormat, label, generation, warnings) : { options: {}, anthropic: {} };
  return runV4Batch({
    req,
    model: anthropicModelFor({ connection, deps: deps.transport, label, api: req.task }),
    options: {
      ...standardSampling(req.sampling, req.sampling.maxTokens),
      ...structured.options,
      providerOptions: { [ANTHROPIC_KEY]: { ...reasoning, ...structured.anthropic } },
    },
    warnings,
    label,
    concurrency: connection.features.concurrency?.summarize ?? DEFAULT_CONCURRENCY,
    now: deps.now,
    log: deps.log,
    normalize: deps.normalize,
    refusalOf: () => "",
  });
}

export function runAnthropicSummarize(req: SummarizeRequest, deps: AnthropicBatchDeps): Promise<SummarizeResult> {
  return runBatch(batchRequestOf(req, "summarize"), deps);
}

export function runAnthropicStructured(req: StructuredRequest, deps: AnthropicBatchDeps): Promise<SummarizeResult> {
  return runBatch(batchRequestOf(req, "structured"), deps);
}

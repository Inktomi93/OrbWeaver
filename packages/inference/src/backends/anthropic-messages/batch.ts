// The `summarize` + `structured` tasks on the anthropic-messages wire — the shared V4 batch runner with THIS
// wire's option slice. The structured vehicle: `response-format` → the SDK's `outputFormat` mode (Anthropic's
// `output_config.format`, the schema in the `anthropic-format` subset — `oneOf` is REFUSED, never sent as a
// cryptic 400, D93); `forced-tool` → the schema as ONE forced tool with parallel use disabled.

import type { JSONObject, LanguageModelV4CallOptions } from "@ai-sdk/provider";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import { scrubWireSchema } from "@orb/kit/json-schema";
import { ProviderError } from "../../contract/errors.ts";
import type { StructuredRequest, SummarizeRequest } from "../../contract/roles.ts";
import type { InferenceLog } from "../../deps.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import type { BatchRequest } from "../v4/batch.ts";
import { batchRequestOf, runV4Batch, STRUCTURED_TOOL_DESCRIPTION } from "../v4/batch.ts";
import { functionTools, jsonResponseFormat, standardSampling, toolChoiceOf } from "../v4/options.ts";
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

function structuredOptions(format: ResponseFormat, label: string): { readonly options: Partial<LanguageModelV4CallOptions>; readonly anthropic: JSONObject } {
  if (format.vehicle === "response-format") {
    return {
      options: { responseFormat: jsonResponseFormat(format, anthropicSchemaOf(format.schema, label)) },
      anthropic: { structuredOutputMode: "outputFormat" },
    };
  }
  const tool = { name: format.name, description: format.description ?? STRUCTURED_TOOL_DESCRIPTION, parameters: anthropicSchemaOf(format.schema, label) };
  return {
    options: { tools: functionTools([tool]), toolChoice: toolChoiceOf({ mode: "tool", name: tool.name }) },
    anthropic: { disableParallelToolUse: true },
  };
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
  const structured = req.responseFormat !== undefined ? structuredOptions(req.responseFormat, label) : { options: {}, anthropic: {} };
  return runV4Batch({
    req,
    model: anthropicModelFor({ connection, deps: deps.transport, label, api: req.task }),
    options: {
      ...standardSampling(req.sampling, req.sampling.maxTokens),
      ...structured.options,
      providerOptions: { [ANTHROPIC_KEY]: { thinking: { type: "disabled" }, ...structured.anthropic } },
    },
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

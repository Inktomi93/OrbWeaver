// The `summarize` + `structured` tasks on the openai-compat wire — the shared V4 batch runner with THIS wire's
// option slice. Fan-out is `features.concurrency.summarize` (the openrouter row ships 1 — its per-key rate
// limits make a parallel fan-out trip 429s).
//
// THE STRUCTURED VEHICLE (D79, live-probed 2026-08-02 / 2026-08-09, re-corrected 2026-08-14 — the receipts
// are in the tree's `backends/openrouter/index.ts` history): `response-format` = `response_format.json_schema`
// in the ALL-REQUIRED shape + `strict:true` (servable on the anthropic-, openai- and google-family endpoints
// once the schema rides `strict-compatible`); `forced-tool` = the schema as ONE forced tool call + no parallel
// calls (servable everywhere, compiles no grammar). The CALLER decided which (`resolveVehicle` at the role
// seam); an `auto` reaching here means nobody could and the forced tool is the servable-everywhere answer. On
// an endpoint row `features.strictJson` says whether `strict` rides at all.

import type { JSONObject, LanguageModelV4CallOptions, LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import { scrubWireSchema } from "@orb/kit/json-schema";
import type { WireTool } from "../../contract/chat.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { StructuredRequest, SummarizeRequest } from "../../contract/roles.ts";
import type { InferenceLog } from "../../deps.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import type { BatchRequest } from "../v4/batch.ts";
import { batchRequestOf, runV4Batch, STRUCTURED_TOOL_DESCRIPTION } from "../v4/batch.ts";
import { functionTools, jsonResponseFormat, samplingExtras, standardSampling, toolChoiceOf } from "../v4/options.ts";
import type { ModelCall, TransportDeps } from "./model.ts";
import { languageModelFor } from "./model.ts";

const OPENROUTER_KEY = "openrouter";

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
 *  or the forced tool with parallel calls off. */
function structuredOptions(req: BatchRequest, format: ResponseFormat): StructuredShape {
  const { connection } = req;
  const hosted = connection.provider.dialect === "openrouter";
  if (vehicleOf(format) === "forced-tool" || connection.features.strictJson === "never") {
    const tool = structuredWireTool(format, hosted);
    return {
      options: { tools: functionTools([tool]), toolChoice: toolChoiceOf({ mode: "tool", name: tool.name }) },
      openRouterChat: hosted ? { parallelToolCalls: false } : undefined,
    };
  }
  // The measured hosted cell: the ALL-REQUIRED shape + strict. An endpoint row spells strict per its feature.
  const schema = hosted ? scrubWireSchema(format.schema, "strict-compatible").schema : format.schema;
  const strict = hosted || connection.features.strictJson === "default-on" ? (format.strict ?? true) : (format.strict ?? false);
  const providerOptions: Record<string, JSONObject> = hosted ? {} : { [connection.providerId]: { strictJsonSchema: strict } };
  return { options: { responseFormat: jsonResponseFormat(format, schema), providerOptions }, openRouterChat: hosted ? { strict } : undefined };
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
  const structured: StructuredShape =
    req.responseFormat !== undefined ? structuredOptions(req, req.responseFormat) : { options: {}, openRouterChat: undefined };
  const call: ModelCall = {
    connection,
    deps: deps.transport,
    label,
    api: req.task,
    plan: null,
    prefillAllowed: false,
    replyImages: false,
    warnings: [],
    extraBody: samplingExtras(req.sampling),
    openRouterChat: structured.openRouterChat,
  };
  return runV4Batch({
    req,
    model: languageModelFor(call),
    options: { ...standardSampling(req.sampling, req.sampling.maxTokens), ...structured.options },
    label,
    concurrency: connection.features.concurrency?.summarize ?? 1,
    now: deps.now,
    log: deps.log,
    normalize: deps.normalize,
    refusalOf,
  });
}

export function runOpenAiCompatSummarize(req: SummarizeRequest, deps: BatchDeps): Promise<SummarizeResult> {
  return runBatch(batchRequestOf(req, "summarize"), deps);
}

export function runOpenAiCompatStructured(req: StructuredRequest, deps: BatchDeps): Promise<SummarizeResult> {
  return runBatch(batchRequestOf(req, "structured"), deps);
}

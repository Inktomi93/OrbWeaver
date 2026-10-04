// The `summarize` + `structured` tasks on the anthropic-messages wire — the shared V4 batch runner with THIS
// wire's option slice. The structured payload rides the plan (`structured/plan.ts`): `outputFormat` for a native
// format, one call with parallel use off for a tool vehicle. The reasoning posture is OFF, resolved through the
// funnel's mandatory clamp (`resolveSideGenReasoning`), never a bare `disabled`.

import type { JSONObject, LanguageModelV4CallOptions } from "@ai-sdk/provider";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import { ProviderError } from "../../contract/errors.ts";
import type { ResolvedReasoning, ResolvedWarning } from "../../contract/resolve.ts";
import type { StructuredRequest, SummarizeRequest } from "../../contract/roles.ts";
import type { InferenceLog } from "../../deps.ts";
import { resolveSideGenReasoning } from "../../funnel/resolve-chat.ts";
import type { StructuredPlan } from "../../structured/plan.ts";
import { requireStructuredPlan } from "../../structured/plan.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import type { BatchRequest } from "../v4/batch.ts";
import { batchRequestOf, runV4Batch } from "../v4/batch.ts";
import { plannedOptions, standardSampling } from "../v4/options.ts";
import { anthropicStructuredOptions, forcedChoiceOf, nativeSchemaOf, sdkEffortOf, thinkingOf } from "./chat.ts";
import type { AnthropicTransportDeps } from "./model.ts";
import { ANTHROPIC_KEY, anthropicModelFor } from "./model.ts";

const DEFAULT_CONCURRENCY = 4;

export interface AnthropicBatchDeps {
  readonly now: () => number;
  readonly log: InferenceLog;
  readonly transport: AnthropicTransportDeps;
  readonly normalize: NormalizeImageBytes;
}

interface StructuredShape {
  readonly plan: StructuredPlan | undefined;
  readonly options: Partial<LanguageModelV4CallOptions>;
  readonly anthropic: JSONObject;
}

/** The plan's spelling on this wire: the planned options plus the SDK's carrier switch. */
function structuredOptions(
  req: BatchRequest,
  format: ResponseFormat,
  turn: { readonly label: string; readonly reasoning: ResolvedReasoning; readonly warnings: ResolvedWarning[] },
): StructuredShape {
  const { label, reasoning, warnings } = turn;
  const plan = requireStructuredPlan(req.connection, { formats: [format], forcedChoice: forcedChoiceOf(reasoning) }, label);
  warnings.push(...plan.downgrades);
  return { plan, options: plannedOptions(plan), anthropic: anthropicStructuredOptions(plan) };
}

/** The side-generation `thinking` + `effort` slice of the funnel's resolved reasoning: the role preset's, else OFF,
 *  through the mandatory clamp — a model that cannot disable thinking runs adaptive at its lowest effort instead
 *  of 400-ing on `disabled` (#2575). */
function reasoningOptions(reasoning: ResolvedReasoning, warnings: ResolvedWarning[]): JSONObject {
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
  const sideGen = resolveSideGenReasoning(generation, connection.wire, warnings, req.sampling);
  const reasoning = reasoningOptions(sideGen.reasoning, warnings);
  const structured: StructuredShape =
    req.responseFormat !== undefined
      ? structuredOptions(req, req.responseFormat, { label, reasoning: sideGen.reasoning, warnings })
      : { plan: undefined, options: {}, anthropic: {} };
  return runV4Batch({
    req,
    model: anthropicModelFor({ connection, deps: deps.transport, label, api: req.task, plannedSchema: nativeSchemaOf(structured.plan) }),
    options: {
      ...standardSampling(req.sampling, sideGen.maxTokens),
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
    plan: structured.plan,
  });
}

export function runAnthropicSummarize(req: SummarizeRequest, deps: AnthropicBatchDeps): Promise<SummarizeResult> {
  return runBatch(batchRequestOf(req, "summarize"), deps);
}

export function runAnthropicStructured(req: StructuredRequest, deps: AnthropicBatchDeps): Promise<SummarizeResult> {
  return runBatch(batchRequestOf(req, "structured"), deps);
}

import type { SummarizeResult } from "@orb/contracts/providers";
import type { GoogleBackendDeps } from "../../contract/google.ts";
import type { ResolvedWarning } from "../../contract/resolve.ts";
import type { StructuredRequest, SummarizeRequest } from "../../contract/roles.ts";
import { resolveSideGenReasoning } from "../../funnel/resolve-chat.ts";
import { requireStructuredPlan } from "../../structured/plan.ts";
import { createImageNormalizer, passthroughImageNormalizer } from "../kit/image-normalize.ts";
import { batchRequestOf, runV4Batch } from "../v4/batch.ts";
import { plannedOptions, standardSampling } from "../v4/options.ts";
import { requireGoogleGeneration } from "./chat.ts";
import { GOOGLE_KEY, googleModelId, googleProviderFor } from "./model.ts";
import { googleExtras, googleThinking } from "./options.ts";

export function runGoogleBatch(req: SummarizeRequest | StructuredRequest, deps: GoogleBackendDeps): Promise<SummarizeResult> {
  const task = "responseFormat" in req ? "structured" : "summarize";
  const connection = req.connection;
  const generation = requireGoogleGeneration(connection);
  const label = `${connection.providerId} ${task} (${connection.model})`;
  const warnings: ResolvedWarning[] = [];
  const batch = batchRequestOf(req, task);
  const sideGen = resolveSideGenReasoning(generation, connection.wire, warnings, batch.sampling);
  const plan = "responseFormat" in req ? requireStructuredPlan(connection, { formats: [req.responseFormat] }, label) : undefined;
  warnings.push(...(plan?.downgrades ?? []));
  return runV4Batch({
    req: batch,
    model: googleProviderFor({ connection, deps, label, api: task }).chat(googleModelId(connection.model)),
    options: {
      ...standardSampling(batch.sampling, sideGen.maxTokens),
      ...(plan === undefined ? {} : plannedOptions(plan)),
      providerOptions: { [GOOGLE_KEY]: { ...googleExtras(connection, warnings), ...googleThinking(sideGen.reasoning) } },
    },
    plan,
    warnings,
    label,
    concurrency: connection.features.concurrency?.summarize ?? 1,
    now: deps.now,
    log: deps.log,
    normalize: deps.imageToPng === undefined ? passthroughImageNormalizer : createImageNormalizer(deps.imageToPng),
    refusalOf: (result) => (result.finishReason.unified === "content-filter" ? (result.finishReason.raw ?? "Google content filter") : ""),
  });
}

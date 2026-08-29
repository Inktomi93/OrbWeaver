import type { EngineAdoptionEvidence, EngineRole } from "../contract/types.ts";

const IDENTITY_PROBE_TIMEOUT_MS = 2000;

const CAPABILITY_PATH: Record<EngineRole, string> = {
  embed: "/v1/embeddings",
  rerank: "/v1/rerank",
  gen: "/v1/chat/completions",
};

/** A healthy listener is adoptable only when it advertises this role's model and API capability. */
export function engineAdoptionMismatch(role: EngineRole, expectedModels: readonly string[], evidence: EngineAdoptionEvidence): string | null {
  if (!expectedModels.some((expected) => evidence.modelIds.includes(expected))) {
    return `model mismatch (expected one of ${expectedModels.join(", ")}; advertised ${evidence.modelIds.join(", ") || "none"})`;
  }
  const capability = CAPABILITY_PATH[role];
  if (!evidence.paths.includes(capability)) {
    return `capability mismatch (${capability} is not advertised)`;
  }
  return null;
}

/** The IDENTITY half of adopt-in-place: an answering `/health` only proves SOMETHING serves that port, so
 *  the two identity endpoints (`/v1/models` + `/openapi.json`) are read and judged by
 *  `engineAdoptionMismatch` before the launcher will adopt. Returns `null` for an adoptable listener, or
 *  the refusal reason. `request` is injected so the probe is testable without a listener. */
export async function probeEngineAdoption(
  engine: EngineRole,
  port: number,
  expectedModels: readonly string[],
  request: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const [modelsResponse, openapiResponse] = await Promise.all([
      request(`http://127.0.0.1:${port}/v1/models`, { signal: AbortSignal.timeout(IDENTITY_PROBE_TIMEOUT_MS) }),
      request(`http://127.0.0.1:${port}/openapi.json`, { signal: AbortSignal.timeout(IDENTITY_PROBE_TIMEOUT_MS) }),
    ]);
    if (!(modelsResponse.ok && openapiResponse.ok)) {
      return `identity endpoints failed (/v1/models=${modelsResponse.status}, /openapi.json=${openapiResponse.status})`;
    }
    const models = (await modelsResponse.json()) as { data?: readonly { id?: string }[] };
    const openapi = (await openapiResponse.json()) as { paths?: Record<string, unknown> };
    return engineAdoptionMismatch(engine, expectedModels, {
      modelIds: (models.data ?? []).flatMap((model) => (typeof model.id === "string" ? [model.id] : [])),
      paths: Object.keys(openapi.paths ?? {}),
    });
  } catch (error) {
    return `identity probe failed (${error instanceof Error ? error.message : String(error)})`;
  }
}

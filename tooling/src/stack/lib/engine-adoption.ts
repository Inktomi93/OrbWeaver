export type EngineRole = "embed" | "rerank" | "gen";

export interface EngineAdoptionEvidence {
  readonly modelIds: readonly string[];
  readonly paths: readonly string[];
}

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

// infra/providers/backends/kit/openai-compat/body — the OpenAI-compatible REQUEST-body helpers shared by
// every raw-fetch runner (custom-byo, vllm) that POSTs JSON itself. The OpenRouter SDK accepts camelCase;
// a raw POST to an arbitrary OpenAI-compatible server (vLLM / LM Studio / Ollama / a BYO endpoint) needs
// the snake_case wire names. Pure data shaping — no transport, no contract types.
//
// DECOUPLED FROM resolve-chat: neo's `buildOpenAiSamplingFields` read a `ResolvedChat`. A pure wire helper
// must not depend on that infra-internal funnel type (which doesn't exist yet), so this takes a minimal
// {@link OpenAiSamplingInput} the runner projects its resolved knobs into.

/** The provider-agnostic sampler knobs a runner hands in (camelCase) — each emitted to the wire only when
 *  set. Mirrors the relevant `UserIntent` knobs without coupling to that contract. */
export interface OpenAiSamplingInput {
  readonly temperature?: number | undefined;
  readonly topP?: number | undefined;
  readonly topK?: number | undefined;
  readonly frequencyPenalty?: number | undefined;
  readonly presencePenalty?: number | undefined;
  readonly repetitionPenalty?: number | undefined;
  readonly seed?: number | undefined;
  readonly logitBias?: Readonly<Record<string, number>> | undefined;
  readonly stop?: readonly string[] | undefined;
  readonly maxTokens?: number | undefined;
}

// Header-name patterns that mark a secret (hoisted per useTopLevelRegex — runs per redaction).
const SECRET_HEADER_RE = /authorization|api[-_]?key|token|secret/i;
const REDACTED = "«redacted»";

/**
 * Build the OpenAI sampler slice in WIRE (snake_case) form. Each field is emitted ONLY when set on the
 * input (an unset knob is absent, never `null`/`0`). `max_tokens` (not `max_completion_tokens`) for the
 * broadest server compatibility; a user can override the name via their endpoint's body transforms.
 */
export function buildOpenAiSamplingFields(input: OpenAiSamplingInput): Record<string, unknown> {
  // biome-ignore-start lint/style/useNamingConvention: OpenAI-compatible wire field names (snake_case).
  return {
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.topP !== undefined ? { top_p: input.topP } : {}),
    ...(input.topK !== undefined ? { top_k: input.topK } : {}),
    ...(input.frequencyPenalty !== undefined ? { frequency_penalty: input.frequencyPenalty } : {}),
    ...(input.presencePenalty !== undefined ? { presence_penalty: input.presencePenalty } : {}),
    ...(input.repetitionPenalty !== undefined
      ? { repetition_penalty: input.repetitionPenalty }
      : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
    ...(input.logitBias !== undefined ? { logit_bias: input.logitBias } : {}),
    ...(input.stop !== undefined ? { stop: input.stop } : {}),
    ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
  };
  // biome-ignore-end lint/style/useNamingConvention: OpenAI-compatible wire field names (snake_case).
}

/** Mask secrets in a header map before it is surfaced (observability span / inspector preview).
 *  `Authorization` + any header whose NAME hints at a key/token/secret is replaced; values are never
 *  inspected (the name is the signal). */
export function redactHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SECRET_HEADER_RE.test(key) ? REDACTED : value;
  }
  return out;
}

/**
 * Apply a user's per-endpoint body transforms: merge `includeBody` over the base (user wins), then strip
 * `excludeBody` keys (applied LAST so a user can remove a field the endpoint rejects even if `includeBody`
 * re-added it). Shallow by design (matches ST's flat merge). Rebuilds the object rather than `delete`-ing
 * (delete is banned + deopts the shape).
 */
export function applyIncludeExclude(
  base: Readonly<Record<string, unknown>>,
  includeBody: Readonly<Record<string, unknown>> | null,
  excludeBody: readonly string[] | null,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base, ...(includeBody ?? {}) };
  if (excludeBody === null || excludeBody.length === 0) {
    return merged;
  }
  const exclude = new Set(excludeBody);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (!exclude.has(key)) {
      out[key] = value;
    }
  }
  return out;
}

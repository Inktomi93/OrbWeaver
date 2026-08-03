// infra/providers/backends/kit/openai-compat/body — the OpenAI-compatible REQUEST-body helpers shared by
// every raw-fetch runner (custom-byo, vllm) that POSTs JSON itself. The OpenRouter SDK accepts camelCase;
// a raw POST to an arbitrary OpenAI-compatible server (vLLM / LM Studio / Ollama / a BYO endpoint) needs
// the snake_case wire names. Pure data shaping — no transport. (The D48 raw builders below consume the
// infra wire-contract vocab — the same DOWN import `history.ts` takes for `HistoryRole`.)
//
// DECOUPLED FROM resolve-chat: neo's `buildOpenAiSamplingFields` read a `ResolvedChat`. A pure wire helper
// must not depend on that infra-internal funnel type (which doesn't exist yet), so this takes a minimal
// {@link OpenAiSamplingInput} the runner projects its resolved knobs into.

import type { ResponseFormat, ToolChoice, WireTool } from "../../../contract/chat";
import type { ChatToolCallDelta } from "../wire-schemas";

/** The provider-agnostic sampler knobs a runner hands in (camelCase) — each emitted to the wire only when
 *  set. Mirrors the relevant `UserIntent` knobs without coupling to that contract. */
export interface OpenAiSamplingInput {
  readonly temperature?: number | undefined;
  readonly topP?: number | undefined;
  readonly topK?: number | undefined;
  readonly frequencyPenalty?: number | undefined;
  readonly presencePenalty?: number | undefined;
  readonly repetitionPenalty?: number | undefined;
  readonly minP?: number | undefined;
  readonly topA?: number | undefined;
  readonly seed?: number | undefined;
  readonly logitBias?: Readonly<Record<string, number>> | undefined;
  readonly stop?: readonly string[] | undefined;
  readonly maxTokens?: number | undefined;
}

// Header-name patterns that mark a secret (hoisted per useTopLevelRegex — runs per redaction).
const SECRET_HEADER_RE = /authorization|api[-_]?key|token|secret/i;
const REDACTED = "«redacted»";

// Shape-based fallbacks for the inspector body-preview scrub (hoisted; run per inspection). These are
// DEFENSE-IN-DEPTH only — the primary guarantee is scrubbing the KNOWN secret literals by value. They
// catch the case where an echoing endpoint re-encodes/reshapes the token around a recognizable frame we
// still hold no exact literal for. The token class is CREDENTIAL chars only (`\w.\-+/=`) — it deliberately
// STOPS at a quote / JSON delimiter / whitespace so a reflected token inside a JSON body doesn't swallow
// the surrounding structure (and won't re-consume the `«redacted»` sentinel a prior literal-scrub left).
// Single bounded class, no nesting → ReDoS-safe.
const BEARER_TOKEN_RE = /Bearer\s+[\w.\-+/=]+/gi;
const SK_KEY_RE = /sk-[A-Za-z0-9_-]{16,}/g;
// A secret literal shorter than this is too collision-prone to blind-replace across arbitrary text (it
// would redact legitimate content). Real provider keys are far longer; a 1–7 char "key" isn't one.
const MIN_SCRUBBABLE_SECRET_LEN = 8;

// Escape a literal for use inside a RegExp (the secrets are user-supplied endpoint credentials).
const REGEXP_META_RE = /[.*+?^${}()|[\]\\]/g;
function escapeRegExp(literal: string): string {
  return literal.replace(REGEXP_META_RE, "\\$&");
}

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
    ...(input.repetitionPenalty !== undefined ? { repetition_penalty: input.repetitionPenalty } : {}),
    ...(input.minP !== undefined ? { min_p: input.minP } : {}),
    ...(input.topA !== undefined ? { top_a: input.topA } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
    ...(input.logitBias !== undefined ? { logit_bias: input.logitBias } : {}),
    ...(input.stop !== undefined ? { stop: input.stop } : {}),
    ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
  };
  // biome-ignore-end lint/style/useNamingConvention: OpenAI-compatible wire field names (snake_case).
}

// ── The D48 raw-wire builders (tool-use-design/02 §4 / 04 §3 — custom-byo + vLLM share these) ──────
// Absence discipline is the CALLER's: a runner spreads these in only when the request field is set, so a
// tool-less/format-less body stays byte-identical to pre-D48.

/** WireTool[] → raw `tools` (`{type:"function", function:{…}}` — snake wire, identical key names). */
export function rawWireTools(tools: readonly WireTool[]): Record<string, unknown>[] {
  return tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

/** The contract `ToolChoice` → raw `tool_choice` (string modes; the named form is the function object). */
export function rawToolChoice(choice: ToolChoice): unknown {
  if (choice.mode === "tool") {
    return { type: "function", function: { name: choice.name } };
  }
  return choice.mode;
}

/**
 * The contract `ResponseFormat` → raw `response_format` (`json_schema` dialect — the neo vLLM runner's exact
 * shape; the projection rule upstream already produced a clean schema).
 *
 * STRICTFMT — `strict` rides ONLY when the CALLER set it. A translator never defaults a caller's optional wire
 * knob, and this one is a 400 landmine: the live probe matrix pinned in `backends/openrouter/index.ts`
 * (2026-08-02) measured OpenAI-family endpoints 400ing on `strict:true` ("'required' is required to be
 * supplied") and serving 200 non-strict, on this exact field. Unclearable by "just emit `required`": our
 * schemas are projected by the ONE rule (`@orb/kit/json-schema`) from zod payloads that are
 * OPTIONAL-BY-CONSTRUCTION (omit = keep), and OpenAI strict demands every property be required. `custom-byo`
 * points at an ARBITRARY OpenAI-compatible server (an OpenAI-family proxy included), so it must not carry an
 * invented `strict`. vLLM — where guided decoding is the ENFORCING wire and strict is the point (the xgrammar
 * populate lever) — PINS `strict: true` explicitly at its own call site (`vllm/surfaces/chat.ts`).
 */
export function rawResponseFormat(format: ResponseFormat): Record<string, unknown> {
  return {
    type: "json_schema",
    json_schema: {
      name: format.name,
      schema: format.schema,
      ...(format.strict !== undefined ? { strict: format.strict } : {}),
      ...(format.description !== undefined ? { description: format.description } : {}),
    },
  };
}

// File-local: narrow an unknown to an indexable object.
function isIndexable(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/**
 * Read raw `tool_calls` entries (a stream delta's FRAGMENTS or a one-shot message's COMPLETE calls) into
 * the kit's {@link ChatToolCallDelta} fragment shape the reducer accumulates. Lenient by design (the raw
 * wire is untyped): a fragment missing `index` falls back to its array position (the one-shot form has no
 * `index` — position IS the order). `undefined` when the value isn't a non-empty array.
 */
export function rawToolCallDeltas(value: unknown): ChatToolCallDelta[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }
  const out: ChatToolCallDelta[] = [];
  for (const [position, entry] of value.entries()) {
    if (isIndexable(entry)) {
      out.push(rawFragment(entry, position));
    }
  }
  return out.length > 0 ? out : undefined;
}

// One raw entry → one fragment (split out to stay under the cognitive-complexity gate; bracket access —
// the raw wire is an index-signature object).
function rawFragment(entry: Record<string, unknown>, position: number): ChatToolCallDelta {
  const fn = isIndexable(entry["function"]) ? entry["function"] : undefined;
  const index = entry["index"];
  const id = entry["id"];
  const name = fn?.["name"];
  const args = fn?.["arguments"];
  return {
    index: typeof index === "number" ? index : position,
    ...(typeof id === "string" ? { id } : {}),
    ...(fn !== undefined
      ? {
          function: {
            ...(typeof name === "string" ? { name } : {}),
            ...(typeof args === "string" ? { arguments: args } : {}),
          },
        }
      : {}),
  };
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

/** The secret-valued entries of a header map: the VALUE of every header whose NAME hints at a key/token/
 *  secret (the same signal {@link redactHeaders} masks by). These are the exact literals a raw-body scrub
 *  must strip if an endpoint echoes them back. */
export function secretHeaderValues(headers: Readonly<Record<string, string>> | null): string[] {
  if (headers === null) {
    return [];
  }
  const out: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (SECRET_HEADER_RE.test(key) && value.length > 0) {
      out.push(value);
    }
  }
  return out;
}

/**
 * Scrub secret material out of an UNTRUSTED response body before it becomes display-eligible (the BYO
 * "Test endpoint" inspector's `bodyPreview`). An endpoint that echoes the request — httpbin, a debug proxy,
 * a misconfigured BYO server — reflects the plaintext `Authorization: Bearer <apiKey>` (and any custom auth
 * header value) straight back into the body, so the raw body is a secret sink.
 *
 * PRIMARY guarantee: every known secret LITERAL in `secrets` is replaced by value — an endpoint cannot leak
 * a secret we scrubbed by its exact value, regardless of surrounding framing. DEFENSE-IN-DEPTH: `Bearer …`
 * and `sk-…`-shaped substrings are also masked in case the token is re-encoded/reshaped on the way back.
 * Literals shorter than {@link MIN_SCRUBBABLE_SECRET_LEN} are skipped (too collision-prone to blind-replace
 * — they'd redact legitimate content, and a string that short is not a real credential).
 */
export function redactSecretsFromText(text: string, secrets: readonly string[]): string {
  let scrubbed = text;
  // Longest-first so a secret that is a substring of another is handled by the longer replacement first.
  const literals = [...new Set(secrets)].filter((s) => s.length >= MIN_SCRUBBABLE_SECRET_LEN).sort((a, b) => b.length - a.length);
  for (const secret of literals) {
    scrubbed = scrubbed.replace(new RegExp(escapeRegExp(secret), "g"), REDACTED);
  }
  scrubbed = scrubbed.replace(BEARER_TOKEN_RE, `Bearer ${REDACTED}`);
  scrubbed = scrubbed.replace(SK_KEY_RE, REDACTED);
  return scrubbed;
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

// A raw OpenRouter `GET /models` fixture in the catalog's OWN snake_case shape, so a test drives the real
// parser (`catalog/openrouter.ts`) → mirror → capability fold instead of hand-building parsed entries. Each row
// copies the fields the live catalog carries for that id: a `:batch` variant shares its base id's
// `canonical_slug`, and a floating `~…-latest` alias names its current target in `alias_target.slug`.

const CLAUDE_PARAMETERS = ["include_reasoning", "max_tokens", "reasoning", "response_format", "stop", "structured_outputs", "tool_choice", "tools"];
const MANDATORY_REASONING = { mandatory: true, supported_efforts: ["max", "xhigh", "high", "medium", "low"], default_effort: "high" };

function claudeRow(id: string, canonicalSlug: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    canonical_slug: canonicalSlug,
    name: id,
    context_length: 1_000_000,
    architecture: { input_modalities: ["text", "image", "file"], output_modalities: ["text"] },
    pricing: { prompt: "0.00001", completion: "0.00005" },
    supported_parameters: CLAUDE_PARAMETERS,
    top_provider: { max_completion_tokens: 128_000, is_moderated: false },
    ...extra,
  };
}

function openAiRow(id: string, canonicalSlug: string): Record<string, unknown> {
  return {
    id,
    canonical_slug: canonicalSlug,
    name: id,
    context_length: 200_000,
    architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    pricing: { prompt: "0.0000011", completion: "0.0000044" },
    supported_parameters: ["max_tokens", "tool_choice", "tools"],
    top_provider: { max_completion_tokens: 100_000 },
  };
}

export const OPENROUTER_CHAT_ROWS: readonly Record<string, unknown>[] = [
  claudeRow("anthropic/claude-fable-5.1", "anthropic/claude-fable-5.1-20260831", { reasoning: MANDATORY_REASONING }),
  claudeRow("anthropic/claude-fable-5.1:batch", "anthropic/claude-fable-5.1-20260831", { reasoning: MANDATORY_REASONING }),
  claudeRow("anthropic/claude-opus-5.5", "anthropic/claude-opus-5.5-20260921", { reasoning: MANDATORY_REASONING }),
  claudeRow("anthropic/claude-opus-5", "anthropic/claude-opus-5-20260723"),
  claudeRow("~anthropic/claude-fable-latest", "~anthropic/claude-fable-latest", {
    alias_target: { name: "Anthropic: Claude Fable 5.1", slug: "anthropic/claude-fable-5.1" },
    reasoning: MANDATORY_REASONING,
  }),
  // A floating alias whose catalog row names NO target: nothing may be inferred from its spelling.
  claudeRow("~anthropic/claude-mystery-latest", "~anthropic/claude-mystery-latest"),
  openAiRow("openai/o4-mini", "openai/o4-mini-2025-04-16"),
  openAiRow("openai/o4-mini:batch", "openai/o4-mini-2025-04-16"),
];

/** A `fetch` answering the three catalog lists: the chat rows on the bare list, nothing on the other two. */
export function openRouterCatalogFetch(rows: readonly Record<string, unknown>[] = OPENROUTER_CHAT_ROWS): typeof fetch {
  return (input) => {
    const url = String(input);
    const data = url.includes("output_modalities=") ? [] : rows;
    return Promise.resolve(Response.json({ data }));
  };
}

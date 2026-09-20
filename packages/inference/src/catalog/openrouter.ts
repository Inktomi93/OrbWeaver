// The KEYLESS OpenRouter catalog fetch — one of the three plain-fetch calls the provider package lacks
// (§8.2). THREE lists, not one (measured 2026-09-19 against the live API + raw SDK 1.1.8): the bare
// `GET /models` is the CHAT catalog only — embedding and rerank models are excluded from it and listed by
// `GET /models?output_modalities=embeddings` / `?output_modalities=rerank` (the raw SDK's
// `embeddingsListModels` hits `/embeddings/models`, the same rows). A row's KIND is therefore its
// `architecture.output_modalities` (`["embeddings"]` / `["rerank"]` / anything else ⇒ generation), which is
// how "qwen/qwen3-reranker-8b" classifies as a reranker without a name regex. Normalizes the snake_case rows
// into `ModelCatalogEntry`: pricing strings → numbers (blank → null, the UNPRICED signal, never a free model),
// modalities + supported parameters stringified, the top provider's real output cap and moderation bit, the
// per-model reasoning object.

import type { ModelCatalogEntry, ModelKind } from "@orb/contracts/inference";
import { z } from "zod";
import { fetchJson } from "../backends/kit/fetch-json.ts";
import { NO_PROVIDER_SECRETS } from "../backends/kit/sanitize.ts";

const rowSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    context_length: z.number().nullable().optional(),
    pricing: z
      .object({
        prompt: z.string().optional(),
        completion: z.string().optional(),
        input_cache_read: z.string().optional(),
        input_cache_write: z.string().optional(),
      })
      .loose()
      .optional(),
    architecture: z
      .object({ input_modalities: z.array(z.string()).optional(), output_modalities: z.array(z.string()).optional() })
      .loose()
      .optional(),
    supported_parameters: z.array(z.string()).optional(),
    top_provider: z.object({ max_completion_tokens: z.number().nullable().optional(), is_moderated: z.boolean().optional() }).loose().optional(),
    reasoning: z
      .object({
        mandatory: z.boolean().optional(),
        default_enabled: z.boolean().optional(),
        supported_efforts: z.array(z.string().nullable()).nullable().optional(),
        default_effort: z.string().nullable().optional(),
        supports_max_tokens: z.boolean().optional(),
      })
      .loose()
      .nullable()
      .optional(),
  })
  .loose();

const catalogSchema = z.object({ data: z.array(rowSchema) }).loose();

function toNumberOrNull(value: string | undefined): number | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type RawReasoning = NonNullable<z.infer<typeof rowSchema>["reasoning"]>;

/** OR's `reasoning` object → the snapshot shape. `supported_efforts` drops the wire's stray nulls (a `null`
 *  allowlist stays null = "no allowlist, all efforts accepted"). */
function toReasoning(reasoning: RawReasoning): NonNullable<ModelCatalogEntry["reasoning"]> {
  const efforts = reasoning.supported_efforts;
  return {
    mandatory: reasoning.mandatory ?? false,
    ...(reasoning.default_enabled !== undefined ? { defaultEnabled: reasoning.default_enabled } : {}),
    supportedEfforts: efforts === null || efforts === undefined ? null : efforts.filter((effort): effort is string => effort !== null),
    ...(reasoning.default_effort !== undefined && reasoning.default_effort !== null ? { defaultEffort: reasoning.default_effort } : {}),
    ...(reasoning.supports_max_tokens !== undefined ? { supportsMaxTokens: reasoning.supports_max_tokens } : {}),
  };
}

/** The catalog's own kind marker — OR spells a non-chat model by its OUTPUT modality, never by name. */
const EMBEDDINGS_OUTPUT = "embeddings";
const RERANK_OUTPUT = "rerank";

function kindOf(outputModalities: readonly string[]): ModelKind {
  if (outputModalities.includes(EMBEDDINGS_OUTPUT)) {
    return "embedding";
  }
  if (outputModalities.includes(RERANK_OUTPUT)) {
    return "rerank";
  }
  return "generation";
}

function toEntry(row: z.infer<typeof rowSchema>): ModelCatalogEntry {
  const reasoning = row.reasoning;
  return {
    id: row.id,
    kind: kindOf(row.architecture?.output_modalities ?? []),
    name: row.name !== undefined && row.name.length > 0 ? row.name : row.id,
    contextLength: row.context_length ?? null,
    promptPrice: toNumberOrNull(row.pricing?.prompt),
    completionPrice: toNumberOrNull(row.pricing?.completion),
    cacheReadPrice: toNumberOrNull(row.pricing?.input_cache_read),
    cacheWritePrice: toNumberOrNull(row.pricing?.input_cache_write),
    inputModalities: row.architecture?.input_modalities ?? [],
    outputModalities: row.architecture?.output_modalities ?? [],
    supportedParameters: row.supported_parameters ?? [],
    maxCompletionTokens: row.top_provider?.max_completion_tokens ?? null,
    ...(row.top_provider?.is_moderated !== undefined ? { isModerated: row.top_provider.is_moderated } : {}),
    reasoning: reasoning === null || reasoning === undefined ? null : toReasoning(reasoning),
  };
}

/** The three lists that together are the catalog: chat (bare), embeddings, rerank. */
const CATALOG_QUERIES = ["", `?output_modalities=${EMBEDDINGS_OUTPUT}`, `?output_modalities=${RERANK_OUTPUT}`] as const;

export async function fetchOpenRouterCatalog(args: {
  readonly fetch: typeof fetch;
  readonly baseUrl: string;
  readonly signal?: AbortSignal | undefined;
}): Promise<ModelCatalogEntry[]> {
  const root = `${args.baseUrl.replace(/\/$/u, "")}/models`;
  const lists = await Promise.all(
    CATALOG_QUERIES.map(async (query) => {
      const result = await fetchJson({
        fetch: args.fetch,
        url: `${root}${query}`,
        secrets: NO_PROVIDER_SECRETS,
        label: `openrouter catalog${query}`,
        ...(args.signal !== undefined ? { signal: args.signal } : {}),
      });
      return catalogSchema.parse(result.json).data.map(toEntry);
    }),
  );
  // Dedupe by id in list order — a row present in two lists keeps its first (chat-list) entry.
  const byId = new Map<string, ModelCatalogEntry>();
  for (const entry of lists.flat()) {
    if (!byId.has(entry.id)) {
      byId.set(entry.id, entry);
    }
  }
  return [...byId.values()];
}

import { fetchOpenRouterCatalog } from "../../../packages/inference/src/catalog/openrouter.ts";
import { expect, test } from "../../support/fixtures.ts";
import { openRouterCatalogFetch } from "../_openrouter-catalog.ts";

test("OpenRouter catalog merges its three modality lists and preserves the first row per id", async () => {
  const requested: string[] = [];
  const fetchImpl = (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    requested.push(url);
    if (url.endsWith("output_modalities=embeddings")) {
      return Promise.resolve(
        Response.json({
          data: [
            {
              id: "embed/model",
              architecture: { input_modalities: ["text"], output_modalities: ["embeddings"] },
              pricing: { prompt: "0.000001", completion: "" },
            },
          ],
        }),
      );
    }
    if (url.endsWith("output_modalities=rerank")) {
      return Promise.resolve(
        Response.json({
          data: [
            { id: "rerank/model", architecture: { output_modalities: ["rerank"] } },
            { id: "shared/model", name: "late duplicate", architecture: { output_modalities: ["rerank"] } },
          ],
        }),
      );
    }
    return Promise.resolve(
      Response.json({
        data: [
          {
            id: "shared/model",
            name: "first row",
            context_length: 200_000,
            pricing: { prompt: "0.1", completion: "not-a-number", input_cache_read: "0.02" },
            architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
            supported_parameters: ["tools"],
            top_provider: { max_completion_tokens: 8192, is_moderated: true },
            reasoning: {
              mandatory: true,
              default_enabled: false,
              supported_efforts: ["low", null, "high"],
              default_effort: "low",
              supports_max_tokens: true,
            },
          },
        ],
      }),
    );
  };

  const rows = await fetchOpenRouterCatalog({ fetch: fetchImpl as typeof fetch, baseUrl: "https://openrouter.example/api/v1/" });

  expect(requested).toEqual([
    "https://openrouter.example/api/v1/models",
    "https://openrouter.example/api/v1/models?output_modalities=embeddings",
    "https://openrouter.example/api/v1/models?output_modalities=rerank",
  ]);
  expect(rows).toEqual([
    {
      id: "shared/model",
      kind: "generation",
      name: "first row",
      contextLength: 200_000,
      promptPrice: 0.1,
      completionPrice: null,
      cacheReadPrice: 0.02,
      cacheWritePrice: null,
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      supportedParameters: ["tools"],
      maxCompletionTokens: 8192,
      isModerated: true,
      reasoning: {
        mandatory: true,
        defaultEnabled: false,
        supportedEfforts: ["low", "high"],
        defaultEffort: "low",
        supportsMaxTokens: true,
      },
    },
    {
      id: "embed/model",
      kind: "embedding",
      name: "embed/model",
      contextLength: null,
      promptPrice: 0.000_001,
      completionPrice: null,
      cacheReadPrice: null,
      cacheWritePrice: null,
      inputModalities: ["text"],
      outputModalities: ["embeddings"],
      supportedParameters: [],
      maxCompletionTokens: null,
      reasoning: null,
    },
    {
      id: "rerank/model",
      kind: "rerank",
      name: "rerank/model",
      contextLength: null,
      promptPrice: null,
      completionPrice: null,
      cacheReadPrice: null,
      cacheWritePrice: null,
      inputModalities: [],
      outputModalities: ["rerank"],
      supportedParameters: [],
      maxCompletionTokens: null,
      reasoning: null,
    },
  ]);
});

test("aliasOf is read only where the catalog states it: an alias's named target, a variant's canonical-slug base", async () => {
  const rows = await fetchOpenRouterCatalog({ fetch: openRouterCatalogFetch(), baseUrl: "https://openrouter.example/api/v1" });
  const aliasOf = (id: string): string | undefined => rows.find((row) => row.id === id)?.aliasOf;
  expect(aliasOf("~anthropic/claude-fable-latest")).toBe("anthropic/claude-fable-5.1");
  expect(aliasOf("anthropic/claude-fable-5.1:batch")).toBe("anthropic/claude-fable-5.1");
  expect(aliasOf("openai/o4-mini:batch")).toBe("openai/o4-mini");
  // A base id is its own model; an alias naming no target is left alone rather than guessed from its spelling.
  expect(aliasOf("anthropic/claude-fable-5.1")).toBeUndefined();
  expect(aliasOf("~anthropic/claude-mystery-latest")).toBeUndefined();
  // A variant with no un-suffixed sibling in the catalog has nothing to share.
  const orphan = await fetchOpenRouterCatalog({
    fetch: openRouterCatalogFetch([{ id: "acme/solo:free", canonical_slug: "acme/solo-2026", supported_parameters: [] }]),
    baseUrl: "https://openrouter.example/api/v1",
  });
  expect(orphan[0]?.aliasOf).toBeUndefined();
});

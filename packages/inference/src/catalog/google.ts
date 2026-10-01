// Native discovery contributes API-advertised limits and methods; curated rows own model capabilities.
import type { ModelCatalogEntry, ModelListing } from "@orb/contracts/inference";
import { z } from "zod";
import { googleBaseUrl, googleModelId } from "../backends/google/model.ts";
import { fetchJson } from "../backends/kit/fetch-json.ts";
import { bareCatalogEntry, failedListing, listingOf } from "../backends/kit/model-listing.ts";
import type { ProviderScrubSet } from "../contract/errors.ts";
import { ProviderError } from "../contract/errors.ts";

const modelsSchema = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      displayName: z.string().optional(),
      inputTokenLimit: z.number().positive().optional(),
      outputTokenLimit: z.number().positive().optional(),
      supportedGenerationMethods: z.array(z.string()),
      thinking: z.boolean().optional(),
      maxTemperature: z.number().optional(),
      topP: z.number().optional(),
      topK: z.number().optional(),
    }),
  ),
  nextPageToken: z.string().optional(),
});

interface GoogleModelsDial {
  readonly baseUrl: string | null;
  readonly secret: string | null;
  readonly secrets: ProviderScrubSet;
  readonly label: string;
  readonly signal?: AbortSignal | undefined;
}

function catalogEntry(row: z.infer<typeof modelsSchema>["models"][number]): ModelCatalogEntry[] {
  let kind: ModelCatalogEntry["kind"];
  if (row.supportedGenerationMethods.includes("embedContent")) {
    kind = "embedding";
  } else if (row.supportedGenerationMethods.includes("generateContent")) {
    kind = "generation";
  }
  if (kind === undefined) {
    return [];
  }
  return [
    {
      ...bareCatalogEntry({ id: googleModelId(row.name), name: row.displayName, contextLength: row.inputTokenLimit ?? null }),
      kind,
      google: { thinking: row.thinking, maxTemperature: row.maxTemperature, topP: row.topP, topK: row.topK },
      maxCompletionTokens: row.outputTokenLimit ?? null,
    },
  ];
}

export async function fetchGoogleModels(dial: GoogleModelsDial, fetchImpl: typeof fetch): Promise<ModelCatalogEntry[]> {
  if (dial.secret === null || dial.secret.length === 0) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: "Google model discovery requires an API key" });
  }
  const rows: ModelCatalogEntry[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  do {
    const url = new URL(`${googleBaseUrl(dial.baseUrl)}/models`);
    if (pageToken !== undefined) {
      url.searchParams.set("pageToken", pageToken);
    }
    const result = await fetchJson({
      fetch: fetchImpl,
      url: url.toString(),
      headers: { "x-goog-api-key": dial.secret },
      secrets: dial.secrets,
      label: dial.label,
      signal: dial.signal,
    });
    const page = modelsSchema.parse(result.json);
    rows.push(...page.models.flatMap(catalogEntry));
    pageToken = page.nextPageToken;
    if (pageToken !== undefined) {
      if (seen.has(pageToken)) {
        throw new ProviderError({ kind: "invalid", retryable: false, message: "Google model discovery repeated a page token" });
      }
      seen.add(pageToken);
    }
  } while (pageToken !== undefined);
  return rows;
}

export async function listGoogleModels(dial: GoogleModelsDial, fetchImpl: typeof fetch): Promise<ModelListing> {
  // @orb-waive caught-failure-ownership(err): optional discovery returns a failed listing with the scrubbed reason; explicit model entry remains available. Ends if discovery becomes required.
  try {
    return listingOf(await fetchGoogleModels(dial, fetchImpl));
  } catch (err) {
    return failedListing(err, dial.secrets);
  }
}

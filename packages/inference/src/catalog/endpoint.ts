// An OpenAI-compatible `GET /v1/models` — the list for a hosted `openai-compatible` row (the provider's
// fixed URL) or an `auth: endpoint` row (the CONNECTION's URL, fetched SERVER-SIDE because a browser cannot
// reach a user's loopback box). Ids, plus a window when the server reports one (vLLM `max_model_len`,
// LM Studio `max_context_length`); NEVER a kind or modalities — no OpenAI-compatible list carries them.

import { z } from "zod";
import { authHeaders, fetchJson, openAiPath } from "../backends/kit/fetch-json.ts";
import type { ProviderScrubSet } from "../contract/errors.ts";
import type { EndpointModel } from "../contract/runtime.ts";

const rowSchema = z
  .object({
    id: z.string(),
    max_model_len: z.number().nullable().optional(),
    context_length: z.number().nullable().optional(),
    max_context_length: z.number().nullable().optional(),
  })
  .loose();

const listSchema = z.object({ data: z.array(rowSchema) }).loose();

export async function fetchEndpointModels(args: {
  readonly fetch: typeof fetch;
  readonly baseUrl: string;
  readonly secret: string | null;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly secrets: ProviderScrubSet;
  readonly signal?: AbortSignal | undefined;
}): Promise<EndpointModel[]> {
  const result = await fetchJson({
    fetch: args.fetch,
    url: openAiPath(args.baseUrl, "/models"),
    headers: authHeaders(args.secret, args.headers),
    secrets: args.secrets,
    label: "endpoint models",
    ...(args.signal !== undefined ? { signal: args.signal } : {}),
  });
  return listSchema.parse(result.json).data.map((row) => ({
    id: row.id,
    contextLength: row.max_model_len ?? row.context_length ?? row.max_context_length ?? null,
  }));
}

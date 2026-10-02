// An OpenAI-compatible `GET /v1/models` — the list for a hosted `openai-compatible` row (the provider's
// fixed URL) or an `auth: endpoint` row (the CONNECTION's URL, fetched SERVER-SIDE because a browser cannot
// reach a user's loopback box). Ids, plus a window when the server reports one (vLLM `max_model_len`,
// LM Studio `max_context_length`, Ollama's native API when `features.modelInfoApi` names it); NEVER a kind
// or modalities — no OpenAI-compatible list carries them.

import type { ModelInfoApi } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { z } from "zod";
import { authHeaders, fetchJson, openAiPath, serverRootOf } from "../backends/kit/fetch-json.ts";
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

const ollamaPsSchema = z
  .object({ models: z.array(z.object({ name: z.string(), model: z.string().optional(), context_length: z.number().int().positive().optional() }).loose()) })
  .loose();
const ollamaShowSchema = z.object({ parameters: z.string().optional(), model_info: z.record(z.string(), z.unknown()).nullable().optional() }).loose();

/** A Modelfile `PARAMETER num_ctx N` line as `ollama show` prints it in `parameters`. */
const NUM_CTX_RE = /^num_ctx\s+(\d+)\s*$/mu;
/** `model_info` keys are prefixed with the architecture (`nomic-bert.embedding_length`). */
const EMBEDDING_LENGTH_SUFFIX = ".embedding_length";

export interface EndpointFetchArgs {
  readonly fetch: typeof fetch;
  readonly baseUrl: string;
  readonly secret: string | null;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly secrets: ProviderScrubSet;
  readonly signal?: AbortSignal | undefined;
  /** The row's folded `features.modelInfoApi`. */
  readonly modelInfoApi?: ModelInfoApi | undefined;
  /** Where a failed native read is reported; it never fails the list. */
  readonly warn?: ((message: string) => void) | undefined;
}

export async function fetchEndpointModels(args: EndpointFetchArgs): Promise<EndpointModel[]> {
  const result = await fetchJson({
    fetch: args.fetch,
    url: openAiPath(args.baseUrl, "/models"),
    headers: authHeaders(args.secret, args.headers),
    secrets: args.secrets,
    label: "endpoint models",
    ...(args.signal !== undefined ? { signal: args.signal } : {}),
  });
  const rows = listSchema.parse(result.json).data.map(
    (row): EndpointModel => ({
      id: row.id,
      contextLength: row.max_model_len ?? row.context_length ?? row.max_context_length ?? null,
    }),
  );
  return args.modelInfoApi === "ollama" ? await withOllamaInfo(args, rows) : rows;
}

interface OllamaFacts {
  /** The window Ollama truncates at: the Modelfile's `num_ctx`, else the loaded runner's `context_length`. */
  readonly contextLength: number | null;
  readonly embeddingDims: number | null;
}

/** Ollama's `/v1/models` carries no window, and the window it runs is NOT the model's trained maximum
 *  (`<arch>.context_length`): a request is truncated at `num_ctx`, which the Modelfile pins or the server
 *  defaults by VRAM. So the trained maximum is never reported as the window; an unpinned, unloaded model
 *  stays unreported and the capability marks its window assumed. */
async function withOllamaInfo(args: EndpointFetchArgs, rows: readonly EndpointModel[]): Promise<EndpointModel[]> {
  const root = serverRootOf(args.baseUrl);
  const headers = authHeaders(args.secret, args.headers);
  const read = (path: string, body?: unknown): Promise<unknown> =>
    fetchJson({
      fetch: args.fetch,
      url: `${root}${path}`,
      ...(body === undefined ? {} : { method: "POST" as const, body }),
      headers,
      secrets: args.secrets,
      label: `ollama ${path}`,
      ...(args.signal !== undefined ? { signal: args.signal } : {}),
    }).then((response) => response.json);
  const loaded = await nativeRead(args, () => read("/api/ps").then((json) => ollamaPsSchema.parse(json).models));
  const out: EndpointModel[] = [];
  for (const row of rows) {
    const show = await nativeRead(args, () => read("/api/show", { model: row.id }).then((json) => ollamaShowSchema.parse(json)));
    const facts = ollamaFacts(show, loaded?.find((model) => model.name === row.id || model.model === row.id)?.context_length);
    out.push({
      ...row,
      contextLength: row.contextLength ?? facts.contextLength,
      ...(facts.embeddingDims === null ? {} : { embeddingDims: facts.embeddingDims }),
    });
  }
  return out;
}

function ollamaFacts(show: z.infer<typeof ollamaShowSchema> | null, loadedContext: number | undefined): OllamaFacts {
  const pinned = show?.parameters === undefined ? undefined : NUM_CTX_RE.exec(show.parameters)?.[1];
  const width = Object.entries(show?.model_info ?? {}).find(([key]) => key.endsWith(EMBEDDING_LENGTH_SUFFIX))?.[1];
  return {
    contextLength: pinned === undefined ? (loadedContext ?? null) : Number.parseInt(pinned, 10),
    embeddingDims: typeof width === "number" && Number.isInteger(width) && width > 0 ? width : null,
  };
}

/** One native read. A server that does not answer it (an older build, a proxy exposing only `/v1`) still
 *  lists its models; the reason goes to the warn sink and the facts stay unreported. */
async function nativeRead<T>(args: EndpointFetchArgs, run: () => Promise<T>): Promise<T | null> {
  // @orb-waive caught-failure-ownership(err): the native read is optional evidence beside a list that already
  // answered; its failure is reported through `warn` and degrades to "not reported", which the capability
  // marks assumed. Ends if a caller ever needs the native facts to list a model.
  try {
    return await run();
  } catch (err) {
    args.warn?.(`ollama model info unavailable: ${errorMessage(err)}`);
    return null;
  }
}

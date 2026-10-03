// An OpenAI-compatible `GET /v1/models` — the list for a hosted `openai-compatible` row (the provider's
// fixed URL) or an `auth: endpoint` row (the CONNECTION's URL, fetched SERVER-SIDE because a browser cannot
// reach a user's loopback box). The generic list yields ids plus a window when the server reports one; a
// row whose folded `features.modelInfoApi` names a server's native API reads that beside the list for what
// the list lacks (D292): the window the server runs, an embedder's width, the model's kind, and whether it
// takes tools or an image. Every native read is optional evidence: a server that does not answer it still
// lists, the reason goes to `warn`, and the facts stay unreported.

import type { Modality, ModelInfoApi, ModelKind } from "@orb/contracts/inference";
import { parseModalities } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { z } from "zod";
import { authHeaders, fetchJson, openAiPath, serverRootOf } from "../backends/kit/fetch-json.ts";
import type { ProviderScrubSet } from "../contract/errors.ts";
import { assertNever } from "../contract/errors.ts";
import type { EndpointModel } from "../contract/runtime.ts";

const rowSchema = z
  .object({
    id: z.string(),
    max_model_len: z.number().nullable().optional(),
    context_length: z.number().nullable().optional(),
    max_context_length: z.number().nullable().optional(),
  })
  .loose();
type RawRow = z.infer<typeof rowSchema>;

const listSchema = z.object({ data: z.array(rowSchema) }).loose();

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
  const raw = listSchema.parse(result.json).data;
  const rows = raw.map(
    (row): EndpointModel => ({
      id: row.id,
      contextLength: row.max_model_len ?? row.context_length ?? row.max_context_length ?? null,
    }),
  );
  switch (args.modelInfoApi) {
    case undefined:
      return rows;
    case "ollama":
      return await withOllamaInfo(args, rows);
    case "llama-cpp":
      return await withLlamaCppInfo(args, raw, rows);
    case "koboldcpp":
      return await withKoboldCppInfo(args, rows);
    default:
      return assertNever(args.modelInfoApi, "model info api");
  }
}

// ── shared ───────────────────────────────────────────────────────────────────────────────────────────

type NativeRead = (path: string, body?: unknown) => Promise<unknown>;

function nativeReader(args: EndpointFetchArgs): NativeRead {
  const root = serverRootOf(args.baseUrl);
  const headers = authHeaders(args.secret, args.headers);
  return (path, body) =>
    fetchJson({
      fetch: args.fetch,
      url: `${root}${path}`,
      ...(body === undefined ? {} : { method: "POST" as const, body }),
      headers,
      secrets: args.secrets,
      label: `${args.modelInfoApi ?? "endpoint"} ${path}`,
      ...(args.signal !== undefined ? { signal: args.signal } : {}),
    }).then((response) => response.json);
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
    args.warn?.(`${args.modelInfoApi ?? "endpoint"} model info unavailable: ${errorMessage(err)}`);
    return null;
  }
}

const VERSION_RE = /\d+(?:\.\d+)*/u;

function versionParts(version: string): number[] | undefined {
  const match = VERSION_RE.exec(version);
  return match === null ? undefined : match[0].split(".").map((part) => Number.parseInt(part, 10));
}

/** A dotted version at or past a floor, by numeric segment; `undefined` when the string carries no number. */
function versionAtLeast(version: string | undefined, floor: string): boolean | undefined {
  const parts = version === undefined ? undefined : versionParts(version);
  const floorParts = versionParts(floor) ?? [];
  if (parts === undefined) {
    return;
  }
  for (const [index, floorPart] of floorParts.entries()) {
    const part = parts[index] ?? 0;
    if (part !== floorPart) {
      return part > floorPart;
    }
  }
  return true;
}

function withStated(row: EndpointModel, facts: Partial<EndpointModel>): EndpointModel {
  const stated = Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== undefined && value !== null));
  return { ...row, ...stated, contextLength: row.contextLength ?? facts.contextLength ?? null };
}

// ── Ollama ───────────────────────────────────────────────────────────────────────────────────────────

const ollamaPsSchema = z
  .object({ models: z.array(z.object({ name: z.string(), model: z.string().optional(), context_length: z.number().int().positive().optional() }).loose()) })
  .loose();
const ollamaShowSchema = z
  .object({
    parameters: z.string().optional(),
    model_info: z.record(z.string(), z.unknown()).nullable().optional(),
    /** `completion` · `tools` · `vision` · `embedding` · `insert` · `thinking` and newer members; absent on an older build. */
    capabilities: z.array(z.string()).optional(),
  })
  .loose();
const ollamaVersionSchema = z.object({ version: z.string() }).loose();

/** A Modelfile `PARAMETER num_ctx N` line as `ollama show` prints it in `parameters`. */
const NUM_CTX_RE = /^num_ctx\s+(\d+)\s*$/mu;
/** `model_info` keys are prefixed with the architecture (`nomic-bert.embedding_length`). */
const EMBEDDING_LENGTH_SUFFIX = ".embedding_length";
/** The release that added JSON-schema constrained output to the chat and OpenAI-compatible endpoints. */
const OLLAMA_STRUCTURED_FLOOR = "0.5.0";

/** Ollama's `/v1/models` carries ids only. Its native API states the window it truncates at (the Modelfile's
 *  `num_ctx`, else the loaded runner's), an embedder's width, and the model's capabilities. The trained maximum
 *  (`<arch>.context_length`) is NOT the window: a request is truncated at `num_ctx`, which the Modelfile pins
 *  or the server defaults, so an unpinned, unloaded model stays unreported and the capability marks it assumed. */
async function withOllamaInfo(args: EndpointFetchArgs, rows: readonly EndpointModel[]): Promise<EndpointModel[]> {
  const read = nativeReader(args);
  const version = await nativeRead(args, () => read("/api/version").then((json) => ollamaVersionSchema.parse(json).version));
  const structured = versionAtLeast(version ?? undefined, OLLAMA_STRUCTURED_FLOOR);
  const loaded = await nativeRead(args, () => read("/api/ps").then((json) => ollamaPsSchema.parse(json).models));
  const out: EndpointModel[] = [];
  for (const row of rows) {
    const show = await nativeRead(args, () => read("/api/show", { model: row.id }).then((json) => ollamaShowSchema.parse(json)));
    const loadedContext = loaded?.find((model) => model.name === row.id || model.model === row.id)?.context_length;
    out.push(withStated(row, { ...ollamaFacts(show, loadedContext), structured }));
  }
  return out;
}

const POSITIVE_INT = z.number().int().positive();

function ollamaKind(capabilities: readonly string[] | undefined): ModelKind | undefined {
  if (capabilities === undefined) {
    return;
  }
  if (capabilities.includes("embedding")) {
    return "embedding";
  }
  return capabilities.includes("completion") ? "generation" : undefined;
}

function ollamaFacts(show: z.infer<typeof ollamaShowSchema> | null, loadedContext: number | undefined): Partial<EndpointModel> {
  const pinned = show?.parameters === undefined ? undefined : NUM_CTX_RE.exec(show.parameters)?.[1];
  const contextLength = pinned === undefined ? (loadedContext ?? null) : Number.parseInt(pinned, 10);
  const width = Object.entries(show?.model_info ?? {}).find(([key]) => key.endsWith(EMBEDDING_LENGTH_SUFFIX))?.[1];
  const capabilities = show?.capabilities;
  const kind = ollamaKind(capabilities);
  if (kind !== "generation" || capabilities === undefined) {
    // Every architecture states an `embedding_length` (a chat model's is its hidden width), so it is a vector
    // width only where the capabilities do not say the model generates.
    return { contextLength, embeddingDims: POSITIVE_INT.safeParse(width).success ? (width as number) : undefined, kind };
  }
  return {
    contextLength,
    kind,
    input: modalitiesOf({ vision: capabilities.includes("vision") }),
    tools: capabilities.includes("tools") ? { parallel: false } : undefined,
  };
}

// ── llama.cpp server ─────────────────────────────────────────────────────────────────────────────────

const llamaCppPropsSchema = z
  .object({
    /** `router` on the multi-model router, whose bare `/props` describes no model. */
    role: z.string().optional(),
    modalities: z.object({ vision: z.boolean().optional(), video: z.boolean().optional(), audio: z.boolean().optional() }).loose().optional(),
    chat_template_caps: z
      .object({ supports_tools: z.boolean().optional(), supports_tool_calls: z.boolean().optional(), supports_parallel_tool_calls: z.boolean().optional() })
      .loose()
      .optional(),
    default_generation_settings: z.object({ n_ctx: z.number().int().optional() }).loose().optional(),
    build_info: z.string().optional(),
  })
  .loose();
/** The llama.cpp spellings on a `/v1/models` row: the loaded slot's window and width, and in router mode the
 *  per-model modalities (stated without loading the model). */
const llamaCppRowSchema = z
  .object({
    meta: z.object({ n_ctx: z.number().int().positive().optional(), n_embd: z.number().int().positive().optional() }).loose().optional(),
    architecture: z
      .object({ input_modalities: z.array(z.string()).optional() })
      .loose()
      .optional(),
  })
  .loose();
const LLAMA_CPP_ROUTER_ROLE = "router";
/** `build_info` is `b<number>-<hash>`. */
const LLAMA_CPP_BUILD_RE = /^b(\d+)/u;
/** A build past the merge of `response_format` with a JSON schema (grammar-constrained decoding; upstream PR
 *  5978, merged 2024-03-21 between the b2460 and b2480 tags). Conservative on purpose: the exact tag is not
 *  recoverable from the release pages. */
const LLAMA_CPP_STRUCTURED_FLOOR_BUILD = 2480;

function llamaCppBuild(buildInfo: string | undefined): number | undefined {
  const match = buildInfo === undefined ? null : LLAMA_CPP_BUILD_RE.exec(buildInfo);
  return match?.[1] === undefined ? undefined : Number.parseInt(match[1], 10);
}

function modalitiesOf(flags: {
  readonly vision?: boolean | undefined;
  readonly video?: boolean | undefined;
  readonly audio?: boolean | undefined;
}): Modality[] {
  return [
    "text",
    ...(flags.vision === true ? ["image" as const] : []),
    ...(flags.video === true ? ["video" as const] : []),
    ...(flags.audio === true ? ["audio" as const] : []),
  ];
}

interface LlamaCppServerFacts {
  readonly window: number | null;
  readonly input: readonly Modality[] | undefined;
  readonly tools: EndpointModel["tools"];
  readonly structured: boolean | undefined;
}

function llamaCppServerFacts(props: z.infer<typeof llamaCppPropsSchema> | null): LlamaCppServerFacts {
  const build = llamaCppBuild(props?.build_info);
  const structured = build === undefined ? undefined : build >= LLAMA_CPP_STRUCTURED_FLOOR_BUILD;
  if (props === null || props.role === LLAMA_CPP_ROUTER_ROLE) {
    return { window: null, input: undefined, tools: undefined, structured };
  }
  const caps = props.chat_template_caps;
  const window = props.default_generation_settings?.n_ctx;
  return {
    window: window !== undefined && window > 0 ? window : null,
    input: props.modalities === undefined ? undefined : modalitiesOf(props.modalities),
    tools: caps?.supports_tools === true && caps.supports_tool_calls === true ? { parallel: caps.supports_parallel_tool_calls === true } : undefined,
    structured,
  };
}

/** A router row states its own modalities without loading the model; a single-model row takes the server's. */
function llamaCppRowInput(listed: readonly string[] | undefined, server: LlamaCppServerFacts): readonly Modality[] | undefined {
  if (listed === undefined) {
    return server.input;
  }
  const { modalities } = parseModalities(listed);
  return modalities.length > 0 ? modalities : server.input;
}

/** llama.cpp serves one model per process, so `/props` describes every listed row: the loaded modalities and
 *  what the chat template can render. Tools are stated only when the template both describes tools and renders
 *  a call (the server warns that one without the other misbehaves). The router's bare `/props` describes no
 *  model; its rows carry their own modalities and tools stay unstated. */
async function withLlamaCppInfo(args: EndpointFetchArgs, raw: readonly RawRow[], rows: readonly EndpointModel[]): Promise<EndpointModel[]> {
  const read = nativeReader(args);
  const props = await nativeRead(args, () => read("/props").then((json) => llamaCppPropsSchema.parse(json)));
  const server = llamaCppServerFacts(props);
  return rows.map((row, index) => {
    const parsed = llamaCppRowSchema.safeParse(raw[index]);
    const meta = parsed.success ? parsed.data.meta : undefined;
    const input = llamaCppRowInput(parsed.success ? parsed.data.architecture?.input_modalities : undefined, server);
    return withStated(row, {
      contextLength: meta?.n_ctx ?? server.window,
      embeddingDims: meta?.n_embd,
      input: input === undefined ? undefined : [...input],
      tools: server.tools,
      structured: server.structured,
    });
  });
}

// ── KoboldCpp ────────────────────────────────────────────────────────────────────────────────────────

const koboldCppVersionSchema = z
  .object({
    version: z.string().optional(),
    vision: z.boolean().optional(),
    audio: z.boolean().optional(),
  })
  .loose();
const koboldCppPropsSchema = z
  .object({
    n_ctx: z.number().int().positive().optional(),
    default_generation_settings: z.object({ n_ctx: z.number().int().positive().optional() }).loose().optional(),
  })
  .loose();
/** The release that added `response_format` with a JSON schema to the OpenAI chat endpoint. */
const KOBOLDCPP_STRUCTURED_FLOOR = "1.90";

/** KoboldCpp serves one text model, so `/api/extra/version` describes every listed row: whether a projector is
 *  loaded, and a version the structured-output floor reads. Its `embeddings` flag names a separate embedder the
 *  list has no row for, so it states nothing here. Tools stay unstated: the server accepts `tools[]` for every
 *  model, but whether a call comes back as `tool_calls` depends on the model matching its parser (the rig's
 *  Qwen2.5-0.5B round-tripped on Ollama and llama.cpp and not here), so the user declares them. */
async function withKoboldCppInfo(args: EndpointFetchArgs, rows: readonly EndpointModel[]): Promise<EndpointModel[]> {
  const read = nativeReader(args);
  const version = await nativeRead(args, () => read("/api/extra/version").then((json) => koboldCppVersionSchema.parse(json)));
  const props = await nativeRead(args, () => read("/props").then((json) => koboldCppPropsSchema.parse(json)));
  const structured = versionAtLeast(version?.version, KOBOLDCPP_STRUCTURED_FLOOR);
  const input = version?.vision === undefined ? undefined : modalitiesOf({ vision: version.vision, audio: version.audio });
  const window = props?.n_ctx ?? props?.default_generation_settings?.n_ctx ?? null;
  return rows.map((row) => withStated(row, { contextLength: window, input, structured }));
}

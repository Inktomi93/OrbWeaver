// An OpenAI-compatible `GET /v1/models` — the list for a hosted `openai-compatible` row (the provider's
// fixed URL) or an `auth: endpoint` row (the CONNECTION's URL, fetched SERVER-SIDE because a browser cannot
// reach a user's loopback box). The generic list yields ids plus a window when the server reports one; a
// row whose folded `features.modelInfoApi` names a server's native API reads that beside the list for what
// the list lacks (D292): the window the server runs and the trained maximum, the model's kind and an embedder's
// measured width, whether it takes tools or an image, which forced tool choices the server honours, whether a
// trailing assistant row is continued, and the server's sampler defaults. Every native read is optional
// evidence: a server that does not answer it still lists, the reason goes to `warn`, and the facts stay unreported.

import type { Modality, ModelInfoApi, ModelKind } from "@orb/contracts/inference";
import { parseModalities } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { z } from "zod";
import { authHeaders, fetchJson, isRedirect, openAiPath, serverRootOf } from "../backends/kit/fetch-json.ts";
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
  /** The ONE listed model the per-model probes may ask about (kind, measured width, prefill). Those probes load or
   *  wake a model, so a plain listing (the add flow, diagnostics) sets none; the resolve warm names the
   *  connection's own model. */
  readonly probeModel?: string | undefined;
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

interface ProbeAnswer {
  readonly status: number;
  readonly json: unknown;
}

/** A native request whose STATUS is the answer (a 501 refusal, a 400 naming the missing field), so a non-2xx
 *  is returned rather than thrown. Only a server that does not answer at all throws. */
async function probeNative(args: EndpointFetchArgs, path: string, body: unknown): Promise<ProbeAnswer> {
  const res = await args.fetch(`${serverRootOf(args.baseUrl)}${path}`, {
    method: "POST",
    headers: { ...authHeaders(args.secret, args.headers), "content-type": "application/json" },
    body: JSON.stringify(body),
    // Host pin (#25): a redirect would replay the headers and the body to another origin, so it is no answer.
    redirect: "manual",
    ...(args.signal !== undefined ? { signal: args.signal } : {}),
  });
  if (isRedirect(res)) {
    return { status: res.status, json: null };
  }
  const text = await res.text();
  // @orb-waive caught-failure-ownership(catch): a probe answer that is not JSON states nothing; the caller reads
  // the status alone. Ends if a probed route can answer a fact in a non-JSON body.
  try {
    return { status: res.status, json: JSON.parse(text) as unknown };
  } catch {
    return { status: res.status, json: null };
  }
}

/** A trailing assistant row the server continues renders with this text as the prompt's last. */
const PREFILL_MARK = "PREFILLMARK";
const OPENAI_EMBEDDINGS_PATH = "/v1/embeddings";

/** What the per-model probes send. */
const LOCAL_SERVER_PROBES = {
  prefillMessages: [
    { role: "user", content: "hi" },
    { role: "assistant", content: PREFILL_MARK },
  ],
  embedInput: "a",
} as const;

/** Whether a rendered prompt leaves the trailing assistant row open (the server continues it). */
function prefillOf(rendered: unknown): EndpointModel["prefill"] {
  if (typeof rendered !== "string") {
    return;
  }
  return rendered.trimEnd().endsWith(PREFILL_MARK) ? "deliver" : "none";
}

const embeddingResponseSchema = z.object({ data: z.array(z.object({ embedding: z.array(z.number()) }).loose()).min(1) }).loose();

/** An embedder's width, measured: the length of the vector it returns (a server's `n_embd` is the hidden size). */
async function measuredWidth(args: EndpointFetchArgs, model: string): Promise<number | undefined> {
  const answer = await probeNative(args, OPENAI_EMBEDDINGS_PATH, { model, input: LOCAL_SERVER_PROBES.embedInput });
  const parsed = embeddingResponseSchema.safeParse(answer.json);
  const width = parsed.success ? parsed.data.data[0]?.embedding.length : undefined;
  return width === undefined || width === 0 ? undefined : width;
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
const CONTEXT_LENGTH_SUFFIX = ".context_length";
/** The release that added JSON-schema constrained output to the chat and OpenAI-compatible endpoints. */
const OLLAMA_STRUCTURED_FLOOR = "0.5.0";
/** The release that picks the default window from VRAM: 4096 below 24 GiB, 32768 to 48 GiB, 262144 above
 *  (docs.ollama.com/context-length). Its lowest tier is the floor from this release on. */
const OLLAMA_VRAM_TIERS_RELEASE = "0.15.5";
const OLLAMA_VRAM_TIERS_FLOOR = 4096;
/** The default every earlier release shipped with at its lowest. */
const OLLAMA_LEGACY_FLOOR = 2048;

/** Ollama's `/v1/models` carries ids only. Its native API states the Modelfile's `num_ctx`, an embedder's
 *  width, and the model's capabilities. `/v1/chat/completions` takes no window knob: it runs the Modelfile's
 *  `num_ctx`, else the server default, and silently drops the oldest messages that do not fit (the rig lost a
 *  fact the history fit had kept). So a pinned `num_ctx` is the window. The trained maximum (`<arch>.context_length`) is not,
 *  and neither is the loaded runner's (`/api/ps`): another client may have loaded it with its own `num_ctx`, and
 *  the next `/v1` request reloads it at the default. An unpinned model states no window and carries the lowest
 *  default the version can have, lowered by a smaller loaded runner, for the capability to assume. */
async function withOllamaInfo(args: EndpointFetchArgs, rows: readonly EndpointModel[]): Promise<EndpointModel[]> {
  const read = nativeReader(args);
  const version = await nativeRead(args, () => read("/api/version").then((json) => ollamaVersionSchema.parse(json).version));
  const structured = versionAtLeast(version ?? undefined, OLLAMA_STRUCTURED_FLOOR);
  const defaultFloor = versionAtLeast(version ?? undefined, OLLAMA_VRAM_TIERS_RELEASE) === true ? OLLAMA_VRAM_TIERS_FLOOR : OLLAMA_LEGACY_FLOOR;
  const loaded = await nativeRead(args, () => read("/api/ps").then((json) => ollamaPsSchema.parse(json).models));
  const out: EndpointModel[] = [];
  for (const row of rows) {
    const show = await nativeRead(args, () => read("/api/show", { model: row.id }).then((json) => ollamaShowSchema.parse(json)));
    const loadedContext = loaded?.find((model) => model.name === row.id || model.model === row.id)?.context_length;
    const contextFloor = Math.min(defaultFloor, loadedContext ?? defaultFloor);
    const facts = ollamaFacts(show, contextFloor);
    const prefill = facts.kind === "generation" && row.id === args.probeModel ? await nativeRead(args, () => ollamaPrefill(args, row.id)) : undefined;
    out.push(
      withStated(row, {
        ...facts,
        structured,
        serverDefaults: ollamaParameters(show?.parameters),
        prefill: prefill ?? undefined,
        ...(facts.kind === "generation" ? { toolChoice: OLLAMA_TOOL_CHOICE } : {}),
      }),
    );
  }
  return out;
}

/** Neither chat route takes `tool_choice` (`openai.go` ChatCompletionRequest has no such field; `/api/chat`
 *  neither), so a forced choice cannot reach the model. */
const OLLAMA_TOOL_CHOICE = { required: false, named: false } as const;

const ollamaRenderSchema = z.object({ ["_debug_info"]: z.object({ ["rendered_template"]: z.string() }).loose() }).loose();

/** `_debug_render_only` renders the model's template over the messages and generates nothing. Non-streaming:
 *  only that reply carries `_debug_info`. A model in the server's native mode is loaded to render. */
async function ollamaPrefill(args: EndpointFetchArgs, model: string): Promise<EndpointModel["prefill"]> {
  const answer = await probeNative(args, "/api/chat", {
    model,
    messages: LOCAL_SERVER_PROBES.prefillMessages,
    stream: false,
    ["_debug_render_only"]: true,
    // The render loads the model before it checks render-only; release it at once rather than hold the slot.
    ["keep_alive"]: 0,
  });
  const parsed = ollamaRenderSchema.safeParse(answer.json);
  return parsed.success ? prefillOf(parsed.data._debug_info.rendered_template) : undefined;
}

/** A Modelfile `PARAMETER` line as `/api/show` prints it: the key, spaces, the value. */
const PARAMETER_LINE_RE = /^(?<key>\S+)\s+(?<value>.+?)\s*$/u;
const QUOTED_RE = /^"(?<inner>.*)"$/su;

/** The Modelfile's `PARAMETER` lines as the server's sampler defaults: numbers as numbers, a repeated key
 *  (`stop`) as a list. */
function ollamaParameters(parameters: string | undefined): EndpointModel["serverDefaults"] {
  const out: Record<string, number | string | string[]> = {};
  for (const line of parameters?.split("\n") ?? []) {
    const match = PARAMETER_LINE_RE.exec(line.trim());
    if (match?.groups?.["key"] === undefined || match.groups["value"] === undefined) {
      continue;
    }
    const { key, value } = match.groups;
    const text = QUOTED_RE.exec(value)?.groups?.["inner"] ?? value;
    const prior = out[key];
    if (prior !== undefined) {
      out[key] = [...(Array.isArray(prior) ? prior : [String(prior)]), text];
      continue;
    }
    const number = Number(text);
    out[key] = QUOTED_RE.test(value) || text === "" || Number.isNaN(number) ? text : number;
  }
  return Object.keys(out).length === 0 ? undefined : out;
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

/** The model's trained maximum (`<arch>.context_length`), where `/api/show` states one. */
function ollamaTrainedWindow(show: z.infer<typeof ollamaShowSchema> | null): number | undefined {
  const trained = Object.entries(show?.model_info ?? {}).find(([key]) => key.endsWith(CONTEXT_LENGTH_SUFFIX))?.[1];
  const parsed = POSITIVE_INT.safeParse(trained);
  return parsed.success ? parsed.data : undefined;
}

// Ollama clamps `num_ctx` to the trained maximum when it loads the runner, so neither a pin nor the default
// floor can be a window above it.
function ollamaWindow(
  show: z.infer<typeof ollamaShowSchema> | null,
  contextFloor: number,
): Pick<EndpointModel, "contextLength" | "contextFloor" | "contextTrained"> {
  const stated = ollamaTrainedWindow(show);
  const trained = stated ?? Number.POSITIVE_INFINITY;
  const pinned = show?.parameters === undefined ? undefined : NUM_CTX_RE.exec(show.parameters)?.[1];
  const window =
    pinned === undefined
      ? { contextLength: null, contextFloor: Math.min(contextFloor, trained) }
      : { contextLength: Math.min(Number.parseInt(pinned, 10), trained) };
  return { ...window, ...(stated === undefined ? {} : { contextTrained: stated }) };
}

function ollamaFacts(show: z.infer<typeof ollamaShowSchema> | null, contextFloor: number): Partial<EndpointModel> {
  const window = ollamaWindow(show, contextFloor);
  const width = Object.entries(show?.model_info ?? {}).find(([key]) => key.endsWith(EMBEDDING_LENGTH_SUFFIX))?.[1];
  const capabilities = show?.capabilities;
  const kind = ollamaKind(capabilities);
  if (kind !== "generation" || capabilities === undefined) {
    // Every architecture states an `embedding_length` (a chat model's is its hidden width), so it is a vector
    // width only where the capabilities do not say the model generates.
    return { ...window, embeddingDims: POSITIVE_INT.safeParse(width).success ? (width as number) : undefined, kind };
  }
  return {
    ...window,
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
    /** Per-template booleans (`supports_tools`, `supports_system_role`, …), kept whole. */
    chat_template_caps: z.record(z.string(), z.boolean()).optional(),
    default_generation_settings: z
      .object({ n_ctx: z.number().int().optional(), params: z.record(z.string(), z.unknown()).nullable().optional() })
      .loose()
      .optional(),
    build_info: z.string().optional(),
  })
  .loose();
/** The llama.cpp spellings on a `/v1/models` row: the loaded slot's window and the trained maximum, and in router
 *  mode the per-model modalities (stated without loading the model). `meta.n_embd` is the hidden size, never read
 *  as an embedding width. */
const llamaCppRowSchema = z
  .object({
    meta: z.object({ n_ctx: z.number().int().positive().optional(), n_ctx_train: z.number().int().positive().optional() }).loose().optional(),
    architecture: z
      .object({ input_modalities: z.array(z.string()).optional() })
      .loose()
      .optional(),
  })
  .loose();
const llamaCppErrorSchema = z.object({ error: z.object({ message: z.string() }).loose() }).loose();
const llamaCppTemplateSchema = z.object({ prompt: z.string() }).loose();
const LLAMA_CPP_ROUTER_ROLE = "router";
/** `build_info` is `b<number>-<hash>`. */
const LLAMA_CPP_BUILD_RE = /^b(\d+)/u;
/** A build past the merge of `response_format` with a JSON schema (grammar-constrained decoding; upstream PR
 *  5978, merged 2024-03-21 between the b2460 and b2480 tags). Conservative on purpose: the exact tag is not
 *  recoverable from the release pages. */
const LLAMA_CPP_STRUCTURED_FLOOR_BUILD = 2480;
/** `required` is grammar-enforced; a named choice is not a value the server parses and runs as `auto`. */
const LLAMA_CPP_TOOL_CHOICE = { required: true, named: false } as const;
const HTTP_NOT_IMPLEMENTED = 501;
const HTTP_BAD_REQUEST = 400;
/** The handlers' own refusal text for an empty body, which names what a request must carry. */
const RERANK_QUERY_MISSING = "query";
const POOLING_NONE = "Pooling type 'none'";

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

const SERVER_DEFAULT_VALUE = z.union([z.number(), z.string(), z.boolean(), z.array(z.string())]);

/** The launch sampler defaults, keeping the scalar and string-list values (nested blocks such as `lora` objects
 *  are not a knob default). */
function serverDefaultsOf(params: Readonly<Record<string, unknown>> | undefined): EndpointModel["serverDefaults"] {
  const kept = Object.entries(params ?? {}).filter(([, value]) => SERVER_DEFAULT_VALUE.safeParse(value).success);
  return kept.length === 0 ? undefined : (Object.fromEntries(kept) as NonNullable<EndpointModel["serverDefaults"]>);
}

interface LlamaCppServerFacts {
  readonly window: number | null;
  readonly input: readonly Modality[] | undefined;
  readonly tools: EndpointModel["tools"];
  readonly structured: boolean | undefined;
  readonly templateCaps: EndpointModel["templateCaps"];
  readonly serverDefaults: EndpointModel["serverDefaults"];
}

function llamaCppServerFacts(props: z.infer<typeof llamaCppPropsSchema> | null): LlamaCppServerFacts {
  const build = llamaCppBuild(props?.build_info);
  const structured = build === undefined ? undefined : build >= LLAMA_CPP_STRUCTURED_FLOOR_BUILD;
  if (props === null || props.role === LLAMA_CPP_ROUTER_ROLE) {
    return { window: null, input: undefined, tools: undefined, structured, templateCaps: undefined, serverDefaults: undefined };
  }
  const caps = props.chat_template_caps;
  const window = props.default_generation_settings?.n_ctx;
  return {
    window: window !== undefined && window > 0 ? window : null,
    input: props.modalities === undefined ? undefined : modalitiesOf(props.modalities),
    tools: caps?.["supports_tools"] === true && caps["supports_tool_calls"] === true ? { parallel: caps["supports_parallel_tool_calls"] === true } : undefined,
    structured,
    templateCaps: caps,
    serverDefaults: serverDefaultsOf(props.default_generation_settings?.params ?? undefined),
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

function refusalMessage(answer: ProbeAnswer): string {
  const parsed = llamaCppErrorSchema.safeParse(answer.json);
  return parsed.success ? parsed.data.error.message : "";
}

/**
 * What the one loaded model IS, from the embeddings and rerank handlers' answers to an empty body: no field in
 * `/props` or `/v1/models` says. Each refuses with 501 when the server was not launched for it, and with a 400
 * naming the missing input when it was. An embedder run without pooling (`--pooling none`) serves only the
 * native per-token route, so its kind stays unstated. These handlers wake a sleeping server.
 */
async function llamaCppKind(args: EndpointFetchArgs): Promise<ModelKind | undefined> {
  const rerank = await probeNative(args, "/rerank", {});
  if (rerank.status === HTTP_BAD_REQUEST && refusalMessage(rerank).includes(RERANK_QUERY_MISSING)) {
    return "rerank";
  }
  const embed = await probeNative(args, OPENAI_EMBEDDINGS_PATH, {});
  if (embed.status === HTTP_NOT_IMPLEMENTED) {
    return "generation";
  }
  return embed.status === HTTP_BAD_REQUEST && !refusalMessage(embed).includes(POOLING_NONE) ? "embedding" : undefined;
}

/** `/apply-template` runs the chat route's own message handling over the loaded template, with no inference. */
async function llamaCppPrefill(args: EndpointFetchArgs): Promise<EndpointModel["prefill"]> {
  const answer = await probeNative(args, "/apply-template", { messages: LOCAL_SERVER_PROBES.prefillMessages });
  const parsed = llamaCppTemplateSchema.safeParse(answer.json);
  return parsed.success ? prefillOf(parsed.data.prompt) : undefined;
}

/** The facts only the loaded model can answer: its kind, an embedder's measured width, and a chat model's
 *  prefill. A router describes no single model, and probing it would load one, so it is not asked. */
async function llamaCppModelFacts(args: EndpointFetchArgs, model: string): Promise<Partial<EndpointModel>> {
  const kind = await nativeRead(args, () => llamaCppKind(args));
  if (kind === "embedding") {
    return { kind, embeddingDims: (await nativeRead(args, () => measuredWidth(args, model))) ?? undefined };
  }
  if (kind === "generation") {
    return { kind, prefill: (await nativeRead(args, () => llamaCppPrefill(args))) ?? undefined, toolChoice: LLAMA_CPP_TOOL_CHOICE };
  }
  return { kind: kind ?? undefined };
}

/** llama.cpp serves one model per process, so `/props` describes every listed row: the loaded modalities, what
 *  the chat template can render, and the launch sampler defaults. Tools are stated only when the template both
 *  describes tools and renders a call (the server warns that one without the other misbehaves). The router's
 *  bare `/props` describes no model; its rows carry their own modalities and tools stay unstated. */
async function withLlamaCppInfo(args: EndpointFetchArgs, raw: readonly RawRow[], rows: readonly EndpointModel[]): Promise<EndpointModel[]> {
  const read = nativeReader(args);
  const props = await nativeRead(args, () => read("/props").then((json) => llamaCppPropsSchema.parse(json)));
  const server = llamaCppServerFacts(props);
  const single = props !== null && props.role !== LLAMA_CPP_ROUTER_ROLE;
  const out: EndpointModel[] = [];
  for (const [index, row] of rows.entries()) {
    const parsed = llamaCppRowSchema.safeParse(raw[index]);
    const meta = parsed.success ? parsed.data.meta : undefined;
    const input = llamaCppRowInput(parsed.success ? parsed.data.architecture?.input_modalities : undefined, server);
    const model = single && row.id === args.probeModel ? await llamaCppModelFacts(args, row.id) : {};
    out.push(
      withStated(row, {
        contextLength: meta?.n_ctx ?? server.window,
        contextTrained: meta?.n_ctx_train,
        input: input === undefined ? undefined : [...input],
        tools: server.tools,
        structured: server.structured,
        templateCaps: server.templateCaps,
        serverDefaults: server.serverDefaults,
        ...model,
      }),
    );
  }
  return out;
}

// ── KoboldCpp ────────────────────────────────────────────────────────────────────────────────────────

const koboldCppVersionSchema = z
  .object({
    version: z.string().optional(),
    vision: z.boolean().optional(),
    audio: z.boolean().optional(),
    /** A text model is loaded. */
    llm: z.boolean().optional(),
    /** A separate embeddings model is loaded (`--embeddingsmodel`). */
    embeddings: z.boolean().optional(),
    /** Chat renders through the model's jinja template (`--jinja`) rather than KoboldCpp's adapter. */
    jinja: z.boolean().optional(),
  })
  .loose();
const koboldCppPropsSchema = z
  .object({
    n_ctx: z.number().int().positive().optional(),
    default_generation_settings: z.object({ n_ctx: z.number().int().positive().optional() }).loose().optional(),
    chat_template: z.string().nullable().optional(),
  })
  .loose();
const koboldCppValueSchema = z.object({ value: z.number().int().positive() }).loose();
/** The release that added `response_format` with a JSON schema to the OpenAI chat endpoint. */
const KOBOLDCPP_STRUCTURED_FLOOR = "1.90";
/** Without `--jinja_tools` the server picks ONE tool itself and grammar-forces it; with it, the choice is ignored
 *  for generation. Neither honours a forced choice the request names. */
const KOBOLDCPP_TOOL_CHOICE = { required: false, named: false } as const;

/** What the listed row is: a server with no text model and an embedder lists that embedder as its one row. With
 *  both loaded, the embedder is not listed at all and the row is the text model. */
function koboldCppKind(version: z.infer<typeof koboldCppVersionSchema> | null): ModelKind | undefined {
  if (version?.llm === true) {
    return "generation";
  }
  return version?.llm === false && version.embeddings === true ? "embedding" : undefined;
}

/** KoboldCpp serves one text model, so `/api/extra/version` describes every listed row: whether a projector is
 *  loaded, whether a text model or only an embedder is, and a version the structured-output floor reads. Tools
 *  stay unstated: the server accepts `tools[]` for every model, but whether a call comes back as `tool_calls`
 *  depends on the model matching its parser (the rig's Qwen2.5-0.5B round-tripped on Ollama and llama.cpp and
 *  not here), so the user declares them. Both chat paths continue a trailing assistant row, so prefill is
 *  `deliver` without a probe. */
async function withKoboldCppInfo(args: EndpointFetchArgs, rows: readonly EndpointModel[]): Promise<EndpointModel[]> {
  const read = nativeReader(args);
  const version = await nativeRead(args, () => read("/api/extra/version").then((json) => koboldCppVersionSchema.parse(json)));
  const props = await nativeRead(args, () => read("/props").then((json) => koboldCppPropsSchema.parse(json)));
  const replyLength = await nativeRead(args, () => read("/api/v1/config/max_length").then((json) => koboldCppValueSchema.parse(json).value));
  const structured = versionAtLeast(version?.version, KOBOLDCPP_STRUCTURED_FLOOR);
  const input = version?.vision === undefined ? undefined : modalitiesOf({ vision: version.vision, audio: version.audio });
  const window = props?.n_ctx ?? props?.default_generation_settings?.n_ctx ?? null;
  const kind = koboldCppKind(version);
  const out: EndpointModel[] = [];
  for (const row of rows) {
    const facts: Partial<EndpointModel> =
      kind === "embedding"
        ? { kind, embeddingDims: row.id === args.probeModel ? ((await nativeRead(args, () => measuredWidth(args, row.id))) ?? undefined) : undefined }
        : {
            kind,
            input,
            structured,
            chatTemplate: props?.chat_template ?? undefined,
            defaultReplyTokens: replyLength ?? undefined,
            jinja: version?.jinja,
            ...(kind === "generation" ? { prefill: "deliver" as const, toolChoice: KOBOLDCPP_TOOL_CHOICE } : {}),
          };
    out.push(withStated(row, { contextLength: window, ...facts }));
  }
  return out;
}

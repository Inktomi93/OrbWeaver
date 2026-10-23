import type {
  CachePolicy,
  Dialect,
  EffortLevel,
  EndpointFeatures,
  ImageDetail,
  PromptCacheFormat,
  ResolvedWarning,
  TokenizeApi,
  WordTokens,
} from "@orb/contracts/inference";
import type { ResponseCacheControl, ResponseCacheSettings } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import type { AddSpanEvent, ConnectionTransport, ProviderBackend, ProviderScrubSet, Reachability, Resolved, ScheduleTimeout, WireCaptureSink } from "#contract";
import type { InferenceDeps, InferenceLog } from "./runtime.ts";
import type { WirePlan, WrapFetchArgs } from "./v4.ts";
import type { NormalizeImageBytes } from "./wire.ts";

export interface ShapeArgs {
  readonly cacheMarkers?: ReadonlyMap<number, Record<string, unknown>> | undefined;
  readonly cacheFormat?: PromptCacheFormat | undefined;
  readonly plan: WirePlan | null;
  readonly features: EndpointFeatures;
  readonly extras: Readonly<Record<string, JsonValue>> | null;
  readonly transport: ConnectionTransport | null;
  /** `openai-compatible` merges every non-belt, non-colliding extras key; `openrouter` takes its two. */
  readonly dialect: Dialect;
  /** The capability half of the prefill decision (`acceptsAssistantPrefill`); the array half is the plan's. */
  readonly prefillAllowed: boolean;
  /** Rule 10 runs: the admitted prefix action preserves block ends at the effective merging role floor. */
  readonly foldSameRole: boolean;
  readonly replyImages: boolean;
  /** What rule 5b tells the template's thinking switch (`templateThinkingFor`); `undefined` sends nothing. */
  readonly templateThinking: boolean | undefined;
  /** Rule 5c: `false` when the turn's reasoning carry resolved off; `undefined` sends nothing. */
  readonly templatePreserveReasoning: boolean | undefined;
  /** The model's reasoning is mandatory: it is never told off, so rule 5's interlock leaves thinking alone. */
  readonly reasoningMandatory: boolean;
  readonly imageDetail?: ImageDetail | undefined;
  readonly warnings: ResolvedWarning[];
}

export interface OpenAiCompatChatDeps {
  readonly scheduleTimeout: ScheduleTimeout;
  readonly now: () => number;
  readonly random: () => number;
  readonly log: InferenceLog;
  readonly addSpanEvent?: AddSpanEvent | undefined;
  readonly transport: TransportDeps;
  readonly tokens: TokenLexicon;
}

export interface DiagnosticsDeps {
  readonly scheduleTimeout: ScheduleTimeout;
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

/** What the inspector's call needs beyond the diagnostics deps: the app identity the model factory sends. */
export interface InspectDeps {
  readonly scheduleTimeout: ScheduleTimeout;
  readonly fetch: typeof fetch;
  readonly app: TransportDeps["app"];
}

export interface EmbedDeps {
  readonly scheduleTimeout: ScheduleTimeout;
  readonly log: InferenceLog;
  readonly transport: TransportDeps;
}

export interface ImageEmbedDeps {
  readonly fetch: typeof fetch;
  readonly normalize: NormalizeImageBytes;
}

export interface ImagesDeps {
  readonly transport: TransportDeps;
  readonly normalize: NormalizeImageBytes;
}

/** The slice of the runtime deps this backend closes over. */
export interface OpenAiCompatBackendDeps {
  readonly now: () => number;
  readonly random: () => number;
  readonly scheduleTimeout: InferenceDeps["scheduleTimeout"];
  readonly log: InferenceDeps["log"];
  readonly addSpanEvent?: AddSpanEvent | undefined;
  readonly fetch: typeof fetch;
  readonly captureWire?: InferenceDeps["captureWire"];
  readonly captureWireReply?: InferenceDeps["captureWireReply"];
  readonly app: InferenceDeps["app"];
  readonly imageToPng?: InferenceDeps["imageToPng"];
  /** Where the tokenize lookups persist, beside the endpoint facts. */
  readonly snapshotStore: InferenceDeps["snapshotStore"];
}

export interface OpenAiCompatBackend {
  readonly backend: ProviderBackend;
  /** The reachability probe the availability read consults for `auth: endpoint` rows (§4). */
  readonly reachability: ReachabilityProber;
  /** The per-(server, model, word) tokenize cache: the turn's word-keyed logit bias and the editor's read. */
  readonly tokens: TokenLexicon;
}

/** The transport-level deps a backend hands the factory: the egress-guarded fetch, the capture sink, the app
 *  identity OpenRouter attributes traffic to. */
export interface TransportDeps {
  readonly fetch: typeof fetch;
  readonly captureWire?: WireCaptureSink | undefined;
  /** Tap the reply bytes onto the capture entry too (§D2) — the process-tier opt-in, off by default. */
  readonly captureWireReply?: boolean | undefined;
  readonly app: { readonly name: string; readonly url: string };
}

/** Everything one call needs the hooks to know. `plan` is null on the non-chat surfaces (no re-attach). */
export interface ModelCall {
  readonly cachePolicy?: CachePolicy | undefined;
  readonly cacheMarkers?: ReadonlyMap<number, Record<string, unknown>> | undefined;
  readonly responseCache?: ResponseCacheControl | undefined;
  readonly responseCacheSettings?: ResponseCacheSettings | undefined;
  readonly translateResponse?: WrapFetchArgs["translateResponse"];
  readonly imageDetail?: ImageDetail | undefined;
  readonly connection: Resolved;
  readonly deps: TransportDeps;
  readonly label: string;
  readonly api: string;
  readonly chatId?: ChatId | undefined;
  readonly plan: WirePlan | null;
  readonly prefillAllowed: boolean;
  /** What body rule 5b tells the template's thinking switch; `undefined` leaves the server's default. */
  readonly templateThinking: boolean | undefined;
  /** What body rule 5c tells the template about replaying prior thinking; `undefined` sends nothing. */
  readonly templatePreserveReasoning: boolean | undefined;
  /** The effort the funnel resolved, for a route that spells effort in its own words rather than the V4 one (Ollama's
   *  native `think`, where `max` is not the OpenAI route's `xhigh`). */
  readonly reasoningEffort?: EffortLevel | undefined;
  /** Sees each native body as it goes out (after the user's body), so a turn records what was sent. */
  readonly onNativeBody?: ((body: Readonly<Record<string, unknown>>) => void) | undefined;
  /** Fold consecutive plain same-role rows into one message of parts (`body.ts` rule 10). */
  readonly foldSameRole: boolean;
  readonly replyImages: boolean;
  readonly warnings: ResolvedWarning[];
  /** Body-level fields the SDK does not model that this call must carry (the unmodelled sampler knobs, OR routing). */
  readonly extraBody?: Readonly<Record<string, unknown>> | undefined;
  /** The openrouter chat settings the SDK models at the MODEL level (ignored on the other transport). */
  readonly openRouterChat?: { readonly strict?: boolean | undefined; readonly parallelToolCalls?: boolean | undefined } | undefined;
  /** The preset's inline-reasoning tag pair; drives the `extractReasoningMiddleware` wrap (see `think-tags.ts`). */
  readonly reasoningTags?: ReasoningTags | undefined;
}

/** What `think` is spelled from: the effort the turn resolved, the levels the model's descriptor names (absent ⇒
 *  unstated; empty ⇒ on or off only), and whether body rule 5b switched the template's thinking on. */
export interface NativeThink {
  readonly effort?: EffortLevel | undefined;
  readonly levels?: readonly EffortLevel[] | undefined;
  readonly on?: boolean | undefined;
}

export interface ReachabilityDeps {
  readonly scheduleTimeout: ScheduleTimeout;
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

export interface ReachabilityProber {
  readonly probe: (target: ProbeTarget) => Promise<Reachability>;
  /** Whether the server says it is asleep right now. Never cached: a server is put to sleep from outside the app at
   *  any moment, and a sleeping vLLM queues a request without answering, so only a fresh read may send to it. A read
   *  that fails is `false` (the task then meets the server's own answer); a `signal` abort rejects. */
  readonly asleep: (target: SleepTarget, signal: AbortSignal | undefined) => Promise<boolean>;
  /** POST the row's wake path, then poll the sleep read until awake or the wake window closes. A `signal` abort
   *  rejects at once with an `aborted` error. */
  readonly wake: (target: SleepTarget, signal: AbortSignal | undefined) => Promise<boolean>;
  readonly invalidate: (baseUrl: string) => void;
}

export interface RerankDeps {
  readonly fetch: typeof fetch;
  readonly normalize: NormalizeImageBytes;
  readonly log: InferenceLog;
}

/** The preset's literal open/close tags (`reasoningParse.prefix`/`suffix`), as the turn request carries them. */
export interface ReasoningTags {
  readonly prefix: string;
  readonly suffix: string;
}

/** Where one connection's words are tokenized. */
export interface TokenTarget {
  readonly baseUrl: string;
  readonly model: string;
  readonly api: TokenizeApi;
  readonly secret: string | null;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly secrets: ProviderScrubSet;
}

export interface TokenLexicon {
  /** Each word's tokens, from the cache where held; every missing word is asked once, in parallel, and cached. */
  readonly lookup: (target: TokenTarget, words: readonly string[], signal?: AbortSignal) => Promise<readonly WordTokens[]>;
  /** Forget one server's lookups (or every server's), in memory and in the store. */
  readonly forget: (baseUrl: string | undefined) => Promise<void>;
}

export interface ProbeTarget {
  readonly baseUrl: string;
  readonly secret: string | null;
  readonly headers: Readonly<Record<string, string>> | undefined;
  readonly sleepPath: string | undefined;
}

/** A row whose folded features name the sleep pair. */
export interface SleepTarget extends ProbeTarget {
  readonly sleepPath: string;
  readonly wakePath: string;
}

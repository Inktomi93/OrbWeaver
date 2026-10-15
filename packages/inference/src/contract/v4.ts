import type {
  LanguageModelV4FinishReason,
  LanguageModelV4Prompt,
  LanguageModelV4Usage,
  SharedV4ProviderMetadata,
  SharedV4ProviderOptions,
  SharedV4Warning,
} from "@ai-sdk/provider";
import type { TextSignature } from "@orb/contracts/chat";
import type {
  CostDetails,
  EndpointFeatures,
  GenerationCapability,
  ProviderId,
  ResolvedWarning,
  ResponseCache,
  TokenDetails,
  TokenUsage,
  Wire,
} from "@orb/contracts/inference";
import type { EffortLevel } from "@orb/contracts/preset";
import type { ChatId, ModelId } from "@orb/kit/ids";
import type {
  ChatHistoryMessage,
  GeneratedImage,
  HistoryRole,
  ProviderScrubSet,
  RateLimitSnapshot,
  ReasoningContentPart,
  ResponseMap,
  ToolCallInput,
  WireCaptureSink,
} from "#contract";

/** The per-call context the wrapper closes over. Built PER CALL (a transport instance is cheap), so the
 *  capture and the shaping see this turn's connection, model and chat id. */
export interface WrapFetchArgs {
  readonly fetch: typeof fetch;
  readonly secrets: ProviderScrubSet;
  readonly label: string;
  readonly responseMap: ResponseMap | undefined;
  readonly reasoningKeys: readonly string[] | undefined;
  /** The openrouter transport's body shaper, and a native chat route's translation (`ollama-native.ts`); the
   *  openai-compatible transport shapes in `transformRequestBody`. */
  readonly shapeBody?: ((body: Record<string, unknown>) => Record<string, unknown>) | undefined;
  /** A native chat route's reply as the SDK reads it (`ollama-native.ts`), applied AFTER the reply tap so the
   *  capture holds the bytes the server sent, on a success and a failure alike. */
  readonly translateResponse?: ((res: Response) => Promise<Response>) | undefined;
  readonly capture?:
    | {
        readonly sink: WireCaptureSink;
        readonly chatId: ChatId | undefined;
        readonly api: string;
        readonly wire: Wire;
        readonly providerId: ProviderId;
        readonly model: string;
        /** Tap the RESPONSE BODY too (§D2/§D3). Off by default and independently gated: the request capture
         *  is the operator's prompt, while the reply is the model's prose, which the recorder's outcome arm
         *  deliberately never keeps. A caller that does not ask gets today's request-and-headers entry. */
        readonly reply: boolean;
      }
    | undefined;
}

/** One outbound media part the converter can carry on a USER row, or that `body.ts` must re-attach on an
 *  ASSISTANT row: the resolved URL/data-URI the chat domain produced, tagged by kind. */
export interface OutboundMedia {
  readonly kind: "image" | "video";
  readonly url: string;
}

/** The prompt plus everything the SDK converters cannot carry, indexed by WIRE-ARRAY position. */
export interface WirePlan {
  readonly prompt: LanguageModelV4Prompt;
  /** Wire index → the participant label the view-builder stamped on that row. */
  readonly names: ReadonlyMap<number, string>;
  /** Wire index → the media parts of an ASSISTANT row (dropped by both converters — re-attached by the hook). */
  readonly assistantMedia: ReadonlyMap<number, readonly OutboundMedia[]>;
  /** Wire index → the row's cache-breakpoint eligibility inputs (role + tool-exchange + token estimate source). */
  readonly rows: readonly PlanRow[];
  /** True when at least one history `tool-result` carried `isError` — the OpenAI-shaped wires have no slot. */
  readonly toolResultErrorDropped: boolean;
  /** True when the delivered array ends on an assistant row — the prefill pair's second condition. */
  readonly endsOnAssistant: boolean;
}

export interface BuildPromptArgs {
  readonly systemPrompt: { readonly static: string; readonly dynamic: string };
  readonly history: readonly ChatHistoryMessage[];
  /** The `providerOptions` key the wire's converter reads per message (`openaiCompatible` / `openrouter` /
   *  `anthropic`) and a builder for a row's options from its `wireMeta` — the anthropic wire forwards
   *  `clearAt`/`effort`; the openai-compat wires forward nothing. */
  readonly rowOptions?: ((row: ChatHistoryMessage) => SharedV4ProviderOptions | undefined) | undefined;
  /** Deliver the static prefix and the dynamic half as TWO leading system rows (an Anthropic route: the static
   *  row takes the cache breakpoint, the per-turn half stays outside it). Both stay in the system region, where
   *  the prompt order put them. */
  readonly splitSystem?: boolean | undefined;
  readonly includeAssistantMedia?: boolean | undefined;
}

/** A wire-reported cost WITH its breakdown — what `costProvenance: "measured"` records. */
export interface MeasuredCost {
  readonly costUsd: number;
  readonly costDetails: CostDetails;
}

export interface ResultContext {
  readonly responseCache?: ResponseCache | undefined;
  readonly model: ModelId;
  readonly providerId: string;
  readonly generation: GenerationCapability;
  readonly maxOutputTokens: number | undefined;
  readonly startedAt: number;
  readonly firstDeltaAt: number | undefined;
  readonly now: number;
  /** The wire-reported cost + breakdown, when the transport read one (OpenRouter's usage accounting). */
  readonly measuredCost: MeasuredCost | null;
  /** The row's shipped pricing — the `estimated` arm when nothing was measured. */
  readonly pricing: EndpointFeatures["pricing"];
  readonly generationId: string | null;
  /** What the wire carried for effort (`ChatResult.appliedEffort`) — read off the built options by the transport. */
  readonly appliedEffort: EffortLevel | null;
  /** The response's rate-limit headers, parsed by the transport (`backends/http/rate-limit-headers.ts`). */
  readonly rateLimit: RateLimitSnapshot | null;
  readonly warnings: readonly ResolvedWarning[];
  /** Boundary-normalized facts where the SDK loses reportedness (native GenerateContent). */
  readonly tokenUsage?: TokenUsage;
  readonly servedModel?: string | null;
  readonly tokenDetails?: TokenDetails | null;
}

export interface StreamDrain {
  readonly reply: string;
  readonly textSignatures: readonly TextSignature[];
  readonly reasoning: string;
  /** One entry per reasoning BLOCK the provider opened, in stream order, carrying that block's text and the
   *  wire-opaque provenance the next leg must replay (§A1). Empty when the wire surfaced no reasoning. */
  readonly reasoningParts: readonly ReasoningContentPart[];
  readonly toolCalls: readonly ToolCallInput[];
  readonly images: readonly GeneratedImage[];
  readonly finish: LanguageModelV4FinishReason;
  readonly usage: LanguageModelV4Usage | undefined;
  readonly providerMetadata: SharedV4ProviderMetadata | undefined;
  readonly responseId: string | undefined;
  readonly servedModel?: string | undefined;
  readonly warnings: readonly SharedV4Warning[];
}

export interface DrainCallbacks {
  readonly onPart?: (() => void) | undefined;
  readonly onRaw?: ((value: unknown) => void) | undefined;
  readonly onText?: ((text: string) => void) | undefined;
  readonly onReasoning?: ((text: string) => void) | undefined;
  readonly onImage?: ((image: GeneratedImage) => void) | undefined;
  readonly label: string;
}

/** One wire row as the cache placer sees it. `text` is the row's prose for the token estimate. */
export interface PlanRow {
  readonly role: HistoryRole;
  readonly toolExchange: boolean;
  readonly text: string;
}

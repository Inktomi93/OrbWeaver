import type { PromptCacheTtl } from "@orb/contracts/inference";

/** The openrouter routing-prefs slice this pin reads/writes. The full block is validated by the transport's
 *  own zod schema at the call site; this is the structural minimum the pin needs. */
export interface OpenRouterRouting {
  readonly order?: readonly string[] | undefined;
  readonly allow_fallbacks?: boolean | undefined;
  readonly [key: string]: unknown;
}

/** One turn's explicit-cache plan. ONE directive for every marker the turn places — tools, system block,
 *  history — which is how the TTL ORDER rule holds (a longer-TTL breakpoint must precede any shorter one, so a
 *  1h marker may never follow a 5m one): a turn carries a single ttl, so the order cannot be violated. */
export interface ExplicitCachePlan {
  readonly directive: AnthropicCacheDirective;
  /** Mark the static system block. */
  readonly cacheSystem: boolean;
  /** The history depth the placer resolves: max(the request's depth, the user's minimum); `undefined` ⇒ no
   *  history breakpoint (the request carried none). */
  readonly historyDepth: number | undefined;
}

/** One delivered wire row as the marker placer reads it: the depth axis inputs plus the prose it estimates. */
export interface CacheMarkerRow {
  readonly role: string;
  readonly toolExchange: boolean;
  readonly text: string;
}

/** What a turn's placement wrote: the wire-array patches (index → the message's `cacheControl` option) and the
 *  receipt counts the runners log. */
export interface CacheMarkerPlacement {
  readonly patches: Map<number, { readonly cacheControl: AnthropicCacheDirective }>;
  readonly historyDepths: readonly number[];
  readonly systemBlocks: number;
}

/** The width a returned vector must have, and whether the model's vectors may be cut down to it. */
export interface VectorFit {
  readonly dims: number;
  readonly mrl: boolean;
}

/** Normalize one outbound image-input buffer for a hosted wire (async: a GIF decode is I/O-bound). */
export type NormalizeImageBytes = (bytes: Uint8Array) => Promise<NormalizedImageBytes>;

/** The sharp seam this normalizer needs: decode → re-encode PNG (metadata stripped). Injected as a bare
 *  function so `backends/wire` never imports `infra/image` (a sibling infra module) — the strategy-isolation
 *  seam. Compose binds `imageAdapter.transform(bytes, { format: 'png' })`. */
export type ImageToPng = (bytes: Uint8Array) => Promise<Uint8Array>;

/** The typed facts the agent-sdk runner accumulates for the `claude-sub` arm. An interface rather than a bag
 *  because this producer has no SDK object to parse — the frames were already read field by field. */
export interface AgentSdkTurnFacts {
  readonly cacheCreation5mTokens: number | null;
  readonly cacheCreation1hTokens: number | null;
  readonly webSearchRequests: number;
  readonly warmSpareClaimed: boolean | null;
  readonly sdkSessionId: string | null;
  readonly servedModel: string | null;
  readonly durationApiMs: number | null;
  readonly numTurns: number;
  readonly outputCapReached: boolean;
}

export interface AnthropicCacheDirective {
  readonly type: typeof EPHEMERAL;
  /** Absent leaves the provider's default TTL. */
  readonly ttl?: PromptCacheTtl | undefined;
}

/** Normalized outbound image bytes + the mime to LABEL them with on the wire. */
export interface NormalizedImageBytes {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
}

export const EPHEMERAL = "ephemeral";

// Anthropic `cache_control` wire directive + the turn's cache PLAN + the provider-routing pin + the breakpoint
// placement primitive, shared by every HTTP runner talking to an Anthropic-backed endpoint. OpenRouter's
// `cache_control` is Anthropic-only, so we emit it iff the routed model is Anthropic, and pin the
// Anthropic provider (order + allow_fallbacks:false) so an unpinned model can't silently land on a
// non-caching endpoint. Measured wire facts (ttl "1h" honored, the fallback leak, the silent invalid-ttl
// drop) are recorded in `scripts/probes/openrouter/RESULTS.md`.
// `computeCacheBreakpointPlacements` is the pure positional core the openrouter runner maps onto its own
// wire dialect; its DEPTH axis (role switches, tool exchanges transparent) is specified at that function.
// `anthropicCachePlan` turns the connection's user settings (`Resolved.promptCache`, `@orb/contracts/inference`
// `prompt-cache.ts`) into the turn's plan, and `placeAnthropicCacheMarkers` is the ONE placer both hosted
// runners call with it.

import type { GenerationCapability, PromptCacheSettings } from "@orb/contracts/inference";
import { cacheMinTokensOf, PROMPT_CACHE_TTLS } from "@orb/contracts/inference";
import { estimateTokens } from "@orb/kit/tokens";
import { detectModelFamily } from "../../capability/families.ts";
import type { Resolved } from "../../contract/resolved.ts";
import type { ProviderLogger } from "./provider-log.ts";

/** The openrouter routing-prefs slice this pin reads/writes. The full block is validated by the transport's
 *  own zod schema at the call site; this is the structural minimum the pin needs. */
export interface OpenRouterRouting {
  readonly order?: readonly string[] | undefined;
  readonly allow_fallbacks?: boolean | undefined;
  readonly [key: string]: unknown;
}

const EPHEMERAL = "ephemeral";

// The two TTLs the Anthropic cache accepts (`PROMPT_CACHE_TTLS`, the contract's one tuple). The allowlist is
// load-bearing, not decoration: an UNKNOWN ttl is NOT an upstream error — OpenRouter answers 200 and silently
// drops the WHOLE `cache_control` block (measured `ttl:"9z"` → cacheWrite 0, cacheRead 0, ~10x the cost of a
// cached turn, no signal anywhere; `scripts/probes/openrouter/RESULTS.md`). The settings column is typed, not
// re-parsed on read, so this guard is what stands between a stored bad value and a silent 10x bill.

export interface AnthropicCacheDirective {
  readonly type: typeof EPHEMERAL;
  /** Absent = the provider default (5m). Only a PROMPT_CACHE_TTLS member ever reaches the wire. */
  readonly ttl?: (typeof PROMPT_CACHE_TTLS)[number] | undefined;
}

// The ONE seam a ttl becomes a wire directive by. An off-allowlist value is STRIPPED (leaving the bare
// ephemeral directive — the always-accepted 5m default) and logged loud rather than shipped: upstream gives
// no signal at all, so this warning IS the signal (D41 no-silent-degrade).
function anthropicCacheDirective(ttl: string, log?: ProviderLogger): AnthropicCacheDirective {
  const allowed = PROMPT_CACHE_TTLS.find((candidate) => candidate === ttl);
  if (allowed !== undefined) {
    return { type: EPHEMERAL, ttl: allowed };
  }
  log?.emit("warn", "provider.cache_ttl_rejected", { ttl, accepted: [...PROMPT_CACHE_TTLS], applied: null });
  return { type: EPHEMERAL };
}

// NEITHER TTL NEEDS A BETA HEADER, on either route: OpenRouter measured it on the cache-write price multiplier
// (findings §1), and Anthropic's docs spell a direct `{"type":"ephemeral","ttl":"1h"}` with no `anthropic-beta`
// entry. Do not add one; `tests/inference/backends/anthropic-messages/chat.test.ts` pins its absence. The ttl is
// the user's per connection (`PromptCacheSettings.ttl`); `SHIPPED_PROMPT_CACHE` keeps 1h.

/** One turn's explicit-cache plan. ONE directive for every marker the turn places — tools, system block,
 *  history — which is how the TTL ORDER rule holds (a longer-TTL breakpoint must precede any shorter one, so a
 *  1h marker may never follow a 5m one): a turn carries a single ttl, so the order cannot be violated. */
export interface AnthropicCachePlan {
  readonly directive: AnthropicCacheDirective;
  /** Mark the static system block. */
  readonly cacheSystem: boolean;
  /** The history depth the placer resolves: max(the request's depth, the user's minimum); `undefined` ⇒ no
   *  history breakpoint (the request carried none). */
  readonly historyDepth: number | undefined;
}

/** The connection's settings × the request's depth → the turn's plan; `null` ⇒ caching is OFF and the turn
 *  places no `cache_control` anywhere. THE DEPTH RULE (`prompt-cache.ts` header): the request's depth already
 *  carries max(SHAPE's volatile boundary, the admin floor `promptCacheMinDepth`), and the user's
 *  `historyDepth` is one more minimum on top of it, so the user can move the breakpoint deeper and never
 *  shallower than the admin floor. A request with no depth gets no history breakpoint whatever the setting. */
export function anthropicCachePlan(args: {
  readonly connection: Pick<Resolved, "promptCache">;
  readonly requestedDepth: number | undefined;
  readonly log?: ProviderLogger | undefined;
}): AnthropicCachePlan | null {
  const settings: PromptCacheSettings = args.connection.promptCache;
  if (!settings.enabled) {
    return null;
  }
  return {
    directive: anthropicCacheDirective(settings.ttl, args.log),
    cacheSystem: settings.cacheSystem,
    historyDepth: args.requestedDepth === undefined ? undefined : Math.max(args.requestedDepth, settings.historyDepth ?? 0),
  };
}

const ANTHROPIC_PROVIDER_NAME = "Anthropic";

/** Is this connection's model Anthropic's? Read off `factsModel` through the family detector — the id the
 *  capability fold used — so a floating OpenRouter alias of a Claude model routes like the Claude id it names,
 *  and a third-party fork (`some-org/claude-fork`) never receives Anthropic-only `cache_control`. */
export function isAnthropicModel(connection: Pick<Resolved, "factsModel">): boolean {
  return detectModelFamily(connection.factsModel) === "anthropic";
}

/** Does this connection's turn cache by explicit Anthropic block markers? The capability says explicit caching
 *  is worth placing (`turns.explicitPromptCache`) and the resolved model is Anthropic's. Chat's SHAPE keeps the
 *  stored rows of a same-role run apart on such a wire, and the openai-compat body folds them back into one
 *  message of parts (`openai-compat/body.ts` rule 10); both read this one answer. */
export function cachesByAnthropicMarkers(connection: Pick<Resolved, "factsModel">, generation: GenerationCapability): boolean {
  return generation.turns?.explicitPromptCache === true && isAnthropicModel(connection);
}

// A caller-supplied routing always wins; otherwise pin Anthropic (order + NO fallbacks) so cache_control is
// honored. `order` ALONE does not pin: `allow_fallbacks` defaults TRUE, and a probe caught a turn walking
// Anthropic → Bedrock → Azure → Google — every hop a non-Anthropic endpoint that ignores `cache_control`
// and re-bills the whole prefix (findings §2). This arm runs only when the user supplied NO routing, so it
// can never override a user's own fallback choice; the MODEL-level chain is the orthogonal `models[]` axis
// (`resolveFallbackModels`, which reads that same user routing) and is unaffected.
export function effectiveProviderRouting<T extends OpenRouterRouting>(
  connection: Pick<Resolved, "factsModel">,
  userRouting: T | undefined,
): T | OpenRouterRouting | undefined {
  if (userRouting !== undefined) {
    return userRouting;
  }
  return isAnthropicModel(connection) ? { order: [ANTHROPIC_PROVIDER_NAME], allow_fallbacks: false } : undefined;
}

// ── The breakpoint DEPTH axis ────────────────────────────────────────────────────────────────────────────
// The depth a runner is handed is CONVERSATIONAL, and it is counted in ROLE SWITCHES from the end — not in
// raw wire-array offsets (findings §5). Two facts force that unit:
//
//  1. The producer counts conversation. `chat/assembly/shape.ts:computeHistoryBreakpoint` derives the depth
//     over the delivered history with THIS file's counter (`cacheDepthCovering`) — a `tool` row cannot exist
//     there.
//  2. The wire array does not. Every `tool` row (and the assistant row carrying its calls) is appended AFTER
//     assembly by `chat/engine/pipeline.ts:runRecurseLoop`, which re-sends the SAME depth it was given. One
//     recursion depth of N parallel calls adds N+1 array rows but only TWO role groups — so an array-offset
//     placer slides forward by a number nobody upstream can predict, landing the breakpoint on bytes
//     GENERATED THIS TURN. Measured: still a cache READ (Anthropic's lookback finds the older entry) but a
//     wasted cache WRITE per depth, sized by the tool exchange (scripts/probes/openrouter/RESULTS.md, OR-5).
//
// So a within-turn tool exchange is TRANSPARENT to depth: it did not exist when the depth was computed, and
// counting it is the whole defect. This is a DELIBERATE deviation from SillyTavern's
// `cachingAtDepthForOpenRouterClaude` (`prompt-converters.js`), which has no tool rows in that flow and so
// never had this decision to make; the ST reference is a floor, not a golden.
//
// System rows DO consume no depth (ST parity, and a system injection is not a conversational turn); SHAPE counts
// with the same rule, so a system row it delivers moves neither number.
//
// ST's PREFILL skip is deliberately NOT adopted. ST anchors depth 0 on the last real conversational message;
// OUR depth 0 is the volatile tail whatever its role, because that is what `computeHistoryBreakpoint` counts
// (`stableCount = withTail.length - 1` — the tail is index 0 even when it is an `assistantPrefill` row).
// Re-anchoring here would shift every depth by one group against its own producer. The prefill is never a
// target anyway: `computeHistoryBreakpoint` returns `undefined` below depth 1, and the admin depth floor and
// the connection's `promptCache.historyDepth` can only raise the depth, so the placer is never asked for depth 0.

/** One delivered wire row as the breakpoint placer sees it. */
export interface CacheBreakpointRow {
  /** The wire role — the depth axis (`system` consumes none). */
  readonly role: string;
  /** Part of a WITHIN-TURN tool exchange (a `tool` result row, or the assistant row carrying its calls):
   *  transparent to conversational depth, because it postdates the depth's computation. */
  readonly toolExchange: boolean;
  /** This row's contribution to the cumulative prefix the `cacheMinTokens` floor is measured against. */
  readonly tokens: number;
}

/** A placed breakpoint: the conversational DEPTH it satisfies, and the wire-array INDEX that depth resolved
 *  to. The two are equal only on a tool-free, system-free, fully role-alternating history. */
export interface CacheBreakpointPlacement {
  readonly depth: number;
  readonly index: number;
}

const TOOL_DEPTH_TRANSPARENT_ROLE = "system";

/** The wire-array index of the NEWEST row at conversational depth `wanted`, or undefined when the history
 *  is not that deep. Depth 0 is the newest role group; each role SWITCH walking backwards opens the next. The
 *  ONE counter of the depth axis: SHAPE (`chat/assembly/shape.ts`) computes the depth it hands the runner with
 *  it, and the placer below resolves that depth with it, so the two cannot count differently. */
export function rowIndexAtCacheDepth(rows: readonly { readonly role: string; readonly toolExchange?: boolean }[], wanted: number): number | undefined {
  let depth = 0;
  let previousRole = "";
  let found: number | undefined;
  for (let i = rows.length - 1; i >= 0 && found === undefined; i -= 1) {
    const row = rows[i];
    if (row === undefined || row.toolExchange === true || row.role === TOOL_DEPTH_TRANSPARENT_ROLE) {
      continue;
    }
    if (row.role !== previousRole) {
      if (depth === wanted) {
        found = i;
        continue;
      }
      depth += 1;
      previousRole = row.role;
    }
  }
  return found;
}

/** The shallowest depth whose newest row sits at or before `index`: the depth that pins row `index` itself when
 *  it ends its role group, else the nearest group that ends above it. Undefined when no depth does (a negative
 *  `index`, or a history too short). */
export function cacheDepthCovering(rows: readonly { readonly role: string; readonly toolExchange?: boolean }[], index: number): number | undefined {
  let covering: number | undefined;
  let at: number | undefined = index < 0 ? undefined : rows.length;
  for (let depth = 0; at !== undefined && covering === undefined; depth += 1) {
    at = rowIndexAtCacheDepth(rows, depth);
    if (at !== undefined && at <= index) {
      covering = depth;
    }
  }
  return covering;
}

// Returns the pair of placements at depths `depth` and `depth+2` whose cumulative prefix clears the
// per-model cacheMinTokens floor. The deeper one keeps a cache hit inside Anthropic's 20-block lookback
// window that a single breakpoint drops on a long conversation. Drops the deeper placement when it runs off
// the front or is below the floor; drops both when even `depth` is below the floor. A REQUESTED depth the
// conversation cannot reach places nothing at all — that one is loud (`provider.cache_depth_unreachable`).
export function computeCacheBreakpointPlacements(args: {
  readonly rows: readonly CacheBreakpointRow[];
  readonly systemStaticTokens: number;
  readonly depthFromEnd: number;
  readonly cacheMinTokens: number;
  /** The transport's `provider.*` sink for the one loud arm below; absent ⇒ silent (a pure placement test). */
  readonly log?: ProviderLogger | undefined;
}): readonly CacheBreakpointPlacement[] {
  const { rows, systemStaticTokens, depthFromEnd, cacheMinTokens } = args;
  const placed: CacheBreakpointPlacement[] = [];
  for (const depth of [depthFromEnd, depthFromEnd + 2]) {
    const index = rowIndexAtCacheDepth(rows, depth);
    if (index === undefined) {
      // The REQUESTED depth (never the deeper leg, which runs off the front on every short-but-cacheable
      // room and would make this line noise) is deeper than the conversation: nothing is placed, so caching
      // is OFF for this turn. The admin `promptCacheMinDepth` FLOOR and the connection's own
      // `promptCache.historyDepth` are the realistic producers — each can only push the breakpoint deeper,
      // and "deeper than the history" means off, which a user who raised the knob to cache HARDER has no
      // other way to learn (D41 no-silent-degrade; the `anthropicCacheDirective`
      // precedent above).
      if (depth === depthFromEnd) {
        args.log?.emit("warn", "provider.cache_depth_unreachable", {
          depth,
          conversationalRows: rows.filter((row) => !row.toolExchange && row.role !== TOOL_DEPTH_TRANSPARENT_ROLE).length,
          applied: null,
        });
      }
      continue;
    }
    let prefixTokens = systemStaticTokens;
    for (let i = 0; i <= index; i += 1) {
      prefixTokens += rows[i]?.tokens ?? 0;
    }
    if (prefixTokens >= cacheMinTokens) {
      placed.push({ depth, index });
    }
  }
  return placed;
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

const SYSTEM_ROLE = "system";
const NO_CACHE_MARKERS: CacheMarkerPlacement = { patches: new Map(), historyDepths: [], systemBlocks: 0 };

/** THE ONE message-level placer both hosted runners call (anthropic-messages direct, openai-compat on an
 *  OpenRouter-Anthropic route): the static system block when the plan caches it and the plan's first row IS that
 *  block, then the history pair at the plan's depth when the capability says `explicitPromptCache`. Every patch
 *  carries the plan's one directive. A `null` plan (caching off) places nothing. */
export function placeAnthropicCacheMarkers(args: {
  readonly plan: AnthropicCachePlan | null;
  readonly rows: readonly CacheMarkerRow[];
  /** The static system half, trimmed — the cached prefix's first bytes and the floor's head start. */
  readonly staticSystem: string;
  readonly generation: GenerationCapability;
  readonly log?: ProviderLogger | undefined;
}): CacheMarkerPlacement {
  const { plan, rows, staticSystem, generation } = args;
  if (plan === null) {
    return NO_CACHE_MARKERS;
  }
  const patches = new Map<number, { readonly cacheControl: AnthropicCacheDirective }>();
  let systemBlocks = 0;
  if (plan.cacheSystem && staticSystem.length > 0 && rows[0]?.role === SYSTEM_ROLE) {
    patches.set(0, { cacheControl: { ...plan.directive } });
    systemBlocks = 1;
  }
  const historyDepths: number[] = [];
  if (plan.historyDepth !== undefined && generation.turns?.explicitPromptCache === true) {
    const placements = computeCacheBreakpointPlacements({
      rows: rows.map((row) => ({ role: row.role, toolExchange: row.toolExchange, tokens: estimateTokens(row.text) })),
      systemStaticTokens: estimateTokens(staticSystem),
      depthFromEnd: plan.historyDepth,
      cacheMinTokens: cacheMinTokensOf(generation),
      log: args.log,
    });
    for (const { index, depth } of placements) {
      patches.set(index, { cacheControl: { ...plan.directive } });
      historyDepths.push(depth);
    }
  }
  return { patches, historyDepths, systemBlocks };
}

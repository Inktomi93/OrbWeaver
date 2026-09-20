// Anthropic `cache_control` wire constants + the provider-routing pin + the breakpoint placement
// primitive, shared by every HTTP runner talking to an Anthropic-backed endpoint. OpenRouter's
// `cache_control` is Anthropic-only, so we emit it iff the routed model is Anthropic, and pin the
// Anthropic provider (order + allow_fallbacks:false) so an unpinned model can't silently land on a
// non-caching endpoint. Measured wire facts (ttl "1h" honored, the fallback leak, the silent invalid-ttl
// drop) are recorded in docs/history/design/openrouter-provider-findings.md §1–§3.
// `computeCacheBreakpointPlacements` is the pure positional core the openrouter runner maps onto its own
// wire dialect; its DEPTH axis (role switches, tool exchanges transparent) is specified at that function.

import type { ProviderLogger } from "./provider-log.ts";

/** The openrouter routing-prefs slice this pin reads/writes. The full block is validated by the transport's
 *  own zod schema at the call site; this is the structural minimum the pin needs. */
export interface OpenRouterRouting {
  readonly order?: readonly string[] | undefined;
  readonly allow_fallbacks?: boolean | undefined;
  readonly [key: string]: unknown;
}

const EPHEMERAL = "ephemeral";

// The two TTLs the Anthropic cache accepts. The allowlist is load-bearing, not decoration: an UNKNOWN ttl
// is NOT an upstream error — OpenRouter answers 200 and silently drops the WHOLE `cache_control` block
// (measured `ttl:"9z"` → cacheWrite 0, cacheRead 0, ~10x the cost of a cached turn, no signal anywhere;
// docs/history/design/openrouter-provider-findings.md §3). Nothing else stands between a typo and a silent 10x bill.
export const CACHE_TTLS = ["5m", "1h"] as const;
// Module-local by design: infra is not a type home (`no-inline-types`), and no consumer outside this file
// needs to NAME the union — the exported tuple + the directive interface carry it.
type CacheTtl = (typeof CACHE_TTLS)[number];

export interface AnthropicCacheDirective {
  readonly type: typeof EPHEMERAL;
  /** Absent = the provider default (5m). Only a CACHE_TTLS member ever reaches the wire. */
  readonly ttl?: CacheTtl | undefined;
}

// The ONE seam a ttl becomes a wire directive by. An off-allowlist value is STRIPPED (leaving the bare
// ephemeral directive — the always-accepted 5m default) and logged loud rather than shipped: upstream gives
// no signal at all, so this warning IS the signal (D41 no-silent-degrade).
export function anthropicCacheDirective(ttl: string, log?: ProviderLogger): AnthropicCacheDirective {
  const allowed = CACHE_TTLS.find((candidate) => candidate === ttl);
  if (allowed !== undefined) {
    return { type: EPHEMERAL, ttl: allowed };
  }
  log?.emit("warn", "provider.cache_ttl_rejected", { ttl, accepted: [...CACHE_TTLS], applied: null });
  return { type: EPHEMERAL };
}

// 1h IS honored on the OpenRouter wire with NO `anthropic-beta` header — measured on the cache-write price
// multiplier (5m writes bill 1.25x base input, 1h writes 2.0x; findings §1). The beta header is an
// Anthropic-DIRECT requirement that OpenRouter handles for us, so the old "a 1h variant needs a beta header
// we don't send" note was simply wrong. Economics on a ~10k stable prefix: a 1h write costs +$0.0198 over
// base and saves $0.0228 the first time a session goes quiet for more than five minutes — which, for RP
// think-gaps, is essentially always. A direct-Anthropic backend must NOT reuse this constant without
// sending the beta header itself. Typed `CacheTtl` (compile-time seal) AND built through the guard, so the
// validated path is the only path a ttl reaches the wire by.
const SHIPPED_CACHE_TTL: CacheTtl = "1h";
export const ANTHROPIC_CACHE_1H: AnthropicCacheDirective = anthropicCacheDirective(SHIPPED_CACHE_TTL);

export interface CacheControlTextBlock {
  readonly type: "text";
  readonly text: string;
  readonly cacheControl: AnthropicCacheDirective;
}

// Matches the bare Anthropic id and the OpenRouter `anthropic/claude-…` form ONLY — a third-party fork
// (`some-org/claude-fork`) must never receive Anthropic-only cache_control. Mirrors connection's
// `detectModelFamily` anchor; both must keep this exact shape.
const ANTHROPIC_MODEL_ANCHOR = /^(?:anthropic\/)?claude[-/]/i;

const ANTHROPIC_PROVIDER_NAME = "Anthropic";

export function isAnthropicModel(model: string): boolean {
  return ANTHROPIC_MODEL_ANCHOR.test(model);
}

// A caller-supplied routing always wins; otherwise pin Anthropic (order + NO fallbacks) so cache_control is
// honored. `order` ALONE does not pin: `allow_fallbacks` defaults TRUE, and a probe caught a turn walking
// Anthropic → Bedrock → Azure → Google — every hop a non-Anthropic endpoint that ignores `cache_control`
// and re-bills the whole prefix (findings §2). This arm runs only when the user supplied NO routing, so it
// can never override a user's own fallback choice; the MODEL-level chain is the orthogonal `models[]` axis
// (`resolveFallbackModels`, which reads that same user routing) and is unaffected.
export function effectiveProviderRouting<T extends OpenRouterRouting>(model: string, userRouting: T | undefined): T | OpenRouterRouting | undefined {
  if (userRouting !== undefined) {
    return userRouting;
  }
  return isAnthropicModel(model) ? { order: [ANTHROPIC_PROVIDER_NAME], allow_fallbacks: false } : undefined;
}

export function cacheControlBlock(text: string): CacheControlTextBlock {
  return { type: "text", text, cacheControl: ANTHROPIC_CACHE_1H };
}

// ── The breakpoint DEPTH axis ────────────────────────────────────────────────────────────────────────────
// The depth a runner is handed is CONVERSATIONAL, and it is counted in ROLE SWITCHES from the end — not in
// raw wire-array offsets (findings §5). Two facts force that unit:
//
//  1. The producer counts conversation. `chat/assembly/shape.ts:computeHistoryBreakpoint` derives the depth
//     over CANON rows, whose role axis is a two-arm `user|assistant` union — a `tool` row cannot exist there.
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
// System rows DO consume no depth (ST parity, and a system injection is not a conversational turn) — skipping
// them can only move a breakpoint DEEPER into the already-stable prefix, never shallower, so it is safe
// against `shape.ts`'s array-counted number by monotonicity.
//
// ST's PREFILL skip is deliberately NOT adopted. ST anchors depth 0 on the last real conversational message;
// OUR depth 0 is the volatile tail whatever its role, because that is what `computeHistoryBreakpoint` counts
// (`stableCount = withTail.length - 1` — the tail is index 0 even when it is an `assistantPrefill` row).
// Re-anchoring here would shift every depth by one group against its own producer. The prefill is never a
// target anyway: `computeHistoryBreakpoint` returns `undefined` below offset 1, and the admin depth knob can
// only raise the depth, so the placer is never asked for depth 0.

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
 *  is not that deep. Depth 0 is the newest role group; each role SWITCH walking backwards opens the next. */
function indexAtDepth(rows: readonly CacheBreakpointRow[], wanted: number): number | undefined {
  let depth = 0;
  let previousRole = "";
  let found: number | undefined;
  for (let i = rows.length - 1; i >= 0 && found === undefined; i -= 1) {
    const row = rows[i];
    if (row === undefined || row.toolExchange || row.role === TOOL_DEPTH_TRANSPARENT_ROLE) {
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
    const index = indexAtDepth(rows, depth);
    if (index === undefined) {
      // The REQUESTED depth (never the deeper leg, which runs off the front on every short-but-cacheable
      // room and would make this line noise) is deeper than the conversation: nothing is placed, so caching
      // is OFF for this turn. The admin `promptCacheMinDepth` FLOOR is the realistic producer — it can only
      // push the breakpoint deeper, and "deeper than the history" means off, which an admin who raised the
      // knob to cache HARDER has no other way to learn (D41 no-silent-degrade; the `anthropicCacheDirective`
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

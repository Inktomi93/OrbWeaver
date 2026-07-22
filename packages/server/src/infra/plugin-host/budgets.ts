// The plugin-host DoS budget numbers — the ONE home for every limit (03 §3). Named constants, never
// scattered literals, so the "budget-number review against soak data" (04 P6) touches one file. Every
// value is a LEAN: its resolution criterion is measured abuse or measured legitimate need, whichever
// arrives first. P1 spike PROVES the enforcement mechanism for each; the exact numbers stay tunable.
//
// Two clocks, do NOT conflate (P1 finding — see README §Sharp edges): the DoS deadline below is driven by
// a MONOTONIC real clock (`performance.now()` host-side, in the interrupt handler). The guest-VISIBLE
// clock is the injected deterministic seam (`host.clock.nowEpochMs`). A frozen test clock (or a system
// time jump) must never be able to disable the DoS kill — so the interrupt reads real monotonic time, the
// guest reads the seam.

/** Per-invocation guest CPU budget (installed plugin handler/tool/transform). Enforced by the QuickJS
 *  interrupt handler comparing REAL wall-time against the invocation deadline (03 §3). */
export const PLUGIN_INVOCATION_CPU_MS = 1000;

/** Inline snippet total wall-clock run (03 §1) — the whole snippet, not per-call. */
export const SNIPPET_WALL_MS = 5000;

/** WASM memory cap per QuickJSContext (setMemoryLimit), in bytes (= 32 MiB). Over-limit allocation fails
 *  guest-side and is CONTAINED to the instance — the property QuickJS-ng-WASM was chosen for (README
 *  rejected `isolated-vm` precisely because V8 cannot unwind OOM). */
export const PLUGIN_MEMORY_LIMIT_BYTES = 33_554_432;

/** Explicit guest stack ceiling (bytes) — MANDATORY, not cosmetic. P1 FINDING: QuickJS-ng's DEFAULT
 *  stack-overflow detection does NOT reliably catch deep recursion — a recursive guest blows the real
 *  WASM/native stack, which surfaces as a HOST-side `RangeError` (escaping the sandbox) AND leaves the
 *  runtime un-disposable (`ctx.dispose()` aborts the WASM module: `list_empty(&rt->gc_obj_list)` assertion
 *  in JS_FreeRuntime). Setting an explicit, conservative `setMaxStackSize` makes QuickJS's SOFT check fire
 *  first → a proper contained guest `RangeError`, runtime stays cleanly disposable. 256 KiB is a LEAN:
 *  ample for legitimate nesting, well below the WASM stack. Verified: 256 KiB → clean; default/512 KiB →
 *  host-crash + dispose-abort. */
export const GUEST_MAX_STACK_BYTES = 262_144;

/** Host-function self-bound deadline. The interrupt handler does NOT preempt a blocking HOST call — only
 *  guest bytecode — so every host fn self-bounds (03 §3 "reentrancy footgun"). `boundHostFn` races the
 *  fn against this real-time deadline; an unbounded host fn cannot be written by omission. */
export const HOST_FN_DEADLINE_MS = 5000;

/** Max serialized (JSON) byte size of any host-function result crossing back into the guest (= 1 MiB). */
export const HOST_FN_RESULT_CAP_BYTES = 1_048_576;

/** `net.fetch` response-body byte cap (the host-v1 "1 MiB response cap"). Set just UNDER
 *  `HOST_FN_RESULT_CAP_BYTES` on purpose: net.fetch returns `{status, body}`, and that wrapper is ALSO
 *  bounded by the shared result cap at the marshalling boundary — so a body sized right at 1 MiB plus the
 *  JSON wrapper would trip the result-cap reject. The body cap sits below the result cap so a legitimate
 *  near-max body still crosses; a pathological (all-escaped) body that inflates past the result cap surfaces
 *  as a CONTAINED result-cap refusal (never a leak). LEAN — tune against measured plugin API sizes. */
export const PLUGIN_NET_MAX_BYTES = 1_000_000;

/** Concurrent pending host calls per invocation; call N+1 rejects (the bridge back-pressure). */
export const HOST_CALLS_IN_FLIGHT_MAX = 32;

/** Max serialized (JSON) byte size of a guest-INBOUND resident-handler args payload (the inbound mirror of
 *  `HOST_FN_RESULT_CAP_BYTES`). A resident handler is invoked with a JSON `argsJson` (tool args, a delivered
 *  `TriggerFact`, a transform draft+env). TF-1 facts have NO content cap by construction, so a huge fact
 *  delivered as args would otherwise bloat the guest heap / marshalling — this is the coarse DoS backstop at
 *  the guest-inbound seam (an oversized payload fails CONTAINED, `ok:false`, before it reaches the guest).
 *  Distinct from — and above — the DOMAIN's field-aware cap: the event-delivery closure truncates
 *  `fact.message.content` to a sane (16 KiB-class) limit while keeping the fact VALID JSON; infra can only
 *  bound the whole opaque string (blind truncation would corrupt the JSON). 1 MiB = symmetric with the
 *  outbound result cap; it only ever fires on gross abuse, never a domain-capped fact. */
export const PLUGIN_INVOKE_ARGS_MAX_BYTES = 1_048_576;

/** `host.log` volume per invocation, ring-buffered per plugin (256 lines / 16 KiB). */
export const LOG_LINES_PER_INVOCATION = 256;
export const LOG_BYTES_PER_INVOCATION = 16_384;

/** Per-resident-instance invoke FIFO depth (03 §2). A resident sandbox is a SINGLE shared QuickJSContext, so
 *  every invoke (tool / D50 transform apply / event-subscriber delivery) SERIALIZES per instance — the queue is
 *  homed at `port.invoke` (the shared-scope concurrency belt). This bounds the pending (queued + running)
 *  invokes: the N+1 concurrent invoke is REFUSED with a contained typed error (a DoS backstop — a hostile flood
 *  of concurrent deliveries must not unbounded-queue and pin the sandbox forever). The fire-and-forget event
 *  `deliver` swallows the refusal (self-safe fan-out); a tool/transform invoke surfaces it as `threw`. Each
 *  queued item still rides the per-invocation `cpuDeadlineMs`, so a hung guest deadlines and the queue advances. */
export const EVENT_QUEUE_DEPTH = 16;

// NOTE: the consecutive-crash auto-disable threshold (03 §4) is DOMAIN lifecycle policy, not a sandbox runtime
// budget — it lives in `domain/plugin/activation/crash-policy.ts` (`PLUGIN_CRASH_DISABLE_THRESHOLD`). It is NOT
// re-minted here (the P1 scaffold's `CRASH_DISABLE_THRESHOLD` never found a consumer; the cake bans the domain
// from value-importing infra, so its one home is the domain that enforces it).

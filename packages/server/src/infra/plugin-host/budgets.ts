// The plugin-host DoS budget numbers — the ONE home for every limit. Named constants, never
// scattered literals, so the budget-number review against soak data touches one file. Every
// value is a LEAN: its resolution criterion is measured abuse or measured legitimate need, whichever
// arrives first. The spike PROVES the enforcement mechanism for each; the exact numbers stay tunable.
//
// Two clocks, do NOT conflate (see README's Sharp Edges section): the DoS deadline below is driven by
// a MONOTONIC real clock (`performance.now()` host-side, in the interrupt handler). The guest-VISIBLE
// clock is the injected deterministic seam (`host.clock.nowEpochMs`). A frozen test clock (or a system
// time jump) must never be able to disable the DoS kill — so the interrupt reads real monotonic time, the
// guest reads the seam.

import type { PluginBudgets } from "@orb/contracts/plugin";
import { PLUGIN_CONTINUATION_WINDOW_MS } from "@orb/contracts/plugin";
import { MS_PER_MINUTE, MS_PER_SECOND } from "@orb/kit/time";
import type { PluginCommandOperation } from "./contract/process-protocol.ts";
import { PLUGIN_BROKER_MESSAGE_MAX_BYTES, PLUGIN_BROKER_SYNC_TIMEOUT_MS } from "./process-protocol.ts";

const BYTES_PER_MEBIBYTE = 1_048_576;
const WASM_INITIAL_MEBIBYTES = 16;
const WASM_MAX_MEBIBYTES = 48;

/** A resident instance's guest CPU account per invocation (installed plugin handler/tool/transform), and for its
 *  work outside invocations between two of them, spent by running spans of guest execution and never by awaits. Enforced by the QuickJS interrupt handler and the
 *  host-call entry check, comparing REAL monotonic time against the open window (`cpu-guard.ts`, D346). */
export const PLUGIN_INVOCATION_CPU_MS = 1000;

/** An inline snippet's guest CPU account — the whole snippet, not per call. Its wall is this plus
 *  {@link HOST_FN_DEADLINE_MS}. */
export const SNIPPET_WALL_MS = 5000;

/** How far a Worker's guest work may run past its CPU budget before its broker terminates that Worker alone (D347):
 *  past one span's window, or past the budget of the command it is serving, summed over every span. One native call or
 *  one interrupt poll period has a length the guest picks, so the window cannot end it; this does. It covers the
 *  longest honest overrun, a synchronous seam call that waits on the parent inside a span, plus one invocation budget. */
export const PLUGIN_WORKER_OVERRUN_MAX_MS = PLUGIN_BROKER_SYNC_TIMEOUT_MS + PLUGIN_INVOCATION_CPU_MS;

/** How often the broker reads its Workers' span slots: a stuck Worker is terminated at most this much late. */
export const PLUGIN_WORKER_SPAN_CHECK_MS = 250;

/** The parent's backstop for one command, timed from when the command becomes its runtime's oldest outstanding one, so
 *  the commands queued ahead of it are never charged to it. Past it the parent fails that command alone, as its
 *  plugin's strike, and asks the broker to end that runtime; it never ends the broker (D347). Every kind's worst case,
 *  settlement walls included, ends before it: `tests/server/infra/plugin-host/broker-bounds.test.ts`. */
export const PLUGIN_COMMAND_TIMEOUT_MS = {
  create: 40_000,
  invoke: 45_000,
  snippet: 40_000,
  dispose: 30_000,
} as const satisfies Record<PluginCommandOperation, number>;

/** How often the broker's main thread reports to its watchdog, whatever any command or Worker is doing; the watchdog
 *  judges the broker on the same period. */
export const PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS = 25;
// The longest heartbeat gap measured from a healthy broker, at send and at arrival, through the plugin-host floor at
// load up to 40 on 24 cores; D347 records the run.
const PLUGIN_BROKER_HEARTBEAT_WORST_GAP_MS = 125;
// The margin over that gap, for a slower or busier host than the one measured.
const PLUGIN_BROKER_HEARTBEAT_GAP_FACTOR = 8;
/** Consecutive intervals in which the watchdog, its pipe drained, finds nothing new from the broker before it ends the
 *  broker as unresponsive (D347): the measured worst gap times the factor, in intervals, so detection takes 1 s. */
export const PLUGIN_BROKER_HEARTBEAT_MISSES_MAX = Math.ceil(
  (PLUGIN_BROKER_HEARTBEAT_GAP_FACTOR * PLUGIN_BROKER_HEARTBEAT_WORST_GAP_MS) / PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS,
);
/** How long a broker that stops answering keeps serving before its watchdog ends it. */
export const PLUGIN_BROKER_LIVENESS_BOUND_MS = PLUGIN_BROKER_HEARTBEAT_MISSES_MAX * PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS;
/** How long the app waits for its watchdog to exit after closing their channel before it ends the watchdog (D347). A
 *  broker stops beating once its own channel closes, so a working watchdog has ended it within the liveness bound;
 *  the second is the watchdog's own exit. */
export const PLUGIN_WATCHDOG_STOP_GRACE_MS = PLUGIN_BROKER_LIVENESS_BOUND_MS + MS_PER_SECOND;

/** How long the host remembers a broker loss: losses further apart than this never add up (D347). */
export const PLUGIN_BROKER_LOSS_WINDOW_MS = 10 * MS_PER_MINUTE;
/** The broker losses inside the window the host recovers from; one more stops it until the server restarts (D347). */
export const PLUGIN_BROKER_LOSSES_MAX = 4;
// The hold after the second loss in the window; each further loss doubles it.
const PLUGIN_BROKER_RESTART_HOLD_BASE_MS = 2 * MS_PER_SECOND;

/** How long the host refuses plugin calls after the `loss`-th broker loss inside the window: none after the first, so a
 *  lone loss recovers at once, then a hold that doubles with each further loss (D347). */
export function pluginBrokerRestartHoldMs(loss: number): number {
  return loss <= 1 ? 0 : PLUGIN_BROKER_RESTART_HOLD_BASE_MS * 2 ** (loss - 2);
}

/** The guest CPU one command may spend across all its spans, the spans of guest work that run while it waits its turn
 *  included: the activation and the work outside it for `create`, one invocation for `invoke`, the snippet's account for
 *  `snippet`, and the work outside an invocation a `dispose` waits behind. The broker ends the Worker once the spans
 *  summed since the command reached it pass this plus {@link PLUGIN_WORKER_OVERRUN_MAX_MS} (D347). */
export const PLUGIN_COMMAND_CPU_BUDGET_MS = {
  create: 2 * PLUGIN_INVOCATION_CPU_MS,
  invoke: 2 * PLUGIN_INVOCATION_CPU_MS,
  snippet: SNIPPET_WALL_MS,
  dispose: PLUGIN_INVOCATION_CPU_MS,
} as const satisfies Record<PluginCommandOperation, number>;

/** QuickJS's LIVE guest-allocation accounting ceiling (= 32 MiB). This is NOT a WebAssembly or process RSS
 *  ceiling: the published Emscripten build may grow its allocator's linear-memory high-water mark while live
 *  QuickJS allocations remain below this number. {@link PLUGIN_WASM_MEMORY_MAX_BYTES} is the independent
 *  per-Worker linear-memory wall; the broker watchdog is the aggregate host backstop. */
export const PLUGIN_MEMORY_LIMIT_BYTES = 33_554_432;

/** The prebuilt QuickJS-ng module declares a 256-page imported-memory minimum. Probe receipt
 *  `/tmp/orb-0238-capped-wasm-probe.log`: 1–15 MiB fail instantiation, 16 MiB boots the shipped Draft Polish
 *  plugin. A fresh Worker starts here and grows only under actual guest demand. */
export const PLUGIN_WASM_MEMORY_INITIAL_BYTES = WASM_INITIAL_MEBIBYTES * BYTES_PER_MEBIBYTE;

/** Hard linear-memory maximum for ONE recyclable QuickJS Worker. The supported `newVariant({wasmMemory})`
 *  hook enforces it in WebAssembly itself. Probe receipt: a 4 MiB guest allocation bomb fills this whole
 *  48 MiB (confirming `setMemoryLimit` alone is not the wall) and then returns a contained OOM; a 31 MiB
 *  typed allocation still succeeds under the normal 32 MiB guest-accounting cap. Worker termination returns
 *  the high-water allocation to the OS. This does not bound Node/FFI memory; the broker RSS watchdog monitors
 *  and terminates the isolated process when its aggregate crosses the configured ceiling. */
export const PLUGIN_WASM_MEMORY_MAX_BYTES = WASM_MAX_MEBIBYTES * BYTES_PER_MEBIBYTE;

/** Direct-adapter admission used by `createLocalPluginHost` tests and non-broker embeddings. The production
 *  broker never treats this as an enabled-plugin or warm-Worker ceiling; its measured configured pool owns
 *  that bound. A broker Worker still receives only one logical guest from `worker-runtime.ts`. */
export const PLUGIN_LOCAL_RESIDENT_RUNTIME_MAX = 16;

/** Process-wide concurrent snippet REQUESTS. This is a queue/workload guard, not a second physical capacity
 *  pool: snippets and warm residents both acquire the broker's configured Worker pool, so this number cannot
 *  multiply past the aggregate memory envelope. It remains separate from enabled logical count because an
 *  enabled sleeping plugin consumes no Worker and must not permanently starve the console.
 *
 *  8 is a LEAN with its resolution criterion: it is two members at their full per-user allowance of 4 at the
 *  same instant, which is the concurrency a personal REPL actually produces; raise it when real multi-member
 *  load refuses an honest snippet, lower it if measured abuse arrives first. The monitored RSS ceiling and
 *  Worker maximum must be derived together from full-Worker measurements; the 48 MiB WASM ceiling omits larger
 *  Node/FFI cost and cannot size the process by itself. */
export const PLUGIN_SNIPPET_RUNTIME_MAX = 8;

/** Explicit guest stack ceiling (bytes) — MANDATORY, not cosmetic. FINDING: QuickJS-ng's DEFAULT
 *  stack-overflow detection does NOT reliably catch deep recursion — a recursive guest blows the real
 *  WASM/native stack, which surfaces as a HOST-side `RangeError` (escaping the sandbox) AND leaves the
 *  runtime un-disposable (`ctx.dispose()` aborts the WASM module: `list_empty(&rt->gc_obj_list)` assertion
 *  in JS_FreeRuntime). Setting an explicit, conservative `setMaxStackSize` makes QuickJS's SOFT check fire
 *  first → a proper contained guest `RangeError`, runtime stays cleanly disposable. 256 KiB is a LEAN:
 *  ample for legitimate nesting, well below the WASM stack. Verified: 256 KiB → clean; default/512 KiB →
 *  host-crash + dispose-abort. */
export const GUEST_MAX_STACK_BYTES = 262_144;

/** Host-function self-bound deadline. The interrupt handler does NOT preempt a blocking HOST call — only
 *  guest bytecode — so every host fn self-bounds (the "reentrancy footgun"). `attachAsync` races every
 *  membrane call against this real-time deadline; an unbounded host fn cannot be written by omission.
 *
 *  IT IS ALSO THE INVOCATION SETTLEMENT GRACE (`Sandbox.runToSettlement`, the `PluginInvocationEnded`
 *  posture of 03 §3): the settlement wall is `cpuDeadlineMs + this`. ONE constant, not two names for one
 *  value — the equality is the POINT, not a coincidence. The interrupt handler preempts guest BYTECODE
 *  ONLY, so a guest that stops executing bytecode (`new Promise(() => {})`, or an `await` on a host call)
 *  is never interrupted and would hang FOREVER: the context is stranded, the FIFO wedged, and the 3-strike
 *  crash policy never sees it (it only counts a REJECTION). The grace must EXCEED the longest a LEGITIMATE
 *  invocation can sit blocked without running bytecode — and that maximum is exactly one host call, i.e.
 *  this deadline. Tighter would preempt a guest legitimately awaiting a slow `net.fetch`; wider only
 *  lengthens how long a hung invocation holds its context. */
export const HOST_FN_DEADLINE_MS = 5000;

/** How long a command authority stays live in the parent after its command returned while a bridge call posted
 *  under it is still pending: the host-pumped continuation window `PLUGIN_CONTINUATION_WINDOW_MS` names in the
 *  contract. An action handler returns at once and floats its wire work, so the late case is a chain of host
 *  calls, each up to {@link HOST_FN_DEADLINE_MS}, that must still publish its result or its error. Without a tail
 *  a guest keeps an authority alive forever by chaining `storage.get(k).then(loop)`, each settlement re-arming
 *  the pending count before the idle check. */
export const PLUGIN_AUTHORITY_TAIL_MS = PLUGIN_CONTINUATION_WINDOW_MS;

/** Bridge calls the parent admits under one authority after its command returned; the count half of the tail's
 *  bound. A full browse page is about a hundred: two publishes that each read thirty owned badges, thirty cover
 *  fetches, and the hub requests. */
export const PLUGIN_AUTHORITY_TAIL_CALLS_MAX = 256;

/** Max serialized (JSON) byte size of any host-function result crossing back into the guest (= 1 MiB). */
export const HOST_FN_RESULT_CAP_BYTES = 1_048_576;

/** `net.fetch` response-body byte cap (the host-v1 "1 MiB response cap"). Set just UNDER
 *  `HOST_FN_RESULT_CAP_BYTES` on purpose: net.fetch returns `{status, body}`, and that wrapper is ALSO
 *  bounded by the shared result cap at the marshalling boundary — so a body sized right at 1 MiB plus the
 *  JSON wrapper would trip the result-cap reject. The body cap sits below the result cap so a legitimate
 *  near-max body still crosses; a pathological (all-escaped) body that inflates past the result cap surfaces
 *  as a CONTAINED result-cap refusal (never a leak). LEAN — tune against measured plugin API sizes. */
export const PLUGIN_NET_MAX_BYTES = 1_000_000;

/** `net.fetchAsset` download byte cap — SPLIT from {@link PLUGIN_NET_MAX_BYTES} (the belt-split's size
 *  sibling). The 1 MiB net.fetch cap exists because that body crosses BACK INTO THE GUEST under the
 *  marshalling result cap; a fetched asset's bytes never do (the guest receives only an assetId), so the
 *  honest bound here is "what is a plausible cover/card image", not the wire cap. Real hub covers measured
 *  RisuRealm serves full-size ~2.6 MB JPEGs with no resize variant (a 1 MiB cap rejected most of
 *  its art), and card-PNG downloads run to a few MB. 5 MiB admits those while the image guard's
 *  dimension/pixel caps keep holding the decompression-bomb wall. */
export const PLUGIN_ASSET_MAX_BYTES = 5_242_880;

/** Max prompt LENGTH (UTF-16 code units) a guest may hand `llm.quiet`. The generic inbound arg cap
 *  (`HOST_FN_ARGS_MAX_BYTES`, 1 MiB) is a DoS bound and is far too loose for a SPEND surface: a 1 MiB prompt
 *  is a quarter-million tokens of the installer's money per call. This is the money-shaped bound, and it
 *  REFUSES rather than truncating — a silently shortened prompt returns a wrong answer the guest cannot
 *  detect, and on a paid call that is worse than an error. 8 KiB is a LEAN: ample for an instruction plus a
 *  scene's worth of context, small enough that the hourly call floor is the real ceiling. */
export const PLUGIN_QUIET_PROMPT_MAX_CHARS = 8192;

/** Concurrent STARTED-AND-UNSETTLED host-fn implementations per INSTANCE; call N+1 rejects (the bridge
 *  back-pressure). Counted over real host work, NOT over un-timed-out guest promises: `HOST_FN_DEADLINE_MS`
 *  signals cooperative cancellation, but some transactional domain writes cannot safely stop mid-flight; so
 *  charging the slot to the deadline race would let a guest start 32 fresh installer-funded calls every 5 s
 *  while previous writes were still executing. The scope is the INSTANCE, not the invocation, because
 *  non-cancellable work can outlive it — the accounting lives in
 *  `membrane.ts`'s `attachAsync`/`InFlightCounter`. Design 03 §3 spells this row "32 per invocation"; that
 *  spelling assumed its own `PluginInvocationEnded` clause disposed the outstanding host work, which nothing on
 *  this tree can do. */
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

/** Max serialized byte size of the ARGUMENTS one host-fn call may carry from the guest — the INBOUND mirror of
 *  `HOST_FN_RESULT_CAP_BYTES`, enforced at the membrane's `attachAsync` seam. Without it the only bound on a
 *  guest argument was the 32 MiB instance heap, and every dumped argument is RETAINED host-side for the whole
 *  life of the async impl — so the real exposure was 32 MiB × `HOST_CALLS_IN_FLIGHT_MAX` of host memory per
 *  instance, plus whatever a domain op did with the value (a `storage.set` writes it, a `net.fetch` body sends
 *  it). What the cap DOES bound: everything that crosses into a domain op and everything retained across the
 *  call. What it deliberately does NOT: the TRANSIENT `ctx.dump` materialization it has to measure, which stays
 *  bounded by the guest heap cap — one dump at a time per context, which is the already-accepted 32 MiB. 1 MiB
 *  = symmetric with the outbound result cap; a legitimate host call carries keys, ids and short strings. */
export const HOST_FN_ARGS_MAX_BYTES = 1_048_576;

/** The guest-value `ctx.dump` pre-walk guards — a DoS bound that protects EVERY place the membrane materializes an
 *  untrusted guest handle host-side: the `ui.register` SPEC (before the recursive `pluginSurfaceSpecSchema` parse)
 *  AND the ARGUMENTS of every async host fn (`attachAsync` dumps them before the arg-budget cap). `ctx.dump` walks
 *  the guest tree on the HOST call stack, so a deeply-nested guest value overflows it and CORRUPTS the shared WASM
 *  runtime — the `list_empty(&rt->gc_obj_list)` abort at dispose, a hard crash of EVERY co-resident plugin, not a
 *  contained refusal (measured: ~3000-deep spec via `ui.register`, ~12000-deep arg via any async
 *  host fn with only `chat.read`). The recursive `z.lazy` spec parse has a TIGHTER cliff still — at ~2000 deep it
 *  throws a `RangeError` that ESCAPES `safeParse`, turning the §4.9 soft refusal into an activation-fatal throw.
 *  The SPEC's own semantic caps (`@orb/contracts/plugin/ui`: 256 nodes / depth 8 / 32 KiB) cannot stand in for
 *  this, because they run in a `superRefine` AFTER that base parse. `membrane.ts`'s `handleSafeToDump` walks the
 *  guest HANDLE with an EXPLICIT stack (never the host call stack, so the guard itself can never overflow) and
 *  refuses before dump/parse.
 *
 *  DEPTH_GUARD bounds the JS-graph nesting depth: a VALID spec (≤8 container levels) is ≤~20 graph levels deep
 *  (each container is object→`children`-array→object), and a legitimate host-fn arg is a flat DTO (ids, short
 *  strings, a small op array) — so 64 is generous headroom for both while sitting 30×+ below the overflow cliff.
 *  NODE_GUARD bounds the total values the walk visits — pure host-work containment against a pathologically WIDE
 *  (not deep) payload; it is far above any byte-capped payload's value count so it never false-refuses a
 *  legitimate spec or arg. The precise per-surface / per-arg caps stay downstream (the spec's superRefine and
 *  `exceedsArgBudget`), which run SAFELY once the pre-walk has guaranteed a shallow, bounded tree. */
export const PLUGIN_DUMP_DEPTH_GUARD = 64;
export const PLUGIN_DUMP_NODE_GUARD = 65_536;

/** `host.log` volume per DRAIN INTERVAL — an invocation, or the stretch between two pickups when a floated
 *  continuation logs between invocations — ring-buffered per plugin (256 lines / 16 KiB). The byte budget is a
 *  HARD bound on the drained volume, including for a single line: `LogRing.push` CLAMPS an oversized message
 *  to what is left of the budget, because those drained lines are RETAINED (see the runtime ring below) and a
 *  32 MiB single line would be an unbounded per-instance allocation. Accounting is in UTF-16 code units (a JS
 *  string's own unit, and ≥ 1 UTF-8 byte each) — the bound is on host memory, not on wire bytes. The numbers
 *  live in `@orb/contracts/plugin` (`PLUGIN_LOG_LINES_MAX` / `PLUGIN_LOG_CHARS_MAX`), shared with the client guest. */

/** The RUNTIME log ring retained per RESIDENT instance — what `getPluginLog` reads. `LogRing` above is the
 *  per-drain staging ring (emptied by every drain — an invocation's, or the port's residue pickup of what a
 *  floated continuation logged since); this is the rolling record across all of them, so a host can
 *  answer "what did this plugin just do?" instead of only "what did it print while starting up". Bounded on
 *  BOTH axes and evicted OLDEST-FIRST: one drain may hand over up to 256 lines, so a line bound alone would
 *  let one chatty run erase everything before it, and a char bound alone would let 16 KiB single-liners sit
 *  forever.
 *
 *  DURABILITY POSTURE, stated so it is not mistaken for more (the notifyFloor / resident-registry precedent):
 *  the ring is IN-MEMORY and per resident instance, `ASSUMES(single-replica)`. A restart resets it, and so does
 *  any deactivate→activate cycle (a new instance is a new ring). It is an operator's recent-activity view, NOT
 *  an audit log of record — nothing security-load-bearing may be derived from its contents or its absence. */
export const PLUGIN_LOG_RING_LINES = 1024;
export const PLUGIN_LOG_RING_CHARS = 131_072;

/** Per-resident-instance invoke FIFO depth. A resident sandbox is a SINGLE shared QuickJSContext, so
 *  every invoke (tool / D50 transform apply / event-subscriber delivery) SERIALIZES per instance — the queue is
 *  homed at `port.invoke` (the shared-scope concurrency belt). This bounds the pending (queued + running)
 *  invokes: the N+1 concurrent invoke is REFUSED with a contained typed error (a DoS backstop — a hostile flood
 *  of concurrent deliveries must not unbounded-queue and pin the sandbox forever). The fire-and-forget event
 *  `deliver` swallows the refusal (self-safe fan-out); a tool/transform invoke surfaces it as `threw`. Each
 *  queued item is bounded by the INVOCATION SETTLEMENT deadline (`cpuDeadlineMs + HOST_FN_DEADLINE_MS`),
 *  so the queue always advances — the `cpuDeadlineMs` interrupt alone does NOT guarantee that (it preempts
 *  bytecode only, so a guest awaiting a never-settling promise wedged the tail forever until the settlement
 *  deadline landed). */
export const EVENT_QUEUE_DEPTH = 16;

/** Process-side requests waiting for a physical broker Worker. This queue exists before broker admission, so
 *  every entry retains its invocation arguments or activation source in the app process. Bounding it is the
 *  aggregate app-memory wall for pressure that has not reached the broker process yet. */
export const PLUGIN_RUNTIME_REQUEST_QUEUE_MAX = 32;

/** The most of a shared host capacity, Workers in use or places in the request queue, that one owner may hold at once
 *  while another owner can run plugin code: all but one, so that owner's call never waits on this one (D349). The owner
 *  is a resident plugin's installer or the member running a snippet. A capacity of one cannot be shared, so it is not
 *  divided. */
export function pluginOwnerShare(capacity: number): number {
  return Math.max(1, capacity - 1);
}

/** A resident invocation's limits: its CPU account, its heap, and the grace its settlement wall adds past the account. */
export const PLUGIN_RESIDENT_LIMITS = {
  cpuDeadlineMs: PLUGIN_INVOCATION_CPU_MS,
  memoryLimitBytes: PLUGIN_MEMORY_LIMIT_BYTES,
  settleGraceMs: HOST_FN_DEADLINE_MS,
} as const satisfies PluginBudgets;

/** A snippet's limits: a resident invocation's, with the snippet's own CPU account. */
export const PLUGIN_SNIPPET_LIMITS = { ...PLUGIN_RESIDENT_LIMITS, cpuDeadlineMs: SNIPPET_WALL_MS } as const satisfies PluginBudgets;

/** How long after its synchronous run an invocation under these limits ends if it has not settled (D346). */
export function settlementWallMs(limits: PluginBudgets): number {
  return limits.cpuDeadlineMs + limits.settleGraceMs;
}

// The largest frames one queue holds at once.
const PLUGIN_IPC_QUEUE_FRAMES = 4;
/** Bytes each inherited IPC channel holds queued and not yet written, on each of its four hops: broker to watchdog,
 *  watchdog to app, app to watchdog and watchdog to broker (D348). */
export const PLUGIN_IPC_QUEUE_MAX_BYTES = PLUGIN_IPC_QUEUE_FRAMES * PLUGIN_BROKER_MESSAGE_MAX_BYTES;

/** The part of each queue only host control frames may fill: refusals, runtime notices, cancels and readiness. A
 *  refused call owes one refusal frame of at most {@link PLUGIN_IPC_REFUSAL_MAX_BYTES}, and at most
 *  {@link HOST_CALLS_IN_FLIGHT_MAX} calls per runtime are in flight, so every owed refusal fits. */
export const PLUGIN_IPC_CONTROL_HEADROOM_BYTES = 1_048_576;

/** The largest refusal frame a route may carry. */
export const PLUGIN_IPC_REFUSAL_MAX_BYTES = 4096;

// Capped host results a share holds at least: two full-size calls, each with room for the escaping its envelope adds,
// fit a share however many runtimes divide the queue.
const PLUGIN_IPC_SHARE_MIN_RESULTS = 4;
const PLUGIN_IPC_SHARE_MIN_BYTES = PLUGIN_IPC_SHARE_MIN_RESULTS * HOST_FN_RESULT_CAP_BYTES;

/** One plugin runtime's share of each queue: what the control headroom leaves, divided among the broker's Workers, so
 *  no runtime's frames can take another's room (D348). Past the Worker count at which the floor binds, the shares
 *  overlap and the queue's own bound still holds. */
export function pluginIpcShareBytes(workerMaximum: number): number {
  return Math.max(Math.floor((PLUGIN_IPC_QUEUE_MAX_BYTES - PLUGIN_IPC_CONTROL_HEADROOM_BYTES) / workerMaximum), PLUGIN_IPC_SHARE_MIN_BYTES);
}

// NOTE: the consecutive-crash auto-disable threshold is DOMAIN lifecycle policy, not a sandbox runtime
// budget — it lives in `domain/plugin/activation/crash-policy.ts` (`PLUGIN_CRASH_DISABLE_THRESHOLD`). It is NOT
// re-minted here (the original scaffold's `CRASH_DISABLE_THRESHOLD` never found a consumer; the cake bans the domain
// from value-importing infra, so its one home is the domain that enforces it).

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

/** Guest CPU budget for ONE SPAN of guest execution (installed plugin handler/tool/transform). Enforced by the
 *  QuickJS interrupt handler comparing REAL wall-time against the open window.
 *
 *  A SPAN, not an invocation: the same number bounds the invocation AND each POST-invocation job pump, because
 *  a guest continuation resumed when a fire-and-forget host call settles is guest bytecode too — and a pump
 *  that ran it with no handler installed was #781, a whole-process DoS. `cpu-guard.ts` states the window
 *  mechanics (one context-lifetime handler, nested windows narrow and restore). The aggregate is therefore
 *  bounded by `HOST_CALLS_IN_FLIGHT_MAX` × this, not by this alone. */
export const PLUGIN_INVOCATION_CPU_MS = 1000;

/** Inline snippet total wall-clock run — the whole snippet, not per-call. */
export const SNIPPET_WALL_MS = 5000;

/** WASM memory cap per QuickJSContext (setMemoryLimit), in bytes (= 32 MiB). Over-limit allocation fails
 *  guest-side and is CONTAINED to the instance — the property QuickJS-ng-WASM was chosen for (README
 *  rejected `isolated-vm` precisely because V8 cannot unwind OOM). */
export const PLUGIN_MEMORY_LIMIT_BYTES = 33_554_432;

/** Process-wide resident QuickJS contexts. Each context carries its own 32 MiB hard ceiling, so leaving the
 *  registry unbounded converts installed-plugin count directly into unbounded process memory. Admission is
 *  reserved before activation starts (not after the instance enters the resident map), and released only after
 *  activation failure or teardown. Explicit refusal is safer than evicting a live plugin behind its registrars. */
export const PLUGIN_RESIDENT_RUNTIME_MAX = 16;

/** Process-wide CONCURRENT snippet contexts — the transient half of the same ceiling, and a SEPARATE pool
 *  from {@link PLUGIN_RESIDENT_RUNTIME_MAX} on purpose. A snippet mints exactly the same 32 MiB
 *  `QuickJSContext` an activation does, so leaving `runSnippet` unadmitted made the process ceiling a
 *  fiction: `SNIPPET_CONCURRENCY_PER_USER` is a PER-USER cap, so N distinct members multiplied straight
 *  through it.
 *
 *  WHY NOT ONE SHARED POOL. The two leases have incomparable lifetimes: a resident's is held for the whole
 *  time its plugin is enabled, a snippet's for one ≤5 s call. Sharing a counter lets the long-lived side
 *  monotonically eat it — 16 installed plugins would kill the snippet console PERMANENTLY, which is a
 *  starvation, not a refusal. Two pools mean a snippet storm cannot refuse an activation and a full
 *  install roster cannot refuse a REPL; each side's ceiling is the honest number for its own class.
 *
 *  THE PROCESS CEILING IS THEREFORE (16 + 8) × 32 MiB = 768 MiB of guest heap, worst case, and that sum is
 *  the number to review against soak data — never one constant alone. 8 is a LEAN with its resolution
 *  criterion: it is two members at their full per-user allowance of 4 at the same instant, which is the
 *  concurrency a personal REPL actually produces; raise it when real multi-member load refuses an honest
 *  snippet, lower it if measured abuse arrives first. */
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

/** Max serialized (JSON) byte size of any host-function result crossing back into the guest (= 1 MiB). */
export const HOST_FN_RESULT_CAP_BYTES = 1_048_576;

/** `net.fetch` response-body byte cap (the host-v1 "1 MiB response cap"). Set just UNDER
 *  `HOST_FN_RESULT_CAP_BYTES` on purpose: net.fetch returns `{status, body}`, and that wrapper is ALSO
 *  bounded by the shared result cap at the marshalling boundary — so a body sized right at 1 MiB plus the
 *  JSON wrapper would trip the result-cap reject. The body cap sits below the result cap so a legitimate
 *  near-max body still crosses; a pathological (all-escaped) body that inflates past the result cap surfaces
 *  as a CONTAINED result-cap refusal (never a leak). LEAN — tune against measured plugin API sizes. */
export const PLUGIN_NET_MAX_BYTES = 1_000_000;

/** `net.fetchAsset` download byte cap — SPLIT from {@link PLUGIN_NET_MAX_BYTES} (#801, the belt-split's size
 *  sibling). The 1 MiB net.fetch cap exists because that body crosses BACK INTO THE GUEST under the
 *  marshalling result cap; a fetched asset's bytes never do (the guest receives only an assetId), so the
 *  honest bound here is "what is a plausible cover/card image", not the wire cap. Real hub covers measured
 *  2026-08-29: RisuRealm serves full-size ~2.6 MB JPEGs with no resize variant (a 1 MiB cap rejected most of
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
 *  while previous writes were still executing (P2-G). The scope is the INSTANCE, not the invocation, because
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
 *  contained refusal (measured 2026-08-25, #707: ~3000-deep spec via `ui.register`, ~12000-deep arg via any async
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
 *  string's own unit, and ≥ 1 UTF-8 byte each) — the bound is on host memory, not on wire bytes. The names
 *  keep their `_PER_INVOCATION` spelling: an invocation is still the common interval, and every consumer of the
 *  numbers is the same. */
export const LOG_LINES_PER_INVOCATION = 256;
export const LOG_BYTES_PER_INVOCATION = 16_384;

/** The RUNTIME log ring retained per RESIDENT instance — what `getPluginLog` reads. `LogRing` above is the
 *  per-drain staging ring (emptied by every drain — an invocation's, or the port's residue pickup of what a
 *  floated continuation logged since, #806); this is the rolling record across all of them, so a host can
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

// NOTE: the consecutive-crash auto-disable threshold is DOMAIN lifecycle policy, not a sandbox runtime
// budget — it lives in `domain/plugin/activation/crash-policy.ts` (`PLUGIN_CRASH_DISABLE_THRESHOLD`). It is NOT
// re-minted here (the original scaffold's `CRASH_DISABLE_THRESHOLD` never found a consumer; the cake bans the domain
// from value-importing infra, so its one home is the domain that enforces it).

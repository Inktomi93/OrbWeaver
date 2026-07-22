# infra/plugin-host — P1 runtime spike: evidence + findings (D46)

> **Status: SPIKE LANDED 2026-07-17.** The deliverable is a PROVEN runtime pin + this evidence report,
> not production domain code. Every load-bearing mechanic in `plugin-design/01–03` is EXERCISED by a test
> (`tests/server/infra/plugin-host/`), not asserted. P2–P6 builders: read the Sharp edges before wiring.

## Verdict: PIN CONFIRMED

QuickJS-ng via **`quickjs-emscripten-core@0.32.0` + `@jitl/quickjs-ng-wasmfile-release-sync@0.32.0`**,
in-process WASM, is a viable runtime for the D46 sandbox. All P1 exit criteria (04 §P1) hold:
a hello-world guest runs; `Date`/`Math.random` are throwing stubs in-guest; a `while(true)` guest dies at
the deadline with the process healthy; determinism, memory containment, and handle discipline are proven.
No design premise was disproved — but the "process RSS stable" clause (03 §4) is refined to
"correctness-contained, RSS monotonic" (finding #2 below).

## The pin (do not re-derive — README rejected list is permanent)

- **Core + the -ng variant, explicitly.** The `quickjs-emscripten` umbrella bundles only the ORIGINAL
  (Bellard) quickjs and its default `getQuickJS()` is original-quickjs. Honoring D46's "-ng" REQUIRES
  `quickjs-emscripten-core` (the `newQuickJSWASMModuleFromVariant` loader + all types) + the `@jitl/…-ng-…`
  variant. Catalog pin + full rationale: `pnpm-workspace.yaml` (infra/plugin-host block).
- **Variant = release · sync · wasmfile.** *release* (not debug: prod). *sync* (not asyncify): the
  membrane's async posture is manual `executePendingJobs()` job-pumping under the invocation deadline
  (03 §3), NOT asyncify's whole-stack suspend — asyncify is a size/perf tax AND lets an `await` outlive its
  budget. *wasmfile* (not singlefile): separate `.wasm`, faster node startup, no base64 bloat.
- **No native build / no postinstall** (published tarballs ship the prebuilt `.wasm`) — no `allowBuilds`
  entry needed.

## Evidence (claim → proof)

| Design claim | Proven by |
|---|---|
| One module/process; contexts isolated (own globals) | `module.test.ts` (singleton + cross-context isolation) |
| Ambient non-determinism denied; no I/O globals; `orb`-only | `realm.test.ts` (Date/Math.random throw; setTimeout/fetch/process/require absent) |
| `orb.host(1)` serves, `orb.host(2)` throws loudly (fail-on-V2) | `realm.test.ts` (version gate) |
| Injected clock/PRNG/ids are the guest's ONLY sources; determinism | `realm.test.ts` + `sandbox.test.ts` (same seams → byte-identical, diff seed → differs) |
| DoS: busy loop killed at the interrupt deadline, process healthy | `sandbox.test.ts` (deadline kill < 2 s) |
| DoS: memory bomb contained (guest OOMs), fresh instance works | `sandbox.test.ts` (alloc bomb → ok:false) |
| DoS: deep recursion contained, runtime cleanly disposable | `sandbox.test.ts` (recursion → RangeError; see finding #1) |
| Membrane round-trip: sync + async (deferred-promise bridge) | `sandbox.test.ts` (`boundHostFn` echo + async) |
| Host-call self-bound (reentrancy footgun) + result cap | `sandbox.test.ts` (hanging fn bounded at deadline; oversize refused) |
| Handle-lifetime discipline: zero leak after 10k invocations | `sandbox.test.ts` (`pendingHandles === 0`) |

## Sharp edges — P2–P6 MUST inherit these

1. **`setMaxStackSize` is MANDATORY, not cosmetic** (`GUEST_MAX_STACK_BYTES`, wired in `Sandbox.create`).
   QuickJS-ng's DEFAULT stack-overflow detection does NOT reliably catch deep recursion: a recursive guest
   blows the real WASM/native stack, which (a) surfaces as a HOST-side `RangeError` (escapes the sandbox)
   and (b) leaves the runtime UN-DISPOSABLE — `ctx.dispose()` aborts the whole WASM module
   (`list_empty(&rt->gc_obj_list)` assertion in `JS_FreeRuntime`). An explicit conservative soft ceiling
   (256 KiB verified; default and 512 KiB both crash) makes the soft check fire first → a contained guest
   `RangeError` and a clean dispose. Aborting the module would take down the shared process runtime — treat
   this as a security/availability control, not a tuning knob.
2. **Memory containment is CORRECTNESS, not RSS reclamation.** `setMemoryLimit` bounds the guest JS heap
   and makes an allocation bomb a clean error (isolation holds; the process survives; other instances are
   unaffected). BUT all contexts share ONE WASM linear memory, which grows to a MONOTONIC per-process
   high-water mark that `dispose()` never returns to the OS — a bomb permanently inflates RSS (GBs observed
   at a 4 MiB per-instance cap). So 03 §4's "process RSS stable" is an over-claim. P6 budget review + an
   ops decision needed: recycle the plugin host in a dedicated worker/process to reclaim RSS, and/or a
   hard aggregate high-water policy. The pin is NOT disqualified (isolated-vm's disqualifier — a hostile
   OOM crashing the whole process — does NOT occur here; the guest just errors).
3. **Two clocks, never conflate.** The DoS interrupt deadline reads a MONOTONIC real clock
   (`performance.now()` in the interrupt handler); the guest-VISIBLE clock is the injected deterministic
   seam (`host.clock.nowEpochMs`). 03 §3's "compares the injected clock against the invocation deadline" is
   imprecise — a frozen test clock (or a wall-clock jump) must NEVER be able to disable the DoS kill, so the
   interrupt must NOT use the guest seam (and monotonic beats `Date.now`, which also satisfies `no-raw-clock`).
4. **The interrupt does NOT preempt a blocking HOST call** — only guest bytecode. Every host function
   therefore self-bounds via `boundHostFn` (a real-time deadline race + result-size cap). An unbounded host
   fn cannot be written by omission because it is the ONLY constructor. Proven by the hanging-fn test.
5. **Async bridge = sync variant + deferred promise + host-side pump.** A host fn returning a promise
   creates `ctx.newPromise()`, resolves it from host async work, and pumps `executePendingJobs()` on settle;
   the caller `await ctx.resolvePromise(handle)`. Rejections MUST be minted as GUEST Error objects
   (`ctx.newError`), NOT strings — a rejected string gives the guest `e.message === undefined`.
6. **Handle-lifetime discipline is load-bearing.** Every host-minted handle must be disposed; per-invocation
   handles are counted and asserted back to 0 (10k-invocation leak guard). quickjs-emscripten DEMANDS this —
   a dropped handle is a WASM-memory leak.
7. **`invoke` on ONE resident SERIALIZES — a resident sandbox is not concurrency-safe.** A resident is a SINGLE
   shared `QuickJSContext`: the invocation-chat scope (`setInvocationChat`), the guest heap, and the in-flight
   counter are all shared per instance. Two concurrent `invoke`s used to interleave — A sets its chat + awaits
   into the guest, B overwrites the shared chat, and A resumes reading B's `chatId` + `automationDepth`. A
   clobbered `automationDepth` breaks the cascade-depth loop belt (`chat.requestTurn` stamps `depth+1`), an
   UNTRUSTED-boundary containment hole. REACHABLE: a burst of bus events fans multiple concurrent
   `sub.deliver` at the SAME subscriber. FIX (`port.invoke`): a PER-INSTANCE bounded FIFO tail-promise —
   each invoke's `setInvocationChat`→`invokeHandler` pair runs to completion (settle OR reject OR deadline)
   before the next invoke on the SAME instance begins; the chain advances on both arms so a failed invoke never
   wedges it. DIFFERENT instances stay concurrent (per-instance, not global). BOUNDED at `EVENT_QUEUE_DEPTH`
   (16 pending): the N+1 concurrent invoke is a CONTAINED typed refusal (a flood DoS backstop), swallowed by the
   fire-and-forget `deliver` / surfaced as `threw` for a tool/transform. `runSnippet` (fresh disposed sandbox per
   call) + `createInstance` (once) share no resident and need no serialization. Proven by the real-async race
   repro in `port.test.ts` (a sync fake HIDES the race — the guard test drives the pre-fix unserialized path and
   shows the clobber).

## What P1 did NOT build (by design — spike scope)

The surface `orb.host(1)` returns is the DETERMINISM FLOOR only (clock/random/ids/log + version gate). The
full `PluginHostV1` (chat/worldInfo/tools/net/transforms/… — 01 §2) is **P2** (`@orb/contracts/plugin`);
lifecycle/registry/grants/DDL are **P3** (`domain/plugin`); host-function wiring + event delivery + the D48
tool seam + the D50 transform seam are **P4**; snippets **P5**; the `plugin-no-ambient` gate + the full
hostile-guest escape suite are **P6**. The `boundHostFn` wrapper, the realm, the budgets, and the module
loader here are the real skeleton those chunks extend.

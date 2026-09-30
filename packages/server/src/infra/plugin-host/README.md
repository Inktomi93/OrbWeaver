# infra/plugin-host — QuickJS broker boundary

The plugin host runs each warm guest in a recyclable Node Worker inside a separately memory-limited broker
process. Enabled installations retain their host-owned registration catalog while the guest sleeps, so enabled
count does not allocate a Worker. The app process keeps every authority-bearing `PluginBridge` closure and a
durable-source reader, while the bundle bytes stay in CAS until a cold wake. A guest
call crosses inherited IPC through the watchdog and is re-authorized in the app before the bridge runs.

This split is the host-memory boundary. QuickJS's `setMemoryLimit` is live guest-allocation accounting; it is
not a WebAssembly or process RSS ceiling. A measured 4 MiB guest allocation bomb made the published Emscripten
memory grow toward its 2 GiB default and `dispose()` did not reclaim that high-water allocation. Terminating the
Worker did reclaim the guest's allocation. Keeping the engine in a watchdog-supervised broker lets the host
terminate measured RSS growth before it normally reaches the main service, subject to the watchdog overshoot
described below.

## Runtime pin

- `quickjs-emscripten-core@0.32.0` plus
  `@jitl/quickjs-ng-wasmfile-release-sync@0.32.0` explicitly selects QuickJS-ng. The umbrella package's default
  is original Bellard QuickJS.
- The release, sync, wasmfile variant matches the host: pending jobs are pumped explicitly under the invocation
  deadline, and the published WASM is loaded as a file without a native build or postinstall.
- Every Worker supplies the supported `newVariant({ wasmMemory })` hook. The module starts at 16 MiB and cannot
  grow past 48 MiB. The published module requires at least 16 MiB; the full shipped host surface initializes at
  that size, a 31 MiB legitimate typed allocation succeeds at the 48 MiB ceiling, and the measured bomb grows
  to 48 MiB before returning a contained OOM.
- `PLUGIN_MEMORY_LIMIT_BYTES` remains the independent 32 MiB QuickJS live-allocation limit. Neither number is a
  claim about Worker RSS.

## Boundary and failure contract

The app mints an opaque authority id for each create, invoke, snippet, or dispose command. The Worker carries it
through `AsyncLocalStorage` on every async and synchronous bridge call. Before dispatch, the app validates the
runtime id and live authority id, rechecks the original grant through `HOST_FUNCTION_CAPABILITY`, pins every
chat id to the invocation's admitted chat, rechecks `canWrite`, and rechecks request-turn cascade depth. Unknown
operation names, malformed argument envelopes, oversized frames, and stale ids are refused.

An authority id stays live after its command returns while a bridge call posted under it is still pending, for
at most `PLUGIN_AUTHORITY_TAIL_MS` after the command completed. A guest continuation resumed by that call's late
result runs in the Worker's job pump under the same id, so its own host calls are re-authorized against the phase
and chat of the command that started the chain. The Worker sends `authority-released` once the command has
completed and no call posted under the id remains pending, or when the tail expires; the app deletes the id on
that message and runs the same tail timer itself, so a Worker that never reports cannot extend an authority. A
call under an expired id is refused as stale. Retire, crash and disconnect clear every id and timer at once. A
runtime holding a tail authority is still reusable by its own logical plugin and evictable: reuse carries the same
grants, a chat-scoped call must match both the membrane's current handle and the frozen authority's chat, and
eviction retires the runtime, which drops the chain.

The physical Worker pool is configured independently from logical enabled count. Requests enter a bounded FIFO and
idle guests are evicted least-recently-used; a pinned invocation is never evicted. Snippets share this same
physical ceiling, so their separate concurrency guard cannot multiply past the aggregate. A wake rereads and
validates the bundle from CAS before rerunning registration-only `main.js` with a read-only rehydration
authority, requires the new registration catalog and
handler refs to deep-equal the retained catalog, and only then invokes the handler through the original logical
instance. Rehydration cannot write storage or variables, publish UI state, spend, notify, or admit network
egress. Initial activation keeps the existing host API so shipped plugins may publish their first UI state;
the replay authority is the narrower phase. Catalog drift fails contained instead of rebinding a stale callback.

Durable plugin state lives in the host stores (`storage.kv`, global variables, and other domain rows). The
guest heap, pending promises, and physical-runtime log staging are transient and disappear on eviction. The
logical registration catalog and accumulated bounded owner log stay app-side so discoverability and recent-log
reads do not depend on a warm Worker. Plugins must derive handler state from durable host reads when cold/warm
equivalence matters; closure-only counters reset on wake by design.

The app and watchdog create the inherited IPC channels. The broker owns no network listener and receives no network grant. The watchdog assigns each broker a fresh generation. Frames from a stopped generation cannot reach a replacement broker or dispatch in the app. Serialized frames and pending IPC writes have finite byte limits. The private working directory contains no app data; the broker receives no filesystem write grant.

Production has no in-process fallback. On Linux, macOS, Windows, and in the default Docker container, the app
starts the same process tree: app → watchdog → broker → bounded Workers. The broker reports whole-process RSS,
including Workers, every 25 ms. The watchdog kills and restarts it after RSS exceeds the configured ceiling,
after heartbeat loss, or after an unexpected exit. App death closes the parent IPC channel, which makes the
watchdog stop the broker rather than leaving an orphan.

A watchdog restart does not revive a logical plugin: the app marks every resident crashed, rejects in-flight
work, and requires an explicit fresh activation before it can use the new broker. Guest linear memory, live
QuickJS allocations, physical Workers, host-call results, protocol frames, and queued arguments each have
independent finite bounds. The RSS watchdog has bounded detection overshoot; it is not a kernel-hard memory
limit. In Docker the app and broker also share one container cgroup, so a broker overshoot that reaches the
container limit can still make the container runtime OOM-kill the app. The composed pressure proof records
Worker count, broker RSS, cold latency, throughput, kill, explicit logical failure, and recovery behavior.
The shipped pair is a 1 GiB monitored RSS threshold and four physical Workers. Measured deployments may set
`PLUGIN_BROKER_MEMORY_LIMIT_BYTES` and `PLUGIN_BROKER_WORKER_MAX` together; neither V8 old-space nor
`NODE_OPTIONS` changes either plugin budget.

Every command has a parent-side deadline, and synchronous Worker calls have a bounded `Atomics.wait`. A command
timeout terminates the inherited channel and its supervised processes, including every Worker. Broker death marks
all logical residents crashed, including sleeping ones, rejects pending commands, and cancels pending bridge
liveness. Intentional LRU eviction is the only wakeable teardown. No guest is silently replayed after an
unplanned broker death; the lifecycle may explicitly activate a fresh instance later.

## Sharp edges

1. `setMaxStackSize(GUEST_MAX_STACK_BYTES)` is mandatory. Without the 256 KiB soft ceiling, measured deep
   recursion escaped as a host `RangeError` and left the runtime undisposable; the explicit ceiling produces a
   contained guest error.
2. The interrupt handler bounds guest bytecode with a real monotonic clock. The guest-visible clock is the
   deterministic injected seam. A frozen guest clock must never disable the DoS interrupt.
3. The interrupt cannot preempt a blocking host call. Every async host function goes through the membrane's
   deadline, result cap, cancellation, and pending-handle drain.
4. One resident `QuickJSContext` is serialized through its bounded invoke FIFO. Its invocation chat, guest heap,
   and in-flight counter are shared; concurrent entry would let one invocation overwrite another's chat scope.
5. Every QuickJS handle is explicitly disposed. A dropped handle is a WASM-memory leak, and an unsettled guest
   promise can make runtime disposal abort.

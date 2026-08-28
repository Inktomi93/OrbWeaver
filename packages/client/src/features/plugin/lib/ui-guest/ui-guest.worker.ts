// ui-guest.worker — the Tier-C CLIENT GUEST (plugin-ui-plane #679 U4, §4.6). One Web Worker per enabled
// scripted plugin, holding ONE QuickJS-WASM context that runs that plugin's `ui.js`. It is the client mirror of
// `infra/plugin-host`'s Sandbox, and every structural decision here is that file's, re-derived for the browser
// rather than re-invented:
//
//  * ONE CONTEXT per guest, with an explicit memory cap AND an explicit stack ceiling. The stack ceiling is
//    MANDATORY (`GUEST_MAX_STACK_BYTES`, measured on the server): without it a recursive guest blows the real
//    WASM stack, which surfaces as a HOST-side RangeError and leaves the runtime un-disposable.
//  * REALM-STRIPPED. `Date`, `Math.random` and `performance` are overwritten with throwing stubs, and `orb.ui`
//    is the only thing installed. The realm ALLOW-LIST is asserted by a test from birth (the D46 review's P2-C
//    fix, inherited rather than re-learned): "absent from a bare context" is not a property this file may
//    assume, because that assumption is exactly how `performance` shipped live on the server.
//  * SYNC variant + manual job pumping. An `await` chain cannot outlive its budget, because the host pumps
//    `executePendingJobs()` under an interrupt handler reading REAL monotonic time.
//  * NOTHING LIVE CROSSES. Host results arrive as JSON strings and are handed to the realm's PRISTINE
//    `JSON.parse` (captured before any guest code ran, so a guest cannot interpose on the next payload).
//
// WHAT THIS WORKER DELIBERATELY DOES NOT HAVE: the DOM (a worker has none), the network (see below), and any
// authority. Its only wire is a `hostCall` message the MAIN THREAD relays to one re-gated tRPC proc.
//
// THE THREAD'S NETWORK CAPABILITY IS DELETED, and it is worth being precise about why, because a worker's
// `fetch` is not the guest's: the guest realm is a QuickJS context with no I/O at all, so a plugin cannot reach
// it. The deletion closes the OTHER hole — this worker's own module scope. If a future edit to THIS file (or a
// bundler-injected helper) reached for the network, a plugin's data could leave the box through a door with no
// allow-list, no SSRF guard and no egress belt. Removing the capability from the thread makes that a
// build-time impossibility rather than a code-review promise. It happens AFTER the WASM module is loaded,
// because the emscripten loader fetches the `.wasm` itself.

import baseVariant from "@jitl/quickjs-ng-wasmfile-release-sync";
// The `.wasm` as a bundled ASSET URL. Without this the variant's own loader builds a URL from
// `import.meta.url` at RUNTIME, which works in dev (vite serves node_modules) and silently 404s in a production
// build (nothing told the bundler to emit the file) — a scripted surface that works for every developer and for
// no user. `?url` yields the emitted asset's hashed URL, and `newVariant`'s `wasmLocation` is the
// upstream-sanctioned way to point the loader at it. The suffix is NOT optional here — probed 2026-08-28:
// `assetsInclude: ["**/*.wasm"]` plus a plain specifier does NOT win, vite still runs its `?init` wasm
// transform and the worker bundle fails to build. It is also why `.dependency-cruiser.cjs` excludes
// `?`-suffixed asset requests from its graph (see the note there).
import wasmUrl from "@jitl/quickjs-ng-wasmfile-release-sync/wasm?url";
import type { QuickJSContext, QuickJSHandle, QuickJSWASMModule } from "quickjs-emscripten-core";
import { newQuickJSWASMModuleFromVariant, newVariant } from "quickjs-emscripten-core";
import type { UiGuestBootMessage, UiGuestEventMessage, UiGuestInbound, UiGuestOutbound } from "./ui-guest-protocol.ts";
import { UI_GUEST_BUDGETS } from "./ui-guest-protocol.ts";

const variant = newVariant(baseVariant, { wasmLocation: wasmUrl });

/** Every network affordance this THREAD has. Removed once the WASM is loaded — see the file header. */
const NETWORK_GLOBALS = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"] as const;

function post(message: UiGuestOutbound): void {
  globalThis.postMessage(message);
}

/** The bounded log ring — the client mirror of `realm.ts`'s `LogRing`. Bounded on BOTH axes, and an oversized
 *  line is CLAMPED rather than dropped: a truncated line still tells an operator what ran. */
class LogRing {
  private lines = 0;
  private chars = 0;

  push(level: "info" | "warn" | "error", message: string): void {
    if (this.lines >= UI_GUEST_BUDGETS.logLines || this.chars >= UI_GUEST_BUDGETS.logChars) {
      return;
    }
    const room = UI_GUEST_BUDGETS.logChars - this.chars;
    const clamped = message.length <= room ? message : message.slice(0, room);
    this.lines += 1;
    this.chars += clamped.length;
    post({ kind: "log", level, message: clamped });
  }
}

/** THE AMBIENT TIME/ENTROPY DENIAL, carried over from `infra/plugin-host/realm.ts`. Every name here is one a
 *  bare quickjs-ng context ships with and a guest could otherwise read without asking. The stub keeps the NAME
 *  (so a guest can feature-detect) and kills the reading. `performance` is listed because it is the one that
 *  shipped live on the server: a real, monotonic, sub-microsecond clock that defeats the injected entropy seam,
 *  measures the DoS deadline, and times side-channels inside a shared WASM linear memory. */
const AMBIENT_STUBS = `
  (() => {
    const die = (name) => () => {
      throw new Error(name + " is disabled in the plugin sandbox — use orb.ui(1).clock / .random for host-injected time and entropy");
    };
    const D = die("Date"); D.now = die("Date.now"); D.parse = die("Date.parse"); D.UTC = die("Date.UTC");
    globalThis.Date = D;
    Math.random = die("Math.random");
    globalThis.performance = { now: die("performance.now") };
  })();
`;

interface GuestState {
  readonly ctx: QuickJSContext;
  readonly log: LogRing;
  /** The realm's PRISTINE `JSON.parse`, captured before any guest code ran — the inbound host-result channel. */
  readonly jsonParse: QuickJSHandle;
  /** The guest's `onEvent` handler, if it registered one. Owned for the worker's lifetime. */
  handler: QuickJSHandle | null;
  /** Host calls the guest is awaiting, by callId — the deferred each is parked on. */
  readonly pending: Map<number, { resolve: (json: string) => void; reject: (message: string) => void }>;
  readonly surfaceIds: ReadonlySet<string>;
  nextCallId: number;
  inFlight: number;
}

/** The realm-install inputs, bundled — a named bag rather than five positionals (the house `AsyncFnSpec` /
 *  `PluginBelts` posture: a seam that gains inputs must not gain arity). */
interface RealmDeps {
  readonly ctx: QuickJSContext;
  /** Late-bound: the realm's closures need the state, and the state needs the realm installed first. */
  readonly current: () => GuestState;
  readonly grants: readonly string[];
  readonly log: LogRing;
}

let guest: GuestState | null = null;
let modulePromise: Promise<QuickJSWASMModule> | undefined;

/** Memoized WASM module load — ONE instantiation per worker, exactly as `module.ts` does per process. */
function loadModule(): Promise<QuickJSWASMModule> {
  modulePromise ??= newQuickJSWASMModuleFromVariant(variant);
  return modulePromise;
}

/** Project a guest error handle to plain data. Nothing live crosses back; a dump is a plain JS value. */
function readError(ctx: QuickJSContext, handle: QuickJSHandle): string {
  const dumped: unknown = ctx.dump(handle);
  if (typeof dumped === "object" && dumped !== null) {
    const record = dumped as { name?: unknown; message?: unknown };
    return `${String(record.name ?? "Error")}: ${String(record.message ?? "")}`;
  }
  return String(dumped);
}

/** Run a guest computation to settlement under a CPU budget: install the interrupt handler against REAL
 *  monotonic time, pump the job queue, and contain any throw / deadline / OOM as a message. The client mirror of
 *  `Sandbox.runToSettlement`, minus the settlement race — out here the HOST's wall-clock timer plus
 *  `terminate()` is the outer bound, and it is a stronger one than any in-thread deadline can be (a single
 *  interpreter thread cannot preempt itself once it stops running bytecode; another thread killing it can). */
async function runToSettlement(state: GuestState, cpuMs: number, produce: () => ReturnType<QuickJSContext["evalCode"]>): Promise<string | null> {
  const { ctx } = state;
  // `performance.now()` — the WORKER's, not the guest's (whose is a throwing stub). The DoS deadline must read
  // a real monotonic clock so a frozen guest clock can never disable the kill.
  const startMs = performance.now();
  ctx.runtime.setInterruptHandler(() => performance.now() - startMs > cpuMs);
  try {
    const result = produce();
    if (result.error) {
      const message = readError(ctx, result.error);
      result.error.dispose();
      return message;
    }
    const handle = result.value;
    const native = ctx.resolvePromise(handle);
    ctx.runtime.executePendingJobs();
    const settled = await native;
    handle.dispose();
    if (settled.error) {
      const message = readError(ctx, settled.error);
      settled.error.dispose();
      return message;
    }
    settled.value.dispose();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  } finally {
    ctx.runtime.removeInterruptHandler();
  }
}

/** Install `orb.ui(1)` — the ONE door, and the entire surface a scripted guest sees. */
function installRealm(deps: RealmDeps): void {
  const { ctx } = deps;
  const stub = ctx.evalCode(AMBIENT_STUBS);
  if (stub.error) {
    const message = readError(ctx, stub.error);
    stub.error.dispose();
    throw new Error(`plugin ui realm ambient-stub install failed: ${message}`);
  }
  stub.value.dispose();

  using orb = ctx.newObject();
  using uiFn = ctx.newFunction("ui", (majorHandle?: QuickJSHandle) => {
    const major = majorHandle === undefined ? Number.NaN : ctx.getNumber(majorHandle);
    if (major !== 1) {
      // Loudly, and by TYPE: a guest feature-detects on `e.name`, never on a message substring (the server's
      // `HostVersionError` posture — the class NAME is what crosses a realm boundary intact).
      const error = ctx.newError(`orb.ui(${String(major)}) is not served — this host serves version 1`);
      ctx.setProp(error, "name", ctx.newString("HostVersionError"));
      throw error;
    }
    return buildSurface(deps);
  });
  ctx.setProp(orb, "ui", uiFn);
  ctx.setProp(ctx.global, "orb", orb);
}

/** The `orb.ui(1)` surface: the injected seams, log, `render`, `onEvent`, and the proxied `host` namespaces. */
function buildSurface(deps: RealmDeps): QuickJSHandle {
  const { ctx, current, grants: grantList, log } = deps;
  const surface = ctx.newObject();
  ctx.setProp(surface, "version", ctx.newNumber(1));

  // The GRANTS list — DISPLAY-ONLY. A guest feature-detects against it ("do I hold storage.kv?"); it is not an
  // authority, and the server re-gates every call against the stored row regardless of what this array says.
  using grants = ctx.newArray();
  grantList.forEach((grant, i) => {
    using s = ctx.newString(grant);
    ctx.setProp(grants, i, s);
  });
  ctx.setProp(surface, "grants", grants);

  // The guest's clock and entropy are the HOST's, read at call time — the same injected-seam shape the server
  // realm uses (whose production seams are the host's own wall clock and PRNG). The guest cannot reach `Date`
  // or `Math.random` at all (stubbed above), so these are the only sources available and the host owns both.
  using clock = ctx.newObject();
  using nowFn = ctx.newFunction("nowEpochMs", () => ctx.newNumber(Date.now()));
  ctx.setProp(clock, "nowEpochMs", nowFn);
  ctx.setProp(surface, "clock", clock);

  using randomObj = ctx.newObject();
  using nextFn = ctx.newFunction("next", () => ctx.newNumber(Math.random()));
  ctx.setProp(randomObj, "next", nextFn);
  ctx.setProp(surface, "random", randomObj);

  using logObj = ctx.newObject();
  for (const level of ["info", "warn", "error"] as const) {
    using fn = ctx.newFunction(level, (msgHandle?: QuickJSHandle) => {
      log.push(level, msgHandle === undefined ? "" : ctx.getString(msgHandle));
    });
    ctx.setProp(logObj, level, fn);
  }
  ctx.setProp(surface, "log", logObj);

  // render(surfaceId, tree) — RETAINED MODE. The guest publishes a WHOLE tree; the host applies it behind a
  // content-equality publish guard so a re-render loop cannot form. A surfaceId this plugin did not register is
  // DROPPED with a log line rather than posted: a guest may not paint a surface it does not own, and silently
  // succeeding would leave the author debugging a mount that never appears.
  using renderFn = ctx.newFunction("render", (idHandle?: QuickJSHandle, treeHandle?: QuickJSHandle) => {
    const surfaceId = idHandle === undefined ? "" : ctx.getString(idHandle);
    if (!current().surfaceIds.has(surfaceId)) {
      log.push("warn", `render() ignored: '${surfaceId}' is not a scripted surface this plugin registered`);
      return ctx.undefined;
    }
    // `ctx.dump` materializes the guest value host-side; it is then re-serialized so what crosses the worker
    // boundary is a STRING (see the protocol header). The host's zod parse is the trust boundary — this is only
    // the transport.
    const tree: unknown = treeHandle === undefined ? null : ctx.dump(treeHandle);
    post({ kind: "render", surfaceId, treeJson: JSON.stringify(tree ?? null) });
    return ctx.undefined;
  });
  ctx.setProp(surface, "render", renderFn);

  // onEvent(handler) — ONE handler per guest. A second call REPLACES the first (and disposes it), which is the
  // only sane semantics for an author iterating on their file and avoids a handler list nothing would prune.
  using onEventFn = ctx.newFunction("onEvent", (handlerHandle?: QuickJSHandle) => {
    if (handlerHandle === undefined || ctx.typeof(handlerHandle) !== "function") {
      log.push("warn", "onEvent() ignored: expected a function");
      return ctx.undefined;
    }
    const state = current();
    state.handler?.dispose();
    state.handler = handlerHandle.dup();
    return ctx.undefined;
  });
  ctx.setProp(surface, "onEvent", onEventFn);

  ctx.setProp(surface, "host", buildHostProxy(deps));
  return surface;
}

/** The PROXIED host namespaces. Each leaf posts a `hostCall` and returns a guest PROMISE the host settles — so
 *  a plugin author writes `await ui.host.storage.get(k)` on the client exactly as they write
 *  `await host.storage.get(k)` on the server, and the one-dialect property §4.6 bought is real.
 *
 *  The names MIRROR `UI_PROXYABLE_HOST_FUNCTIONS` and are spelled out rather than derived from a message,
 *  BECAUSE the tuple is the security boundary: deriving them at runtime would make "which functions exist" a
 *  property of data the host composed. The server re-gates every name regardless; this shape means a wrong name
 *  fails in the guest, immediately, with a readable error instead of a network round-trip. */
const PROXY_NAMESPACES: Readonly<Record<string, readonly string[]>> = {
  chat: ["listMessages", "getVariables"],
  variables: ["get", "set", "delete"],
  storage: ["get", "set", "delete", "list"],
};

function buildHostProxy(deps: RealmDeps): QuickJSHandle {
  const { ctx, current } = deps;
  const host = ctx.newObject();
  for (const [namespace, methods] of Object.entries(PROXY_NAMESPACES)) {
    using ns = ctx.newObject();
    for (const method of methods) {
      using fn = ctx.newFunction(method, (...argHandles: QuickJSHandle[]) => {
        const state = current();
        const deferred = ctx.newPromise();
        // THE IN-FLIGHT BELT, guest-side. The server holds the authoritative one (`UiHostCallGate`); this one
        // stops a runaway guest before it floods the network at all, which is cheaper for everyone and is the
        // difference between a contained bug and a visible one.
        if (state.inFlight >= UI_GUEST_BUDGETS.hostCallsInFlightMax) {
          using err = ctx.newError(`too many concurrent host calls (>${UI_GUEST_BUDGETS.hostCallsInFlightMax})`);
          deferred.reject(err);
          void deferred.settled.then(pump(ctx), pump(ctx));
          return deferred.handle;
        }
        const args = argHandles.map((handle) => ctx.dump(handle) as unknown);
        const callId = state.nextCallId++;
        state.inFlight += 1;
        state.pending.set(callId, {
          resolve: (json: string): void => {
            using parsed = callJsonParse(ctx, state.jsonParse, json);
            deferred.resolve(parsed);
          },
          reject: (message: string): void => {
            using err = ctx.newError(message);
            deferred.reject(err);
          },
        });
        post({ kind: "hostCall", callId, fn: `${namespace}.${method}`, argsJson: JSON.stringify(args) });
        // Pump the job queue when the promise settles so the guest continuation actually runs — the SYNC
        // variant schedules nothing on its own, which is the manual pumping the server's membrane does too.
        void deferred.settled.then(pump(ctx), pump(ctx));
        return deferred.handle;
      });
      ctx.setProp(ns, method, fn);
    }
    ctx.setProp(host, namespace, ns);
  }
  return host;
}

/** The job pump, guarded on liveness: a late settle against a disposed context is a use-after-free, and a
 *  fire-and-forget guest call can outlive the worker's teardown. */
function pump(ctx: QuickJSContext): () => void {
  return (): void => {
    if (ctx.alive) {
      ctx.runtime.executePendingJobs();
    }
  };
}

/** Parse a host result INSIDE the guest, through the realm's PRISTINE `JSON.parse`. The payload crosses as a
 *  string VALUE, never as source — the same reasoning as the server's `Sandbox.parseArgs`: an
 *  `evalCode("(" + json + ")")` spelling would EXECUTE a non-JSON payload in the guest realm, and would treat
 *  `__proto__` as the prototype setter rather than an own key. */
function callJsonParse(ctx: QuickJSContext, jsonParse: QuickJSHandle, json: string): QuickJSHandle {
  using arg = ctx.newString(json);
  const result = ctx.callFunction(jsonParse, ctx.undefined, arg);
  if (result.error) {
    result.error.dispose();
    return ctx.null;
  }
  return result.value;
}

async function boot(message: UiGuestBootMessage): Promise<void> {
  const module = await loadModule();
  // The WASM is loaded; the thread no longer needs a network and must not keep one (file header).
  for (const name of NETWORK_GLOBALS) {
    Reflect.deleteProperty(globalThis, name);
  }
  const ctx = module.newContext();
  ctx.runtime.setMemoryLimit(UI_GUEST_BUDGETS.memoryLimitBytes);
  // MANDATORY — see the budget constant. Without it deep recursion is a host crash, not a contained RangeError.
  ctx.runtime.setMaxStackSize(UI_GUEST_BUDGETS.maxStackBytes);
  const log = new LogRing();

  installRealm({ ctx, current: (): GuestState => state, grants: message.grants, log });
  // Capture `JSON.parse` HERE — after the realm, BEFORE any guest source runs — so a guest that later reassigns
  // `JSON.parse` cannot interpose on the host's marshalling of the next result.
  using jsonNamespace = ctx.getProp(ctx.global, "JSON");
  const jsonParse = ctx.getProp(jsonNamespace, "parse");

  const state: GuestState = {
    ctx,
    log,
    jsonParse,
    handler: null,
    pending: new Map(),
    surfaceIds: new Set(message.surfaceIds),
    nextCallId: 1,
    inFlight: 0,
  };
  guest = state;

  const failure = await runToSettlement(state, UI_GUEST_BUDGETS.bootCpuMs, () => ctx.evalCode(message.source, "plugin-ui.js"));
  post(failure === null ? { kind: "ready", ok: true } : { kind: "ready", ok: false, message: failure });
}

async function deliver(message: UiGuestEventMessage): Promise<void> {
  const state = guest;
  if (state === null || state.handler === null) {
    // No handler is NOT a failure: a guest may render once and never listen (a readout). Settling `ok:true`
    // keeps the host's wall-clock timer honest — a silent drop would look exactly like a hang.
    post({ kind: "settled", ok: true });
    return;
  }
  const argsJson = JSON.stringify({ surfaceId: message.surfaceId, event: message.event, values: message.values });
  using arg = callJsonParse(state.ctx, state.jsonParse, argsJson);
  const handler = state.handler;
  const failure = await runToSettlement(state, UI_GUEST_BUDGETS.eventCpuMs, () => state.ctx.callFunction(handler, state.ctx.undefined, arg));
  post(failure === null ? { kind: "settled", ok: true } : { kind: "settled", ok: false, message: failure });
}

/** Settle a host call the guest is parked on. A late result for a torn-down guest, or a callId nobody is
 *  waiting on, is DROPPED — never thrown: the host may have terminated and respawned between the two. */
function settleHostCall(message: Extract<UiGuestInbound, { kind: "hostResult" }>): void {
  const state = guest;
  const waiting = state?.pending.get(message.callId);
  if (state === null || state === undefined || waiting === undefined) {
    return;
  }
  state.pending.delete(message.callId);
  state.inFlight -= 1;
  if (message.ok) {
    waiting.resolve(message.resultJson);
    return;
  }
  waiting.reject(message.message);
}

globalThis.onmessage = (event: MessageEvent<UiGuestInbound>): void => {
  const message = event.data;
  if (message.kind === "boot") {
    void boot(message).catch((err: unknown) => {
      post({ kind: "ready", ok: false, message: err instanceof Error ? err.message : String(err) });
    });
    return;
  }
  if (message.kind === "event") {
    void deliver(message).catch((err: unknown) => {
      post({ kind: "settled", ok: false, message: err instanceof Error ? err.message : String(err) });
    });
    return;
  }
  settleHostCall(message);
};

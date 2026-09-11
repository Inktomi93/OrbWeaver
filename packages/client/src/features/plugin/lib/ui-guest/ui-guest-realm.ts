// ui-guest-realm — THE GUEST REALM half of the Tier-C client sandbox (plugin-ui-plane #679 U4, §4.6): the
// ambient-denial stubs, the injected seams, and everything `orb.ui(1)` hands a scripted plugin. Split out of
// `ui-guest.worker.ts` when that file passed the client size cap; the seam is a real one rather than a line
// count, and it is the same seam the server draws — `infra/plugin-host/realm.ts` builds the surface, and
// `sandbox.ts` drives it. This module BUILDS; the worker DRIVES.
//
// It exports `post` because the realm itself is a producer of outbound messages (`render`, `log`) and the
// worker is another — one `postMessage` spelling for both, so a future channel change has one site.
//
// The security posture lives at the sites below and is not re-summarised here; the worker's own header carries
// the whole-sandbox story.

import type { PluginLogLevel, UiProxyableHostFunction } from "@orb/contracts/plugin";
import { PLUGIN_LOG_LEVELS } from "@orb/contracts/plugin";
import { estimateTokens } from "@orb/kit/tokens";
import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";
import type { UiGuestBootMessage, UiGuestOutbound } from "#lib";
import { UI_GUEST_BUDGETS } from "#lib";

/** The ONE outbound channel — the realm's producers and the worker's driver share this spelling. */
export function post(message: UiGuestOutbound): void {
  globalThis.postMessage(message);
}

/** The bounded log ring — the client mirror of `realm.ts`'s `LogRing`. Bounded on BOTH axes, and an oversized
 *  line is CLAMPED rather than dropped: a truncated line still tells an operator what ran. */
export class LogRing {
  private lines = 0;
  private chars = 0;

  push(level: PluginLogLevel, message: string): void {
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

export interface GuestState {
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

/** THE INJECTED SEAMS — the guest's ONLY time and entropy, mirroring the server realm's `HostSeams`. Built
 *  from the values the HOST put in the boot message; the guest cannot reach `Date`/`Math.random` (the realm
 *  stubs both), and this worker reads neither.
 *
 *  The clock is `host wall clock at spawn + this thread's MONOTONIC elapsed`. `performance.now()` is a
 *  monotonic duration, not a wall clock — which is what makes it the right ingredient here and also why the
 *  DoS deadline reads it directly: a guest cannot move it, and no ambient calendar time enters the realm.
 *
 *  The PRNG is Park–Miller (`state = state * 48271 mod 2^31-1`), chosen for one reason beyond determinism: it
 *  is pure ARITHMETIC. The usual small PRNGs are built from `>>>`/`^`, which this codebase's lint bans, and the
 *  largest intermediate here (48271 × 2147483646 ≈ 1.04e14) sits far inside `Number.MAX_SAFE_INTEGER`, so the
 *  arithmetic is exact rather than approximately-exact. */
const PARK_MILLER_MULTIPLIER = 48_271;
const PARK_MILLER_MODULUS = 2_147_483_647;

export function makeSeams(message: UiGuestBootMessage): { readonly nowEpochMs: () => number; readonly nextRandom: () => number } {
  const originPerf = performance.now();
  // A seed of 0 (or a multiple of the modulus) is the generator's one fixed point — it would return 0 forever.
  // Folding into [1, m-1] is the standard guard, not a paranoia check: the host's seed is a raw 32-bit draw.
  let state = (Math.abs(Math.trunc(message.randomSeed)) % (PARK_MILLER_MODULUS - 1)) + 1;
  return {
    nowEpochMs: (): number => message.clockEpochMs + Math.round(performance.now() - originPerf),
    nextRandom: (): number => {
      state = (state * PARK_MILLER_MULTIPLIER) % PARK_MILLER_MODULUS;
      return state / PARK_MILLER_MODULUS;
    },
  };
}

/** The realm-install inputs, bundled — a named bag rather than five positionals (the house `AsyncFnSpec` /
 *  `PluginBelts` posture: a seam that gains inputs must not gain arity). */
interface RealmDeps {
  readonly ctx: QuickJSContext;
  /** Late-bound: the realm's closures need the state, and the state needs the realm installed first. */
  readonly current: () => GuestState;
  readonly grants: readonly string[];
  readonly log: LogRing;
  readonly seams: ReturnType<typeof makeSeams>;
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

/** Install `orb.ui(1)` — the ONE door, and the entire surface a scripted guest sees. */
export function installRealm(deps: RealmDeps): void {
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

  // THE INJECTED SEAMS (see `makeSeams`) — the guest's only time and entropy, both originating on the HOST.
  // The guest cannot reach `Date` or `Math.random` at all (stubbed above), and neither can this worker: the
  // determinism law is the server realm's, unchanged, and the same test seam pins it on both sides.
  using clock = ctx.newObject();
  using nowFn = ctx.newFunction("nowEpochMs", () => ctx.newNumber(deps.seams.nowEpochMs()));
  ctx.setProp(clock, "nowEpochMs", nowFn);
  ctx.setProp(surface, "clock", clock);

  using randomObj = ctx.newObject();
  using nextFn = ctx.newFunction("next", () => ctx.newNumber(deps.seams.nextRandom()));
  ctx.setProp(randomObj, "next", nextFn);
  ctx.setProp(surface, "random", randomObj);

  using logObj = ctx.newObject();
  // The ONE severity axis, iterated from the contracts tuple — a guest's `orb.ui(1).log.*` is exactly the
  // vocabulary `orb.host(1).log.*` gives the server guest, and a fourth level added there appears here for free.
  for (const level of PLUGIN_LOG_LEVELS) {
    using fn = ctx.newFunction(level, (msgHandle?: QuickJSHandle) => {
      log.push(level, msgHandle === undefined ? "" : ctx.getString(msgHandle));
    });
    ctx.setProp(logObj, level, fn);
  }
  ctx.setProp(surface, "log", logObj);

  // tokens.count(text) — the FREE token-count estimator (#788 F13), the client mirror of the server realm's
  // `orb.host(1).tokens.count`. `estimateTokens` is isomorphic kit, so the Tier-C guest estimates its OWN text
  // LOCALLY (host-side of the worker) with no round-trip — a pure, zero-reach utility that needs no capability and
  // no proxy, exactly like `clock`/`log`. A non-string arg estimates the empty string (0), the realm's fail-safe.
  using tokens = ctx.newObject();
  using countFn = ctx.newFunction("count", (textHandle?: QuickJSHandle) =>
    ctx.newNumber(estimateTokens(textHandle === undefined || ctx.typeof(textHandle) !== "string" ? "" : ctx.getString(textHandle))),
  );
  ctx.setProp(tokens, "count", countFn);
  ctx.setProp(surface, "tokens", tokens);

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
/** One proxied namespace's legal method names, DERIVED from the contracts tuple (#1442). The list below stays
 *  hand-spelled — that is the security posture above — but it is now constrained rather than free-form: a
 *  method here that is not a real `UI_PROXYABLE_HOST_FUNCTIONS` member fails `tsc`. Deliberately a SUBSET
 *  constraint, not a completeness one: under-listing costs a guest a call it can make server-side anyway,
 *  while over-listing would post a name the tuple never admitted. Before this, the map was
 *  `Record<string, readonly string[]>` and nothing anywhere — no gate, no test, no type — connected it to the
 *  tuple it claims to mirror, so a widened tuple silently left the client dialect behind. */
type MethodNameOf<T> = T extends `${string}.${infer M}` ? M : never;
type ProxyMethod<N extends string> = MethodNameOf<Extract<UiProxyableHostFunction, `${N}.${string}`>>;

const PROXY_NAMESPACES = {
  chat: ["listMessages", "getVariables"],
  variables: ["get", "set", "delete"],
  storage: ["get", "set", "compareAndSet", "delete", "list"],
} satisfies { readonly [N in "chat" | "variables" | "storage"]: readonly ProxyMethod<N>[] };

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
          // @orb-waive caught-failure-ownership(deferred.settled): both settle arms run the SAME pump(ctx) —
          // this is the manual job-queue pump the guest realm requires on any settle, not error swallowing; the
          // rejection itself already reached the guest's own promise via deferred.reject above. Ends if the two
          // arms ever diverge.
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
        // @orb-waive caught-failure-ownership(deferred.settled): both settle arms run the SAME pump(ctx) —
        // the required job-queue pump on any settle, not error swallowing; the reject/resolve handlers above
        // already deliver the outcome into the guest's own promise. Ends if the two arms ever diverge.
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
 *  fire-and-forget guest call can outlive the worker's teardown.
 *
 *  IT ARMS ITS OWN CPU BOUND (#784 F2, the client twin of #781). This pump runs a guest continuation OUTSIDE any
 *  invocation — a host call fired at boot (or in an event) can settle AFTER `ready`/`settled` cleared the host's
 *  wall and after `runToSettlement` removed the interrupt handler in its `finally`. Without a fresh handler here,
 *  a looping `.then` (`h.storage.get(k).then(() => { while(true){} })`) runs `executePendingJobs()` unbounded and
 *  PEGS the worker thread: the surface freezes on its last tree, and because no wall is armed for a settling host
 *  call, `reportUiCrash` never fires — the 3-strike auto-disable goes blind. So the pump installs a fresh
 *  `eventCpuMs` deadline against REAL monotonic time (mirroring `runToSettlement`), pumps, and removes it — a
 *  bounded continuation is a preempted job, not a crash, so the surface simply stops advancing rather than
 *  wedging. The host's `terminate()` remains the outer bound for a continuation that STOPS executing bytecode. */
function pump(ctx: QuickJSContext): () => void {
  return (): void => {
    if (!ctx.alive) {
      return;
    }
    const startMs = performance.now();
    ctx.runtime.setInterruptHandler(() => performance.now() - startMs > UI_GUEST_BUDGETS.eventCpuMs);
    try {
      ctx.runtime.executePendingJobs();
    } finally {
      ctx.runtime.removeInterruptHandler();
    }
  };
}

/** Parse a host result INSIDE the guest, through the realm's PRISTINE `JSON.parse`. The payload crosses as a
 *  string VALUE, never as source — the same reasoning as the server's `Sandbox.parseArgs`: an
 *  `evalCode("(" + json + ")")` spelling would EXECUTE a non-JSON payload in the guest realm, and would treat
 *  `__proto__` as the prototype setter rather than an own key. */
export function callJsonParse(ctx: QuickJSContext, jsonParse: QuickJSHandle, json: string): QuickJSHandle {
  using arg = ctx.newString(json);
  const result = ctx.callFunction(jsonParse, ctx.undefined, arg);
  if (result.error) {
    result.error.dispose();
    return ctx.null;
  }
  return result.value;
}

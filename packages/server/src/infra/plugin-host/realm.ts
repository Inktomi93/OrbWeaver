// Realm setup — the membrane's floor. A fresh QuickJSContext starts with the standard globals;
// this module turns it into a guest realm: ambient non-determinism is OVERWRITTEN with throwing stubs
// (Date / Math.random / performance — the runtime's three ambient time/entropy sources), and the ONLY thing
// installed is `orb`, whose single method `host(1)` returns the versioned surface. setTimeout / fetch /
// process / require are already absent from a bare QuickJS-ng context (spike-verified — no timers, no I/O, no
// ambient authority); they must stay absent. What a guest CAN still enumerate is an explicit ALLOW-LIST:
// "absent from a bare context" is not a property this file can
// assume, it must be asserted by name (that assumption is exactly how `performance` shipped live). The reviewed list
// and that assertion live in `tests/server/infra/plugin-host/realm.int.test.ts`, which a name added by a runtime
// upgrade turns red, and which also reads the injected clock and PRNG against the throwing stubs.
//
// SCOPE: the surface `orb.host(1)` returns is the DETERMINISM FLOOR only — clock/random/ids/log +
// version negotiation. The full `PluginHostV1` (chat/worldInfo/tools/net/…) is the membrane's contract
// and wiring; this spike proves the realm + seam-injection + version gate the rest hangs off.

import type { PluginLogLevel } from "@orb/contracts/plugin";
import { HostVersionError, PLUGIN_HOST_VERSIONS, PLUGIN_LOG_CHARS_MAX, PLUGIN_LOG_LEVELS, PLUGIN_LOG_LINES_MAX } from "@orb/contracts/plugin";
import type { IdSource } from "@orb/kit/ids";
import type { RandomSource } from "@orb/kit/macro";
import type { Clock } from "@orb/kit/time";
import { estimateTokens } from "@orb/kit/tokens";
import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";
import type { GuestMarshal } from "./marshal.ts";
import { GuestCallFailure } from "./marshal.ts";
import type { MembraneRuntime } from "./membrane.ts";
import { attachMembrane } from "./membrane.ts";

/** The deterministic seams the host injects — the guest's ONLY time/entropy/id sources (README law,
 *  Spine-Testing §3). Bound at compose to the SAME injected seams production uses; a frozen test
 *  clock here makes two runs byte-identical without touching the DoS deadline (which reads real time). */
export interface HostSeams {
  /** Injected wall clock, epoch ms — the guest's `orb.host(1).clock.nowEpochMs()`. */
  readonly nowEpochMs: Clock;
  /** Injected PRNG, [0, 1) — the guest's `orb.host(1).random.next()`. */
  readonly nextRandom: RandomSource;
  /** Injected opaque-uniqueness id factory — the guest's `orb.host(1).ids.mint()` (NOT a TypeID). */
  readonly mintId: IdSource["uuid"];
}

// The guest log levels ARE the contract's `PluginLogLevel` set (`@orb/contracts/plugin` — the ONE home the
// domain's `PluginLogView.level` + this ring share; no re-spelled tuple).
const LOG_LEVELS = PLUGIN_LOG_LEVELS;

/** A per-line mirror the host may attach to a ring (a structural-injection port, the `AssetInspector` shape):
 *  `mirror` is called for every ACCEPTED (post-cap, post-clamp) line at PUSH time — the moment the guest writes
 *  it, not the moment something drains it. This is how a guest line reaches the process-wide pino stream (file
 *  log + the `/api/_debug/logs` ring) with no read in the path, including lines a floated continuation writes
 *  between invocations. Never throws back into the guest: the port's impl is a plain call on the root's logger. */
export interface LogMirror {
  readonly mirror: (level: PluginLogLevel, message: string) => void;
}

/** The per-DRAIN log ring — bounded by line count AND volume; overflow drops silently (the guest cannot DoS
 *  the host log by flooding). `drain()` is DESTRUCTIVE: it hands back every line pushed since the previous
 *  drain and empties the ring (budget included), so an invocation's outcome carries its own lines and a
 *  floated continuation's later lines wait for the NEXT drain instead of being thrown away — the old
 *  `reset()` at invocation start destroyed exactly those. There is no reset any more: every reader
 *  is a drain, and every drained line is retained by `port`'s runtime ring.
 *
 *  The volume bound is HARD, including for one line: an oversized message is CLAMPED to what is left of the
 *  budget rather than admitted whole. The check-then-push-anything shape it replaces let a single guest line
 *  carry the whole 32 MiB instance heap past a ring documented as 16 KiB — harmless while every drain was
 *  discarded, but `port`'s runtime ring now RETAINS drained lines, and a retained 32 MiB line is exactly the
 *  unbounded per-instance allocation the in-flight cap repair closed elsewhere. The bound is therefore per
 *  DRAIN INTERVAL: a chatty float between two invocations is capped like an invocation is. */
export class LogRing {
  private readonly lines: string[] = [];
  private bytes = 0;
  private readonly mirror: LogMirror | undefined;

  constructor(mirror?: LogMirror) {
    this.mirror = mirror;
  }

  push(level: PluginLogLevel, message: string): void {
    if (this.lines.length >= PLUGIN_LOG_LINES_MAX || this.bytes >= PLUGIN_LOG_CHARS_MAX) {
      return;
    }
    const line = `[${level}] ${message}`;
    // Clamped, not refused: a truncated line still tells an operator WHAT ran. Accounting is in UTF-16 code
    // units — the unit a JS string actually costs, and ≥ 1 UTF-8 byte each (conservative for a memory bound).
    const clamped = line.length <= PLUGIN_LOG_CHARS_MAX - this.bytes ? line : line.slice(0, PLUGIN_LOG_CHARS_MAX - this.bytes);
    this.bytes += clamped.length;
    this.lines.push(clamped);
    // The mirror sees the SAME clamped text the ring keeps (never the raw message): what the central log
    // shows is what the plugin log shows, and the ring's volume cap is the mirror's volume cap.
    this.mirror?.mirror(level, clamped.slice(level.length + "[] ".length));
  }

  /** Every line pushed since the last drain, oldest-first — and the ring is EMPTY afterwards (see the class
   *  note: destructive by design, so a floated continuation's lines are attributed, never destroyed). */
  drain(): readonly string[] {
    const lines = [...this.lines];
    this.lines.length = 0;
    this.bytes = 0;
    return lines;
  }
}

// THE AMBIENT TIME/ENTROPY DENIAL. Every name here is one a bare quickjs-ng context ships with and a guest
// could otherwise read WITHOUT a capability. `performance` is the one that shipped live for a while: the file
// header claimed Date/Math.random were "the only time/entropy sources" while `performance.now()` returned a
// real, monotonic, sub-microsecond clock (measured: 13.469463999999789, and a 2 M-iteration loop moved it).
// That is a D46 determinism-law violation (clock/PRNG/ids reach the guest ONLY via injected host functions —
// two runs under identical injected seams were not byte-identical), an entropy source that defeats the
// injected PRNG, and a precise timer for measuring the DoS deadline and for timing side-channels inside a
// WASM module whose linear memory every plugin context shares. The stub keeps the NAME (feature-detectable)
// and kills the reading; `timeOrigin` is dropped with it. A FUTURE quickjs-ng bump that adds `crypto` /
// `Temporal` / `Atomics` needs the same stub.
//
// EXPORTED so a realm-faithful GUEST harness can evaluate the SAME denial text in a bare
// `node:vm` context: the card-atlas offline harness once "proved the adapters correct" against a stub realm
// with a live `Date`, and `Date` was exactly the axis the real realm diverged on. One home for the denial —
// a harness that imports it cannot drift from the realm it stands in for.
export const AMBIENT_STUBS = `
  (() => {
    const die = (name) => () => {
      throw new Error(name + " is disabled in the plugin sandbox — use orb.host(1).clock / .random for deterministic time and entropy");
    };
    const D = die("Date"); D.now = die("Date.now"); D.parse = die("Date.parse"); D.UTC = die("Date.UTC");
    globalThis.Date = D;
    Math.random = die("Math.random");
    globalThis.performance = { now: die("performance.now") };
  })();
`;

/** What the realm's host functions run against: the injected seams, the instance's log ring and the context's
 *  marshal, every value crossing through the last. */
export interface RealmHost {
  readonly seams: HostSeams;
  readonly log: LogRing;
  readonly marshal: GuestMarshal;
}

// The text a log line or a token count takes from a guest value. The contract takes a string, which reads whole
// through the marshal; another primitive reads as its own text, which runs no guest code. An object or a function
// reads as its kind alone: its text would come from its `toString` or its getters, guest code a host read must not
// run (D346), and dumping it here would have no depth guard. `null` reads as an object too: this engine build offers
// no equality check to tell it apart without a read.
function logText(ctx: QuickJSContext, marshal: GuestMarshal, handle: QuickJSHandle): string {
  const type = ctx.typeof(handle);
  if (type === "function" || type === "object") {
    return `[${type}]`;
  }
  const read = marshal.fromGuest(handle);
  switch (read.kind) {
    case "value":
      return typeof read.value === "string" ? read.value : String(read.value);
    case "thrown":
      throw new GuestCallFailure(read.error);
    // Only a primitive reaches this read, and a primitive is never a promise.
    case "promise":
      return "";
    default: {
      const exhaustive: never = read;
      throw new Error(`plugin realm: unknown guest read ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Build the host surface fresh (clean handle ownership — a plugin calls host(1) once). Every leaf host fn
 *  bridges to an injected seam or the log ring; the returned object handle transfers to the VM. When a
 *  `membrane` is supplied, the capability-gated namespaces (chat/variables/worldInfo/imagery/tools + `grants`)
 *  are attached onto the same surface (membrane.ts) — else it is the determinism-floor-only shape. */
function buildHostSurface(ctx: QuickJSContext, { seams, log, marshal }: RealmHost, membrane: MembraneRuntime | undefined): QuickJSHandle {
  const surface = ctx.newObject();

  ctx.setProp(surface, "version", ctx.newNumber(1));

  // Every intermediate handle below is `using` (quickjs-emscripten's `Lifetime` IS a `Disposable` — it extends
  // `UsingDisposable`, whose `[Symbol.dispose]` calls `.dispose()`), so the ownership discipline is declarative
  // and holds through a mid-build throw. `setProp` DUPs the value into the target, so a handle freed at scope
  // exit rather than immediately after its `setProp` is refcount-identical — only `surface` (the return) is
  // hand-owned. Scope-exit order is REVERSE-declaration = inner-fn-before-its-object, exactly the order the
  // hand-written disposals used.
  using clock = ctx.newObject();
  using nowFn = marshal.newHostFunction("nowEpochMs", () => ctx.newNumber(seams.nowEpochMs()));
  ctx.setProp(clock, "nowEpochMs", nowFn);
  ctx.setProp(surface, "clock", clock);

  using random = ctx.newObject();
  using nextFn = marshal.newHostFunction("next", () => ctx.newNumber(seams.nextRandom()));
  ctx.setProp(random, "next", nextFn);
  ctx.setProp(surface, "random", random);

  using ids = ctx.newObject();
  using mintFn = marshal.newHostFunction("mint", () => marshal.newHostString(seams.mintId()));
  ctx.setProp(ids, "mint", mintFn);
  ctx.setProp(surface, "ids", ids);

  using logObj = ctx.newObject();
  for (const level of LOG_LEVELS) {
    using fn = marshal.newHostFunction(level, (msgHandle?: QuickJSHandle) => {
      log.push(level, msgHandle === undefined ? "" : logText(ctx, marshal, msgHandle));
    });
    ctx.setProp(logObj, level, fn);
  }
  ctx.setProp(surface, "log", logObj);

  // tokens.count(text) — a FREE (always-granted) namespace: the pure, isomorphic `estimateTokens` engine
  // computed host-side. Zero reach — a deterministic function of the guest's OWN string — so it needs
  // no capability and sits beside `log` in the determinism/utility floor. A non-string arg is estimated as the
  // empty string (0), the fail-safe projection the rest of this realm uses rather than a throw.
  using tokens = ctx.newObject();
  using countFn = marshal.newHostFunction("count", (textHandle?: QuickJSHandle) =>
    ctx.newNumber(estimateTokens(textHandle === undefined || ctx.typeof(textHandle) !== "string" ? "" : logText(ctx, marshal, textHandle))),
  );
  ctx.setProp(tokens, "count", countFn);
  ctx.setProp(surface, "tokens", tokens);

  if (membrane !== undefined) {
    attachMembrane(ctx, surface, membrane);
  }

  return surface;
}

/** Turn a bare context into a guest realm: overwrite ambient non-determinism, install the frozen `orb`
 *  entry. After this the guest global holds exactly `orb` (+ the standard ECMAScript intrinsics minus
 *  Date/Math.random). `log` is the instance's ONE ring — every `orb.host(1).log.*` call from any span of
 *  guest execution (an invocation or a post-settle job pump) lands in it. Returns nothing — mutation is the
 *  effect. */
export function installRealm(ctx: QuickJSContext, host: RealmHost, membrane?: MembraneRuntime): void {
  const stubResult = ctx.evalCode(AMBIENT_STUBS);
  if (stubResult.error) {
    using failure = stubResult.error;
    // No guest code has run yet, so the exception is the engine's own Error object, which reads as a value.
    const read = host.marshal.fromGuest(failure);
    throw new Error(`plugin realm ambient-stub install failed: ${JSON.stringify(read.kind === "value" ? read.value : read.kind)}`);
  }
  stubResult.value.dispose();

  using orb = ctx.newObject();
  using hostFn = host.marshal.newHostFunction("host", (majorHandle?: QuickJSHandle) => {
    // A number reads with no guest code; anything else would run its `valueOf` (D346), and is no version anyway.
    const major = majorHandle !== undefined && ctx.typeof(majorHandle) === "number" ? ctx.getNumber(majorHandle) : Number.NaN;
    if (!PLUGIN_HOST_VERSIONS.some((served) => served === major)) {
      // Throw the TYPED class (not a plain Error) so `.name` crosses the boundary as "HostVersionError" — a
      // guest feature-detects by `e.name`; the message names the served versions.
      throw new HostVersionError(major, PLUGIN_HOST_VERSIONS);
    }
    return buildHostSurface(ctx, host, membrane);
  });
  ctx.setProp(orb, "host", hostFn);
  ctx.setProp(ctx.global, "orb", orb);
}

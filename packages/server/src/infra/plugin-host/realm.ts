// Realm setup — the membrane's floor (01 §1). A fresh QuickJSContext starts with the standard globals;
// this module turns it into a guest realm: ambient non-determinism is OVERWRITTEN with throwing stubs
// (Date / Math.random — the only time/entropy sources), and the ONLY thing installed is `orb`, whose
// single method `host(1)` returns the versioned surface. setTimeout / fetch / process / require are
// already absent from a bare QuickJS-ng context (spike-verified — no timers, no I/O, no ambient
// authority); the escape suite (04 P4/P6) pins that they stay absent.
//
// P1 SCOPE: the surface `orb.host(1)` returns is the DETERMINISM FLOOR only — clock/random/ids/log +
// version negotiation. The full `PluginHostV1` (chat/worldInfo/tools/net/… — 01 §2) is P2's contract +
// P4's wiring; this spike proves the realm + seam-injection + version gate the rest hangs off.

import type { PluginLogLevel } from "@orb/contracts/plugin";
import { HostVersionError, PLUGIN_LOG_LEVELS } from "@orb/contracts/plugin";
import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";
import { LOG_BYTES_PER_INVOCATION, LOG_LINES_PER_INVOCATION } from "./budgets";
import type { MembraneRuntime } from "./membrane";
import { attachMembrane } from "./membrane";

/** The deterministic seams the host injects — the guest's ONLY time/entropy/id sources (README law,
 *  `test-determinism` gate). Bound at compose to the SAME injected seams production uses; a frozen test
 *  clock here makes two runs byte-identical without touching the DoS deadline (which reads real time). */
export interface HostSeams {
  /** Injected wall clock, epoch ms — the guest's `orb.host(1).clock.nowEpochMs()`. */
  readonly nowEpochMs: () => number;
  /** Injected PRNG, [0, 1) — the guest's `orb.host(1).random.next()`. */
  readonly nextRandom: () => number;
  /** Injected opaque-uniqueness id factory — the guest's `orb.host(1).ids.mint()` (NOT a TypeID). */
  readonly mintId: () => string;
}

// The guest log levels ARE the contract's `PluginLogLevel` set (`@orb/contracts/plugin` — the ONE home the
// domain's `PluginLogView.level` + this ring share; no re-spelled tuple).
const LOG_LEVELS = PLUGIN_LOG_LEVELS;
type LogLevel = PluginLogLevel;

/** Per-invocation log ring — bounded by line count AND byte volume (03 §3); overflow drops silently
 *  (the guest cannot DoS the host log by flooding). Drained into the invocation outcome. */
export class LogRing {
  private readonly lines: string[] = [];
  private bytes = 0;

  push(level: LogLevel, message: string): void {
    if (this.lines.length >= LOG_LINES_PER_INVOCATION || this.bytes >= LOG_BYTES_PER_INVOCATION) {
      return;
    }
    const line = `[${level}] ${message}`;
    this.bytes += line.length;
    this.lines.push(line);
  }

  drain(): readonly string[] {
    return [...this.lines];
  }

  /** Clear the ring for the next invocation (logs are per-invocation — 03 §3). */
  reset(): void {
    this.lines.length = 0;
    this.bytes = 0;
  }
}

const AMBIENT_STUBS = `
  (() => {
    const die = (name) => () => {
      throw new Error(name + " is disabled in the plugin sandbox — use orb.host(1).clock / .random for deterministic time and entropy");
    };
    const D = die("Date"); D.now = die("Date.now"); D.parse = die("Date.parse"); D.UTC = die("Date.UTC");
    globalThis.Date = D;
    Math.random = die("Math.random");
  })();
`;

/** Build the host surface fresh (clean handle ownership — a plugin calls host(1) once). Every leaf host fn
 *  bridges to an injected seam or the log ring; the returned object handle transfers to the VM. When a
 *  `membrane` is supplied, the P4b-CORE gated namespaces (chat/variables/worldInfo/imagery/tools + `grants`)
 *  are attached onto the same surface (membrane.ts) — else it is the determinism-floor-only P1 shape. */
function buildHostSurface(ctx: QuickJSContext, seams: HostSeams, log: LogRing, membrane: MembraneRuntime | undefined): QuickJSHandle {
  const surface = ctx.newObject();

  ctx.setProp(surface, "version", ctx.newNumber(1));

  const clock = ctx.newObject();
  const nowFn = ctx.newFunction("nowEpochMs", () => ctx.newNumber(seams.nowEpochMs()));
  ctx.setProp(clock, "nowEpochMs", nowFn);
  nowFn.dispose();
  ctx.setProp(surface, "clock", clock);
  clock.dispose();

  const random = ctx.newObject();
  const nextFn = ctx.newFunction("next", () => ctx.newNumber(seams.nextRandom()));
  ctx.setProp(random, "next", nextFn);
  nextFn.dispose();
  ctx.setProp(surface, "random", random);
  random.dispose();

  const ids = ctx.newObject();
  const mintFn = ctx.newFunction("mint", () => ctx.newString(seams.mintId()));
  ctx.setProp(ids, "mint", mintFn);
  mintFn.dispose();
  ctx.setProp(surface, "ids", ids);
  ids.dispose();

  const logObj = ctx.newObject();
  for (const level of LOG_LEVELS) {
    const fn = ctx.newFunction(level, (msgHandle?: QuickJSHandle) => {
      log.push(level, msgHandle === undefined ? "" : ctx.getString(msgHandle));
    });
    ctx.setProp(logObj, level, fn);
    fn.dispose();
  }
  ctx.setProp(surface, "log", logObj);
  logObj.dispose();

  if (membrane !== undefined) {
    attachMembrane(ctx, surface, membrane);
  }

  return surface;
}

/** The host majors this runtime serves (01 §3 — V1 only today). `orb.host(major)` throws the typed
 *  `HostVersionError{requested, served}` for anything else; the CLASS NAME crosses the boundary so a guest's
 *  activation can `catch (e) { e.name === "HostVersionError" }` — feature-detection by type, not by message
 *  substring (the D46 "fails loudly on V2" clause, made a typed contract). */
const SERVED_HOST_MAJORS = [1] as const;

/** Turn a bare context into a guest realm: overwrite ambient non-determinism, install the frozen `orb`
 *  entry. After this the guest global holds exactly `orb` (+ the standard ECMAScript intrinsics minus
 *  Date/Math.random). Returns nothing — mutation is the effect. */
export function installRealm(ctx: QuickJSContext, seams: HostSeams, log: LogRing, membrane?: MembraneRuntime): void {
  const stubResult = ctx.evalCode(AMBIENT_STUBS);
  if (stubResult.error) {
    const dump = ctx.dump(stubResult.error);
    stubResult.error.dispose();
    throw new Error(`plugin realm ambient-stub install failed: ${JSON.stringify(dump)}`);
  }
  stubResult.value.dispose();

  const orb = ctx.newObject();
  const hostFn = ctx.newFunction("host", (majorHandle?: QuickJSHandle) => {
    const major = majorHandle === undefined ? Number.NaN : ctx.getNumber(majorHandle);
    if (major !== 1) {
      // Throw the TYPED class (not a plain Error) so `.name` crosses the boundary as "HostVersionError" — a
      // guest feature-detects by `e.name`, and `served` rides along as data (01 §3).
      throw new HostVersionError(major, SERVED_HOST_MAJORS);
    }
    return buildHostSurface(ctx, seams, log, membrane);
  });
  ctx.setProp(orb, "host", hostFn);
  hostFn.dispose();
  ctx.setProp(ctx.global, "orb", orb);
  orb.dispose();
}

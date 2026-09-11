// The CONSOLE-ERROR RING (#1095) — the dev-only capture of everything the browser reports as broken:
// `console.error` calls, uncaught `error` events, and unhandled promise rejections. It exists because
// NOTHING in this client held them before: a caught RENDER error reaches the server (lib/client-error-report.ts
// → the `clientError` procedure → the pino ring → `/api/_debug/errors`), but a bare `console.error`, a
// listener that threw, or a rejected promise landed only in a devtools panel nobody was reading. The bug-report
// button's whole premise is "the owner clicks a button and the evidence is already collected", and this was the
// one bundle source that did not exist.
//
// ERRORS ONLY, DELIBERATELY. `console.warn` is this app's INSTRUMENT voice — the `[anim]`/`[css]`/`[cls]`/
// `[frame]` channels all warn, several times per navigation — so a warn ring would be a lossy second copy of
// `__orb.flags()` + `__orb.motion()` that pushed the real errors out of a shared cap. Those channels have their
// own pull-side reads; this one owns the signal that had none.
//
// WALL-CLOCK BY CONSTRUCTION. `at` is epoch ms (`performance.timeOrigin + performance.now()`, the `bus-devlog.ts`
// spelling), not the `performance.now()` offsets `motion-flaggers`/`motion-stats` record — a bug report's time
// window is stated in wall-clock minutes and a ring that cannot be compared to it is not window-filterable.
//
// THE CAP TALLIES ITS DROPS. `dropped` counts entries evicted since the last reset, so a reader can never mistake
// "the last 128 errors" for "every error" — a truncated buffer that reads complete is the lie this instrument
// exists to prevent.
//
// Dev-only by construction: installed from agent-bridge.ts, which early-returns when !IS_DEV. Never re-export
// from the lib barrel (that would drag it into the prod bundle).

const RING_CAP = 128;
const TEXT_MAX = 2000;
const ARG_MAX = 12;

/** One recorded browser-side failure, as `__orb.consoleErrors()` returns it. Module-local by design: the
 *  ring and its `__orb` projection are the only readers, so the interface is not exported — a name nothing
 *  outside this file spells is not part of the client's surface (#1847). */
interface ConsoleErrorRecord {
  /** Which surface reported it: a `console.error` call, an uncaught error event, or a rejected promise. */
  readonly source: "console" | "uncaught" | "rejection";
  /** Wall-clock epoch ms at the record (`performance.timeOrigin + performance.now()`). */
  readonly at: number;
  /** The formatted message — every argument stringified and joined, capped. */
  readonly text: string;
  /** The stack, where the reported value carried one. */
  readonly stack?: string;
  /** `globalThis.location.pathname` at the record — which surface was mounted. */
  readonly route: string;
}

interface ConsoleErrorRing {
  readonly records: readonly ConsoleErrorRecord[];
  /** Records evicted by the cap since the last reset. `0` ⇒ `records` is every error of this session. */
  readonly dropped: number;
  readonly cap: number;
}

const ring: ConsoleErrorRecord[] = [];
let dropped = 0;
let installed = false;

function clockMs(): number {
  return performance.timeOrigin + performance.now();
}

/** The values `JSON.stringify` cannot represent — it returns `undefined` for the first three (a fact its
 *  `string` return type hides) and THROWS on a bigint. `String()` is the right rendering for all four. */
const UNSTRINGIFIABLE_TYPES: ReadonlySet<string> = new Set(["undefined", "function", "symbol", "bigint"]);

/** Stringify ONE console argument without throwing on a cycle, a BigInt, or a getter that blows up. */
function describe(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  if (UNSTRINGIFIABLE_TYPES.has(typeof value)) {
    return String(value);
  }
  // @orb-waive caught-failure-ownership(catch): an unstringifiable console argument degrades to a
  // placeholder label — this is dev instrumentation and the record's other fields still carry the report. Ends if
  // this output ever feeds a data path rather than a bug-report bundle.
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

/** `globalThis.location.pathname`, or `""` where there is no document.
 *
 *  The `Location | undefined` annotation is a statement of FACT, not a cast to quiet a linter: `lib.dom` types
 *  `location` as always-present, and the node unit lane that drives `recordConsoleError` directly has none. */
function currentPathname(): string {
  return typeof globalThis.location === "undefined" ? "" : globalThis.location.pathname;
}

function firstStack(args: readonly unknown[]): string | undefined {
  const carrier = args.find((arg): arg is Error => arg instanceof Error && arg.stack !== undefined);
  return carrier?.stack?.slice(0, TEXT_MAX);
}

function push(record: ConsoleErrorRecord): void {
  ring.push(record);
  if (ring.length > RING_CAP) {
    ring.shift();
    dropped += 1;
  }
}

/** Record one failure. Exported for the install hooks below AND as the seam a spec drives — recording is the
 *  whole behaviour, and the browser events that trigger it are not reproducible in a node unit lane.
 *
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export function recordConsoleError(source: ConsoleErrorRecord["source"], args: readonly unknown[]): void {
  const stack = firstStack(args);
  push({
    source,
    at: Math.round(clockMs()),
    text: args.slice(0, ARG_MAX).map(describe).join(" ").slice(0, TEXT_MAX),
    ...(stack === undefined ? {} : { stack }),
    route: currentPathname(),
  });
}

/** The ring + its drop tally — `window.__orb.consoleErrors()`. Returns a COPY of the records: the live array is
 *  mutated in place by the cap, so a caller that held the reference (the bug-report bundle does) would otherwise
 *  serialize whatever the array became, not what it read. */
export function consoleErrorRing(): ConsoleErrorRing {
  return { records: [...ring], dropped, cap: RING_CAP };
}

/** Clear the ring and its drop tally (`__reset<Noun>` per the test-seam convention). Checkpoint-scoped
 *  evidence, so `__orb.resetEvidence()` sweeps it with the rest. */
export function __resetConsoleErrors(): void {
  ring.length = 0;
  dropped = 0;
}

/** Install the three capture channels. Idempotent; no-op outside a browser so a node import can never throw.
 *  The original `console.error` is CHAINED, never replaced — an instrument that swallowed the devtools output
 *  it mirrors would be a strictly worse console. */
export function installConsoleErrorRing(): void {
  if (installed || typeof globalThis.addEventListener !== "function") {
    return;
  }
  installed = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]): void => {
    recordConsoleError("console", args);
    original(...args);
  };
  globalThis.addEventListener("error", (event: ErrorEvent): void => {
    recordConsoleError("uncaught", [event.error ?? event.message]);
  });
  globalThis.addEventListener("unhandledrejection", (event: PromiseRejectionEvent): void => {
    recordConsoleError("rejection", [event.reason]);
  });
}

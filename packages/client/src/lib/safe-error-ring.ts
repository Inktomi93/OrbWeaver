// The production error ring behind "Report a bug": browser-reported failures, reduced AT RECORD TIME to fields
// that cannot carry chat text or credentials. It never keeps a message, an argument, a host or a query. The dev
// `console-error-ring.ts` keeps full text and ships in no production chunk; this one ships.

/** The browser surfaces a record can come from. */
const SAFE_ERROR_SOURCES = ["console", "uncaught", "rejection"] as const;
type SafeErrorSource = (typeof SAFE_ERROR_SOURCES)[number];

/** One recorded failure. `frames` are `function@/same-origin/path.js:line:col`; `section` is the app section
 *  the page was on (the first path segment), or `null`. */
export interface SafeErrorRecord {
  readonly source: SafeErrorSource;
  /** Wall-clock epoch ms. */
  readonly at: number;
  /** The error's class name (`TypeError`), or `null` for a value that is not an `Error`. */
  readonly errorType: string | null;
  readonly frames: readonly string[];
  readonly section: string | null;
}

/** The ring's read: records oldest-first, plus how many the cap evicted since the page loaded. */
export interface SafeErrorRingRead {
  readonly records: readonly SafeErrorRecord[];
  readonly dropped: number;
}

const RING_CAP = 32;
const FRAMES_MAX = 5;
/** A stack scanned past this many lines is not read further: the frames kept are the top ones. */
const STACK_LINES_MAX = 40;

const ERROR_TYPE_RE = /^[A-Za-z_$][\w$]{0,59}$/u;
const FUNCTION_NAME_RE = /^[\w$.<>[\]]{1,60}$/u;
const SAME_ORIGIN_PATH_RE = /^\/[\w./-]{1,160}$/u;
const SECTION_RE = /^[a-z][a-z0-9-]{0,31}$/u;
// A V8 frame (`at fn (url:1:2)`, `at url:1:2`) or a JavaScriptCore/SpiderMonkey frame (`fn@url:1:2`).
const V8_FRAME_RE = /^\s*at (?:(?<fn>\S+) \()?(?<url>\S+?):(?<line>\d+):(?<col>\d+)\)?$/u;
const AT_SIGN_FRAME_RE = /^(?<fn>[^@\s]*)@(?<url>\S+?):(?<line>\d+):(?<col>\d+)$/u;
const ANONYMOUS_FUNCTION = "?";

const ring: SafeErrorRecord[] = [];
let dropped = 0;
let installed = false;

/** The same-origin script path a frame URL names, or `null`: a frame from another origin, an extension or a
 *  blob names no file of ours, and its URL is the one thing in a frame that can identify a host. */
function framePath(url: string, origin: string): string | null {
  if (url.startsWith("/")) {
    return SAME_ORIGIN_PATH_RE.test(url) ? url : null;
  }
  if (!URL.canParse(url)) {
    return null;
  }
  const parsed = new URL(url);
  return parsed.origin === origin && SAME_ORIGIN_PATH_RE.test(parsed.pathname) ? parsed.pathname : null;
}

/** The top frames of a stack, each reduced to `function@path:line:col`. Frames outside this origin are left
 *  out, never shortened, so the result names only files this app serves.
 *  @public Test-anchored module surface; the reduction is pinned against hostile stacks. */
export function safeStackFrames(stack: string, origin: string): readonly string[] {
  const frames: string[] = [];
  for (const raw of stack.split("\n").slice(0, STACK_LINES_MAX)) {
    const groups = (V8_FRAME_RE.exec(raw) ?? AT_SIGN_FRAME_RE.exec(raw))?.groups;
    const path = groups === undefined ? null : framePath(groups["url"] ?? "", origin);
    if (groups !== undefined && path !== null) {
      const fn = groups["fn"] !== undefined && FUNCTION_NAME_RE.test(groups["fn"]) ? groups["fn"] : ANONYMOUS_FUNCTION;
      frames.push(`${fn}@${path}:${groups["line"]}:${groups["col"]}`);
    }
    if (frames.length === FRAMES_MAX) {
      break;
    }
  }
  return frames;
}

/** The app section a pathname is on: its first segment when that is a plain slug, else `null`. A deeper
 *  segment or a query is never read.
 *  @public Test-anchored module surface; the reduction is pinned against hostile paths. */
export function sectionOfPathname(pathname: string): string | null {
  const first = pathname.split("/")[1] ?? "";
  return SECTION_RE.test(first) ? first : null;
}

function clockMs(): number {
  return Math.round(performance.timeOrigin + performance.now());
}

/** The browser facts one recording reads, injectable so a node test drives the reduction with no DOM. */
interface RecordContext {
  readonly at: number;
  readonly origin: string;
  readonly pathname: string;
}

// DOM access rides `globalThis` with self-contained structural types (the `download-json.ts` pattern): this
// module is on the lib barrel, and the node typecheck lane follows the barrel here with no `dom` lib.
interface RingGlobals {
  readonly location?: { readonly origin: string; readonly pathname: string };
  readonly addEventListener?: (
    type: "error" | "unhandledrejection",
    listener: (event: { readonly error?: unknown; readonly reason?: unknown }) => void,
  ) => void;
}

const ringGlobals = globalThis as RingGlobals;

function liveContext(): RecordContext {
  return { at: clockMs(), origin: ringGlobals.location?.origin ?? "", pathname: ringGlobals.location?.pathname ?? "" };
}

/** Record one failure from the values a browser surface reported. Only an `Error` among them contributes,
 *  and only its class and its same-origin frames.
 *  @public Test-anchored module surface; the canary tests drive it directly. */
export function recordSafeError(source: SafeErrorSource, values: readonly unknown[], context: RecordContext = liveContext()): void {
  const error = values.find((value): value is Error => value instanceof Error);
  ring.push({
    source,
    at: context.at,
    errorType: error !== undefined && ERROR_TYPE_RE.test(error.name) ? error.name : null,
    frames: error?.stack === undefined ? [] : safeStackFrames(error.stack, context.origin),
    section: sectionOfPathname(context.pathname),
  });
  if (ring.length > RING_CAP) {
    ring.shift();
    dropped += 1;
  }
}

/** A copy of the ring and its drop tally. */
export function safeErrorRing(): SafeErrorRingRead {
  return { records: [...ring], dropped };
}

/** Clear the ring (`__reset<Noun>`, the test-seam convention). */
export function __resetSafeErrorRing(): void {
  ring.length = 0;
  dropped = 0;
}

/** Install the three capture channels once. The original `console.error` is chained, never replaced. */
export function installSafeErrorRing(): void {
  const listen = ringGlobals.addEventListener;
  if (installed || listen === undefined) {
    return;
  }
  installed = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]): void => {
    recordSafeError("console", args);
    original(...args);
  };
  listen.call(globalThis, "error", (event): void => {
    recordSafeError("uncaught", [event.error]);
  });
  listen.call(globalThis, "unhandledrejection", (event): void => {
    recordSafeError("rejection", [event.reason]);
  });
}

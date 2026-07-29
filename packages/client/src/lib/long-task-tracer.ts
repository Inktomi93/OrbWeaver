// Dev-only render-jank attribution: PerformanceObservers turn Chrome's generic scheduler violations
// into console lines naming the ROUTE, the ELEMENT (slow events), and — for long frames — the SCRIPT
// that caused them. Prefers the Long Animation Frames API (LoAF, Chrome M123+) over the deprecated
// `longtask` type: LoAF reports the whole janky frame WITH per-script attribution (invoker + source),
// which `longtask` (deprecated, attribution-free, and emitting a console deprecation notice per entry)
// cannot. Falls back to `longtask` only where LoAF is unsupported. Dynamically imported behind
// import.meta.env.DEV — never re-export from the lib barrel, that would drag it into the prod bundle.

import { logClock } from "./log-clock";

const LONG_FRAME_MS = 100;
const SLOW_EVENT_MS = 200;

const PERF_STYLE = "color:#c60;font-weight:bold";
const MUTED_STYLE = "color:#888";

/** LoAF shapes — lib.dom predates the Long Animation Frames API, so we narrow the entry structurally. */
interface LoafScript {
  readonly duration: number;
  readonly invoker?: string;
  readonly sourceURL?: string;
  readonly sourceFunctionName?: string;
  readonly name?: string;
}
interface LoafEntry extends PerformanceEntry {
  readonly blockingDuration?: number;
  readonly scripts?: readonly LoafScript[];
}

/** Basename of a source URL — the full dev URL (vite hashes, absolute paths) is noise in a log line. */
function basename(url: string): string {
  try {
    const { pathname } = new URL(url);
    return pathname.split("/").pop() ?? pathname;
  } catch {
    return url;
  }
}

/** The costliest script in a long frame as a compact "function · source · Nms" attribution — LoAF's payoff. */
function attributeFrame(scripts: readonly LoafScript[]): string {
  if (scripts.length === 0) {
    return "(no script attribution)";
  }
  const worst = scripts.reduce((a, b) => (b.duration > a.duration ? b : a));
  const who = worst.sourceFunctionName ?? worst.invoker ?? worst.name ?? "(anonymous)";
  const where = worst.sourceURL !== undefined && worst.sourceURL !== "" ? ` @ ${basename(worst.sourceURL)}` : "";
  return `${who}${where} ${Math.round(worst.duration)}ms`;
}

/** Compact CSS-selector-ish description of an event target for the log line. */
function describeTarget(target: Node | null): string {
  if (target === null || !(target instanceof Element)) {
    return "(detached)";
  }
  const tag = target.tagName.toLowerCase();
  const testId = target.getAttribute("data-testid");
  if (testId !== null) {
    return `<${tag} data-testid="${testId}">`;
  }
  const id = target.id;
  if (id !== "") {
    return `<${tag} id="${id}">`;
  }
  const cls = target.classList.item(0);
  return cls !== null ? `<${tag} class="${cls}…">` : `<${tag}>`;
}

function route(): string {
  return globalThis.location.pathname + globalThis.location.search;
}

/** Install the jank observers (idempotence is the caller's concern — main.tsx runs it exactly once). */
export function installLongTaskTracer(): void {
  if (typeof PerformanceObserver === "undefined") {
    return;
  }
  const supported = PerformanceObserver.supportedEntryTypes;

  // Prefer LoAF (attributed, not deprecated) — fall back to the coarse `longtask` type only where
  // LoAF is unavailable (Chrome < M123, Firefox, Safari). Never observe both: `longtask` emits a
  // per-entry "Deprecated API for given entry type" console notice, so we avoid it entirely on Chrome.
  if (supported.includes("long-animation-frame")) {
    const loaf = new PerformanceObserver((list) => {
      for (const raw of list.getEntries()) {
        const entry = raw as LoafEntry;
        if (entry.duration < LONG_FRAME_MS) {
          continue;
        }
        const blocking = Math.round(entry.blockingDuration ?? 0);
        console.warn(
          `%c${logClock()} [perf]%c long frame ${Math.round(entry.duration)}ms · blocking ${blocking}ms · ${attributeFrame(entry.scripts ?? [])} · route ${route()}`,
          PERF_STYLE,
          MUTED_STYLE,
        );
      }
    });
    // Plain cast (not `as any`, which would trip the suppression ratchet): lib.dom types the observe
    // init's `type` as string, so the LoAF entry-type string is valid — same cast the event observer uses below.
    loaf.observe({ type: "long-animation-frame", buffered: true } as PerformanceObserverInit);
  } else if (supported.includes("longtask")) {
    const lt = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < LONG_FRAME_MS) {
          continue;
        }
        console.warn(`%c${logClock()} [perf]%c long task ${Math.round(entry.duration)}ms · route ${route()}`, PERF_STYLE, MUTED_STYLE);
      }
    });
    lt.observe({ type: "longtask", buffered: true });
  }

  if (supported.includes("event")) {
    const ev = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < SLOW_EVENT_MS) {
          continue;
        }
        // PerformanceEventTiming, narrowed structurally: lib.dom types mixed-observer entries as base PerformanceEntry.
        const timing = entry as PerformanceEntry & {
          readonly name: string;
          readonly target?: Node | null;
        };
        console.warn(
          `%c${logClock()} [perf]%c slow ${timing.name} ${Math.round(entry.duration)}ms · ${describeTarget(timing.target ?? null)} · route ${route()}`,
          PERF_STYLE,
          MUTED_STYLE,
        );
      }
    });
    // Cast: lib.dom's PerformanceObserverInit hasn't picked up the Event Timing API's durationThreshold field.
    ev.observe({
      type: "event",
      buffered: true,
      durationThreshold: SLOW_EVENT_MS,
    } as PerformanceObserverInit);
  }
}

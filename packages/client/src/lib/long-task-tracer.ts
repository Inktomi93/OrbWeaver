// The `[perf]` channel's main-thread half — dev-only render-jank ATTRIBUTION (UI-Arch §2.1 lib/).
// Chrome's "[Violation] 'setTimeout' handler took Nms" lines point at React's scheduler, not at OUR
// code — useless for finding which surface is slow. This tracer turns the same signals into
// attributable console lines:
//   [perf] long task 612ms · route /chats/abc123
//   [perf] slow click 1583ms · <button data-testid="top-nav-characters"> · route /
// Two observers:
//   • `longtask` — any main-thread task > LONG_TASK_MS. Catches render passes, index builds, big
//     mounts. Attribution is the route (long tasks carry no target) — usually enough to know WHAT
//     just mounted.
//   • `event`    — Event Timing API, entries with duration > SLOW_EVENT_MS. Carries the event type
//     + target element, so slow click/input handlers name the element that owns them.
// DEV-ONLY BY CONSTRUCTION: dynamically imported from main.tsx behind the LITERAL
// `import.meta.env.DEV` (constant-folded → this module never ships in the prod bundle). NEVER
// re-export it from the lib barrel — that is the barrel-leak failure mode that would drag it into
// prod (and into the node types-lane program: this module needs lib.dom). Console is the right
// sink: a dev loupe, not telemetry. The component half of the loupe is render-profiler.tsx.

import { logClock } from "./log-clock";

const LONG_TASK_MS = 100;
const SLOW_EVENT_MS = 200;

const PERF_STYLE = "color:#c60;font-weight:bold";
const MUTED_STYLE = "color:#888";

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

/** Install both observers (idempotence is the caller's concern — main.tsx runs it exactly once). */
export function installLongTaskTracer(): void {
  if (typeof PerformanceObserver === "undefined") {
    return;
  }
  const supported = PerformanceObserver.supportedEntryTypes;

  if (supported.includes("longtask")) {
    const lt = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < LONG_TASK_MS) {
          continue;
        }
        console.warn(
          `%c${logClock()} [perf]%c long task ${Math.round(entry.duration)}ms · route ${route()}`,
          PERF_STYLE,
          MUTED_STYLE,
        );
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
        // PerformanceEventTiming — narrowed structurally (lib.dom types the entries of a mixed
        // observer as the base PerformanceEntry).
        const timing = entry as PerformanceEntry & {
          readonly name: string;
          readonly target?: Node | null;
        };
        console.warn(
          `%c${logClock()} [perf]%c slow ${timing.name} ${Math.round(entry.duration)}ms · ${describeTarget(
            timing.target ?? null,
          )} · route ${route()}`,
          PERF_STYLE,
          MUTED_STYLE,
        );
      }
    });
    // durationThreshold floors at 16ms in the spec; the loop filters again above. (Cast: lib.dom's
    // PerformanceObserverInit hasn't picked up the Event Timing API field yet — Chrome has shipped
    // it since M76.)
    ev.observe({
      type: "event",
      buffered: true,
      durationThreshold: SLOW_EVENT_MS,
    } as PerformanceObserverInit);
  }
}

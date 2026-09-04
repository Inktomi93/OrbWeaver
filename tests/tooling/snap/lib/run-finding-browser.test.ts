// The app's instrumentation console line, READ (#1372). Snap carried the whole `%c`-formatted string —
// terminal colour arguments included — as a finding's `what`, which made five ambient annotation rows
// 5.3 KB of a 17 KB `--map` run. This is the parse that replaced it, pinned on the exact shapes the
// client logger emits (captured from a live /chats run, 2026-09-04) plus the two ways it can be wrong.
import type { DiskSafeBrowserDiagnostic } from "../../../../tooling/src/snap/contract/browser-evidence-redaction.ts";
import { annotationOf, annotationText, diagnosticFindingDrafts } from "../../../../tooling/src/snap/lib/run-finding-console-annotation.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const FRAME = "%c10:54:40.830 [frame]%c long frame 153ms · blocking 103ms (budget 100ms) · @ main.tsx 147ms · route / color:#c60;font-weight:bold color:#888";
const PERF = "%c10:54:42.310 [perf]%c slow commit region:content 25ms (mount) color:#c60;font-weight:bold color:#888";
const DROP =
  "%c10:54:43.115 [drop]%c 70ms rendered frame mid-animation (budget 50ms) · aside[aria-label=Chats list] · [data-slot=theme-scope] · OVER BUDGET · route / color:#c00;font-weight:bold color:#888";

test("a measured line yields metric, value, budget and subject — and never its CSS arguments", () => {
  expect(annotationOf(FRAME)).toEqual({ tag: "frame", metric: "long frame", value: "153ms", budget: "100ms", subject: "@ main.tsx 147ms" });
  expect(annotationText(annotationOf(FRAME) ?? { tag: "", metric: "", value: null, budget: null, subject: null })).toBe(
    "frame long frame value=153ms budget=100ms subject=@ main.tsx 147ms",
  );
  // The value can lead the line, and the subject can be a selector.
  expect(annotationOf(DROP)).toMatchObject({ tag: "drop", value: "70ms", budget: "50ms", subject: "aside[aria-label=Chats list]" });
  for (const line of [FRAME, PERF, DROP]) {
    expect(annotationText(annotationOf(line) ?? { tag: "", metric: "", value: null, budget: null, subject: null })).not.toContain("color:#");
  }
});

test("a line with no budget and no separate subject states only what it measured", () => {
  expect(annotationOf(PERF)).toEqual({ tag: "perf", metric: "slow commit region:content", value: "25ms", budget: null, subject: null });
  expect(annotationText(annotationOf(PERF) ?? { tag: "", metric: "", value: null, budget: null, subject: null })).toBe(
    "perf slow commit region:content value=25ms",
  );
});

// #1385 item 4: a `FINDING error | ResizeObserver loop …` printed beside `RESULT console-errors=0` and
// exit 0, and nothing on the row said whether to file it. That pairing is not a contradiction —
// `console-errors` counts PAGE-CONSOLE errors and `page-errors` counts uncaught exceptions, while the
// diagnostics ring also carries browser-log lines, CDP audit issues and the app's own console ring. The
// deciding fact is `origin`, and the row now states it rather than leaving the reader to infer it.
/** The redaction receipt every disk-safe record carries — a real empty one, so the fixture is the
 *  contract's own shape rather than a cast past it. */
const NO_LIMITS = {
  policy: { maxDepth: 8, maxFields: 256, maxStringBytes: 4096, maxBodyBytes: 0, maxEntries: 128, maxUrlBytes: 2048 },
  events: [],
} satisfies DiskSafeBrowserDiagnostic["_orbMeasuredLimit"];

function diagnostic(over: Partial<DiskSafeBrowserDiagnostic>): DiskSafeBrowserDiagnostic {
  return {
    origin: "page-console",
    source: "console-api",
    level: "error",
    category: null,
    text: "boom",
    timestamp: 0,
    location: null,
    stack: null,
    requestId: null,
    issueCode: null,
    details: null,
    backendNodeId: null,
    contextIndex: 0,
    pageIndex: 0,
    evidenceWindow: 0,
    raw: null,
    _orbMeasuredLimit: NO_LIMITS,
    ...over,
  };
}

function dispositionOf(row: DiskSafeBrowserDiagnostic): { readonly counted: boolean; readonly reason: string } {
  const draft = diagnosticFindingDrafts("complete", [row], [], "/tmp/orb-run/run.json")[0];
  if (draft === undefined) {
    throw new Error("the diagnostic produced no draft — the fixture no longer reaches the drafting layer");
  }
  return draft.disposition;
}

test("a diagnostic states WHICH run counter it entered, keyed on its origin", () => {
  // The two that DO vote…
  expect(dispositionOf(diagnostic({ origin: "page-console", level: "error" }))).toEqual({ counted: true, reason: "console-errors" });
  expect(dispositionOf(diagnostic({ origin: "page-error", level: "error" }))).toEqual({ counted: true, reason: "page-errors" });
  // …and the origins that do not, each naming itself rather than a generic "excluded".
  expect(dispositionOf(diagnostic({ origin: "browser-log", level: "error" }))).toEqual({ counted: false, reason: "browser-log" });
  expect(dispositionOf(diagnostic({ origin: "audits", level: "error" }))).toEqual({ counted: false, reason: "audits" });
  expect(dispositionOf(diagnostic({ origin: "orb-console-ring", level: "error" }))).toEqual({ counted: false, reason: "orb-console-ring" });
  // A page-console WARNING is a different counter again (`console-warnings`, and only under --strict).
  expect(dispositionOf(diagnostic({ origin: "page-console", level: "warning" }))).toEqual({ counted: false, reason: "console-warning" });
});

test("an app INSTRUMENTATION line is attributed to its arm and never counted as a console error", () => {
  const row = diagnostic({ text: PERF, level: "warning" });

  expect(dispositionOf(row)).toEqual({ counted: false, reason: "react-profile-annotation" });
});

test("prose that merely mentions the same words is NOT an instrumentation line", () => {
  // The negative control: the grammar is the leading `%c<time> [tag]%c`, not the bracketed word. A
  // console.log about "[perf]" from application code must keep its own text rather than be re-typed.
  expect(annotationOf("a plain log line about [perf] budgets")).toBeNull();
  expect(annotationOf("%c[perf]%c missing the timestamp")).toBeNull();
});

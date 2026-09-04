// The app's instrumentation console line, READ (#1372). Snap carried the whole `%c`-formatted string —
// terminal colour arguments included — as a finding's `what`, which made five ambient annotation rows
// 5.3 KB of a 17 KB `--map` run. This is the parse that replaced it, pinned on the exact shapes the
// client logger emits (captured from a live /chats run, 2026-09-04) plus the two ways it can be wrong.
import { annotationOf, annotationText } from "../../../../tooling/src/snap/lib/run-finding-browser.ts";
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

test("prose that merely mentions the same words is NOT an instrumentation line", () => {
  // The negative control: the grammar is the leading `%c<time> [tag]%c`, not the bracketed word. A
  // console.log about "[perf]" from application code must keep its own text rather than be re-typed.
  expect(annotationOf("a plain log line about [perf] budgets")).toBeNull();
  expect(annotationOf("%c[perf]%c missing the timestamp")).toBeNull();
});

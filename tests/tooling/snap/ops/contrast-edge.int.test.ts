// THE BORDER ARM (#1346). WCAG 1.4.11 is a question about a BOUNDARY, and until this arm no flag answered
// it: `--contrast` measures the subject's ink, the fill arm measures its interior against the band outside,
// and on a bordered field sitting on the surface it fills with, the fill arm refused with
// `NO VERDICT (fill-only, undecodable) — … measure the specific edge` — a remedy naming a flag that did not
// exist (measured 2026-09-04 on `[aria-label="Search chats"]`; the reviewer hand-rolled luminance in
// `--eval` and got garbage off a transparent pane).
//
// NEW CAPABILITY, so this is a PLANTED-CONTROL proof rather than a red-first regression proof: there is no
// old behaviour to be red. It is stated in BOTH directions on purpose — a 1px border at ~1.3:1 must FAIL
// and its ~3.5:1 twin must PASS, on the same page, in the same run — because an arm that always failed (or
// always passed) would satisfy a one-directional test and tell a reviewer nothing.
//
// @instrument-proof: the failing and passing borders differ ONLY in border-color; a per-side sampler reading
// the wrong strip (the fill, the surround, the anti-aliased corner) cannot separate them.
import { chromium } from "@playwright/test";
import { measureEdgeContrast } from "../../../../tooling/src/snap/ops/contrast-edge.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(60_000);
const VIEWPORT = { width: 400, height: 320 } as const;

// On #ffffff: #e0e0e0 → ~1.29:1 (the invisible field border this arm exists to catch), #8a8a8a → ~3.54:1
// (over the 3:1 boundary), #ffffff → the same colour as the page, the worst case a reviewer must see named.
const FIXTURE = `
  <style>
    body { margin: 0; background: #ffffff; font: 16px system-ui; }
    div { width: 200px; height: 40px; margin: 24px; background: #ffffff; }
    #faint { border: 1px solid #e0e0e0; }
    #clear { border: 1px solid #8a8a8a; }
    #none  { border: 0; }
    #split { border: 1px solid #8a8a8a; border-bottom-color: #e0e0e0; }
  </style>
  <div id="faint"></div>
  <div id="clear"></div>
  <div id="none"></div>
  <div id="split"></div>
`;

test("a 1px border below 3:1 FAILS and its brighter twin PASSES, on the same page", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(FIXTURE);

    const faint = await measureEdgeContrast(page, "#faint", VIEWPORT);
    expect(faint.evidence).toMatchObject({ status: "ok", method: "edge-sample", passed: false, requiredRatio: 3 });
    expect(faint.evidence.ratio ?? 0).toBeGreaterThan(1.2);
    expect(faint.evidence.ratio ?? 0).toBeLessThan(1.4);
    expect(faint.outcome.failed).toBe(true);
    // The line names the colours a reviewer takes to the token vault, and which side carried the verdict.
    expect(faint.outcome.line).toContain("CONTRAST-EDGE #faint:");
    expect(faint.outcome.line).toContain("edge-sample");
    expect(faint.outcome.line).toContain("224,224,224");

    const clear = await measureEdgeContrast(page, "#clear", VIEWPORT);
    expect(clear.evidence).toMatchObject({ status: "ok", method: "edge-sample", passed: true });
    expect(clear.evidence.ratio ?? 0).toBeGreaterThan(3);
    expect(clear.outcome.failed).toBe(false);
  } finally {
    await browser.close();
  }
});

test("the WORST side carries the verdict, and a borderless subject is refused rather than passed", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(FIXTURE);

    // Three sides clear 3:1 and the bottom does not. A perimeter average would call this a pass; 1.4.11 is
    // violated by the one side a user cannot see.
    const split = await measureEdgeContrast(page, "#split", VIEWPORT);
    // THE CLASS is pinned, not the reason string (#1758): a `Page.captureScreenshot` protocol error under
    // contention is an INSTRUMENT fault (status "instrument-error", ops/contrast-edge.ts retries once and
    // still failed) — a DIFFERENT, honest no-verdict reason from this fixture's real per-side verdict
    // (status "ok", passed false). Both fail the run; only the measured happy path asserts the exact text.
    expect(["ok", "instrument-error"]).toContain(split.evidence.status);
    expect(split.outcome.failed).toBe(true);
    const splitReceipt =
      split.evidence.status !== "ok" ||
      (split.evidence.passed === false &&
        split.outcome.line.includes("worst side bottom") &&
        split.outcome.line.includes("top:") &&
        split.outcome.line.includes("bottom:"));
    expect(splitReceipt, `a measured verdict must name the worst side — ${split.outcome.line}`).toBe(true);

    // A subject with no border at all is a REFUSAL that names the right arm — never a silent pass, which is
    // what a "no failures found" edge check on a borderless element would read as.
    const none = await measureEdgeContrast(page, "#none", VIEWPORT);
    expect(none.evidence.ratio).toBeNull();
    expect(none.evidence.passed).toBeNull();
    expect(none.outcome.failed).toBe(true);
    expect(["refused", "instrument-error"]).toContain(none.evidence.status);
    const noneReceipt = none.evidence.status !== "refused" || (none.outcome.line.includes("no border on any side") && none.outcome.line.includes("--contrast"));
    expect(noneReceipt, `a domain refusal must name the missing border — ${none.outcome.line}`).toBe(true);

    // …and a selector that matches nothing says so instead of measuring the page.
    const missing = await measureEdgeContrast(page, "#absent", VIEWPORT);
    expect(missing.outcome.line).toContain("CONTRAST-EDGE #absent: NOT FOUND");
    expect(missing.outcome.failed).toBe(true);
  } finally {
    await browser.close();
  }
});

test("a page.screenshot() failure retries once, and a persisting failure is an instrument fault (#1758)", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(FIXTURE);
    const real = page.screenshot.bind(page);

    // A LONE transient failure — the shape a real `Protocol error (Page.captureScreenshot)` takes under
    // contention — recovers silently through the retry: the SAME per-side verdict as an unpatched run.
    let calls = 0;
    page.screenshot = (async (options) => {
      calls += 1;
      if (calls === 1) {
        throw new Error("Protocol error (Page.captureScreenshot): Target closed.");
      }
      return await real(options);
    }) as typeof page.screenshot;
    const recovered = await measureEdgeContrast(page, "#clear", VIEWPORT);
    expect(calls).toBe(2);
    expect(recovered.evidence.status).toBe("ok");
    expect(recovered.evidence.method).toBe("edge-sample");

    // A PERSISTENT failure (both attempts) is an INSTRUMENT fault — never folded into the "edge
    // unmeasurable" domain-refusal family, so a reason-string pin on that family cannot red on this CDP
    // message. The run still FAILS (never a silent green), and the line names the real capture error.
    page.screenshot = ((): Promise<never> => Promise.reject(new Error("Protocol error (Page.captureScreenshot): Target closed."))) as typeof page.screenshot;
    const persisted = await measureEdgeContrast(page, "#clear", VIEWPORT);
    expect(persisted.evidence.status).toBe("instrument-error");
    expect(persisted.evidence.ratio).toBeNull();
    expect(persisted.evidence.passed).toBeNull();
    expect(persisted.outcome.failed).toBe(true);
    expect(persisted.outcome.line).toContain("screenshot failed twice");
    expect(persisted.outcome.line).toContain("Protocol error (Page.captureScreenshot)");
  } finally {
    await browser.close();
  }
});

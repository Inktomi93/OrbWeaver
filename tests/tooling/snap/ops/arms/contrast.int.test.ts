// #953 instrument plant: the structured contrast door must distinguish one real framebuffer sample
// from the same selector population painted over by an unrelated layer.

import { chromium } from "@playwright/test";
import { captureContrastEvidence } from "../../../../../tooling/src/snap/ops/arms/contrast.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../_load-budget.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(60_000);
const VIEWPORT = { width: 400, height: 240 } as const;

test("structured contrast proves pixel sampling and refuses the same-count occluded twin", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(`
      <style>
        body { margin: 0; background: #050505; }
        p { width: 220px; margin: 48px; padding: 16px; color: #fff; background: rgba(20,20,20,.8); }
        .cover { position: fixed; inset: 0; background: #222; }
      </style>
      <p>Readable planted sample</p>
    `);
    const sampled = await captureContrastEvidence(page, ["p"], true, VIEWPORT);
    expect(sampled).toHaveLength(1);
    expect(sampled[0]?.evidence).toMatchObject({
      status: "ok",
      candidates: 1,
      inViewport: 1,
      sampled: 1,
      matchIndex: 0,
      method: "pixel-sample",
      passed: true,
    });

    // String-body evaluate — a node-world test cannot type an in-page callback (type-worlds #1351).
    await page.evaluate(`document.body.insertAdjacentHTML("beforeend", '<div class="cover"></div>')`);
    const occluded = await captureContrastEvidence(page, ["p"], true, VIEWPORT);
    expect(occluded).toHaveLength(1);
    expect(occluded[0]?.evidence).toMatchObject({ status: "refused", candidates: 1, inViewport: 1, sampled: 0, method: null, passed: null });
    expect(occluded[0]?.outcome.line).toContain("OCCLUDED");
  } finally {
    await browser.close();
  }
});

// #1005 — the WCAG 1.4.3 exemption must reach the ANCESTOR control. The label of a real disabled control
// is a CHILD element (`<button disabled><span>…</span></button>`), and the element-scoped classifier
// (`el.matches(":disabled")`) called that span "none" — so snap measured and reported a control it has
// always claimed to SKIP, on the same markup design-audit was filing P1s for. 3.45:1 is deliberately
// under AA's 4.5 (so a mis-classification is a visible FAIL line) and over 1.4.11's 3:1.
test("the label inside a disabled control is skipped as inactive, and its enabled twin is not", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(`
      <style>
        body { margin: 0; background: #fff; }
        button { display: block; margin: 16px; padding: 8px; width: 140px; height: 40px; background: #fff; border: 0; }
        span { color: #8a8a8a; font-size: 16px; }
      </style>
      <button disabled><span id="off">Pick one</span></button>
      <button><span id="on">Pick one</span></button>
    `);
    const inactive = await captureContrastEvidence(page, ["#off"], true, VIEWPORT);
    expect(inactive[0]?.outcome.line).toContain("SKIPPED");
    expect(inactive[0]?.outcome.line).toContain("inactive control");
    expect(inactive[0]?.outcome.failed).toBe(false);

    // The precision neighbour: the identical label under an ENABLED control is still measured and fails.
    const active = await captureContrastEvidence(page, ["#on"], true, VIEWPORT);
    expect(active[0]?.outcome.line).not.toContain("SKIPPED");
    expect(active[0]?.outcome.failed).toBe(true);
  } finally {
    await browser.close();
  }
});

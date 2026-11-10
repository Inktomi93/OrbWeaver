// #953 instrument plant: the structured contrast door must distinguish one real framebuffer sample
// from the same selector population painted over by an unrelated layer.

import { wcagContrastRatio } from "@orb/kit/theme-derivation";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/tooling";
import { chromium } from "@playwright/test";
import { captureContrastEvidence } from "../../../../../tooling/src/snap/ops/arms/contrast.ts";
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

// A half-black scrim paints over the ink and the sampled backdrop alike: #ccc on black is seen as #666 on black.
test("a pixel-sampled text under a translucent scrim is judged through the scrim", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(`
      <style>
        body { margin: 0; background: #000; }
        p { width: 220px; margin: 48px; color: #ccc; font-size: 14px; }
        .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); }
      </style>
      <p>Light caption under a modal scrim</p><div class="scrim"></div>
    `);
    const seen = 0x66;
    const expected = wcagContrastRatio({ r: seen, g: seen, b: seen }, { r: 0, g: 0, b: 0 });
    const [scrimmed] = await captureContrastEvidence(page, ["p"], true, VIEWPORT);
    expect(scrimmed?.evidence).toMatchObject({ status: "ok", method: "pixel-sample", passed: false });
    expect(scrimmed?.evidence.ratio).toBeCloseTo(expected, 1);
  } finally {
    await browser.close();
  }
});

// A css-resolved plate takes a scrim as a pixel sample does. Without a cover the plate's own ratio stands, and an
// opaque cover refuses the only match.
test("a css-resolved text under a translucent scrim is judged through the scrim", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(`
      <style>
        body { margin: 0; background: #fff; }
        .plate { width: 220px; margin: 24px; padding: 24px; background: #000; }
        p { margin: 0; color: #ccc; font-size: 14px; }
        .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); }
        .dialog { position: fixed; inset: 0; background: #222; }
      </style>
      <div class="plate"><p>Light caption on a black plate</p></div>
    `);
    const black = { r: 0, g: 0, b: 0 };
    const ink = 0xcc;
    const [bare] = await captureContrastEvidence(page, ["p"], false, VIEWPORT);
    expect(bare?.evidence).toMatchObject({ status: "ok", method: "css-resolve", passed: true });
    expect(bare?.evidence.ratio).toBeCloseTo(wcagContrastRatio({ r: ink, g: ink, b: ink }, black), 1);

    await page.evaluate(`document.body.insertAdjacentHTML("beforeend", '<div class="scrim"></div>')`);
    const seen = Math.round(0.5 * ink);
    const [scrimmed] = await captureContrastEvidence(page, ["p"], false, VIEWPORT);
    expect(scrimmed?.evidence).toMatchObject({ status: "ok", method: "css-resolve", passed: false });
    expect(scrimmed?.evidence.ratio).toBeCloseTo(wcagContrastRatio({ r: seen, g: seen, b: seen }, black), 1);

    await page.evaluate(`document.body.insertAdjacentHTML("beforeend", '<div class="dialog"></div>')`);
    const [hidden] = await captureContrastEvidence(page, ["p"], false, VIEWPORT);
    expect(hidden?.evidence).toMatchObject({ status: "refused", sampled: 0, method: null, passed: null });
    expect(hidden?.outcome.line).toContain("OCCLUDED");
  } finally {
    await browser.close();
  }
});

// The tint and the caption share the half group, which dims their composite once: the glyph is white under the white
// tint, shown at half over black, and the ring is the half tint alone, shown at half again.
test("a text under a tint in its own opacity group is judged at the composite the group shows", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(`
      <style>
        body { margin: 0; background: #000; }
        .wallpaper { position: fixed; inset: 0; z-index: -1; background-image: linear-gradient(#000, #000); }
        .group { position: relative; opacity: 0.5; width: 320px; padding: 24px; }
        p { margin: 0; color: #fff; font-size: 14px; }
        .tint { position: absolute; inset: 0; background: rgba(255, 255, 255, 0.5); }
      </style>
      <div class="wallpaper"></div><div class="group"><p>Caption in a half group</p><div class="tint"></div></div>
    `);
    const glyph = Math.round(0.5 * 0xff);
    const ring = Math.round(0.25 * 0xff);
    const [tinted] = await captureContrastEvidence(page, ["p"], true, VIEWPORT);
    expect(tinted?.evidence).toMatchObject({ status: "ok", method: "pixel-sample", passed: false });
    expect(tinted?.evidence.ratio).toBeCloseTo(wcagContrastRatio({ r: glyph, g: glyph, b: glyph }, { r: ring, g: ring, b: ring }), 1);
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
    expect(present(active[0]).outcome.line).not.toContain("SKIPPED");
    expect(active[0]?.outcome.failed).toBe(true);
  } finally {
    await browser.close();
  }
});

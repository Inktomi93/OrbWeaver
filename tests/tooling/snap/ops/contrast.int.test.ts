// #953 instrument plant: the structured contrast door must distinguish one real framebuffer sample
// from the same selector population painted over by an unrelated layer.

import { chromium } from "@playwright/test";
import { captureContrastEvidence } from "../../../../tooling/src/snap/ops/contrast.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const BROWSER_TIMEOUT_MS = 60_000;
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

    await page.locator("body").evaluate((body) => body.insertAdjacentHTML("beforeend", '<div class="cover"></div>'));
    const occluded = await captureContrastEvidence(page, ["p"], true, VIEWPORT);
    expect(occluded).toHaveLength(1);
    expect(occluded[0]?.evidence).toMatchObject({ status: "refused", candidates: 1, inViewport: 1, sampled: 0, method: null, passed: null });
    expect(occluded[0]?.outcome.line).toContain("OCCLUDED");
  } finally {
    await browser.close();
  }
});

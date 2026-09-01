// #953 instrument plant: a `many` subject's representative must come from the sampled population, not
// the first virtualized/off-viewport sibling that happened to match the same client-owned selector.

import { chromium } from "@playwright/test";
import type { RuntimeAppearanceHistoricalRow } from "../../../../tooling/src/_shared/appearance-matrix.ts";
import { probeAppearanceDom } from "../../../../tooling/src/snap/ops/appearance-invariant-dom.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const BROWSER_TIMEOUT_MS = 60_000;
const VIEWPORT = { width: 400, height: 240 } as const;

const ROW: RuntimeAppearanceHistoricalRow = {
  id: "hover-pointer",
  surface: "chat",
  subjects: [{ id: "sample", selector: ".sample", population: "many", sample: "geometry" }],
  cascade: [],
  merge: { mechanism: "merge-not-applicable", reason: "direct-carrier", selector: ".sample", owner: "fixture" },
  requiredChecks: [],
  optionalSubjectIds: [],
};

test("many-subject facts select a sampled representative", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(`
      <style>.sample { position: fixed; width: 80px; height: 40px; } .offscreen { left: -1000px; } .visible { left: 20px; top: 20px; }</style>
      <div class="sample offscreen"></div><div class="sample visible"></div>
    `);

    const snapshot = await probeAppearanceDom(page, ROW);
    expect(snapshot.subjects[0]).toMatchObject({
      accounting: { candidates: 2, reached: 2, sampled: 1, offViewport: 1 },
      matchIndex: 1,
      facts: { className: "sample visible" },
    });
  } finally {
    await browser.close();
  }
});

test("an opacity-zero control retains withheld facts without entering the sampled population", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent('<div class="sample" style="position:fixed;left:20px;top:20px;width:80px;height:40px;opacity:0;pointer-events:none"></div>');
    const snapshot = await probeAppearanceDom(page, ROW);
    expect(snapshot.subjects[0]).toMatchObject({
      accounting: { candidates: 1, reached: 0, sampled: 0, skipped: [{ reason: "opacity-zero", count: 1 }] },
      matchIndex: null,
      facts: null,
      withheldFacts: { style: { opacity: "0", pointerEvents: "none" }, rect: { width: 80, height: 40 } },
    });
  } finally {
    await browser.close();
  }
});

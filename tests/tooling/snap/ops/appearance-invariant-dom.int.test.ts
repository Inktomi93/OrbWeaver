// #953 instrument plant: a `many` subject's representative must come from the sampled population, not
// the first virtualized/off-viewport sibling that happened to match the same client-owned selector.

import { chromium } from "@playwright/test";
import type { RuntimeAppearanceHistoricalRow } from "../../../../tooling/src/_shared/appearance-matrix.ts";
import { probeAppearanceDom } from "../../../../tooling/src/snap/ops/appearance-invariant-dom.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(60_000);
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

// #2431 instrument plant: a subject whose selector names a PSEUDO CARRIER must be sampled ON THE CARRIER.
// `querySelectorAll` cannot select a pseudo, so the census answered `candidates: 0` for it, and
// `getComputedStyle(el)` with no second argument reads the HOST — which is how the shell row
// `light-art-scrim-glass-elevation` read `rgba(0, 0, 0, 0)/none` off a pane whose glass has lived on
// `::before` since #1154. The subject below is shaped exactly like that row's: the HOST paints nothing and
// the carrier paints the glass, so a reader still addressing the host cannot pass by accident.
const CARRIER_ROW: RuntimeAppearanceHistoricalRow = {
  id: "light-art-scrim-glass-elevation",
  surface: "shell",
  subjects: [{ id: "glass", selector: ".sample::before", population: "one", sample: "carrier" }],
  cascade: [],
  merge: { mechanism: "merge-not-applicable", reason: "direct-carrier", selector: ".sample::before", owner: "fixture" },
  requiredChecks: [],
  optionalSubjectIds: [],
};

test("a pseudo-carrier subject is reached through its host and sampled on the carrier's own paint", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(
      `<style>
         .sample { position: fixed; left: 20px; top: 20px; width: 80px; height: 40px; background: none; }
         .sample::before { content: ""; position: absolute; inset: 0; backdrop-filter: blur(4px); background-color: rgb(10, 20, 30); }
       </style>
       <div class="sample"></div>`,
    );
    const snapshot = await probeAppearanceDom(page, CARRIER_ROW);
    expect(snapshot.subjects[0]).toMatchObject({
      // The receipt keeps the FULL selector — it is the identity the row's cascade expectations join on.
      selector: ".sample::before",
      accounting: { candidates: 1, sampled: 1 },
      facts: { style: { backdropFilter: "blur(4px)", backgroundColor: "rgb(10, 20, 30)" } },
    });
  } finally {
    await browser.close();
  }
});

// #2430 instrument plant: a candidate hidden by an ANCESTOR is DISPLAY-NONE, not "scrolled away". CSS
// resolves a child of a `display:none` subtree to its own DECLARED `display`, so the census's
// `style.display === "none"` test never fired for it and the node landed in `offViewport` with an all-zero
// rect — the one bucket whose reason ("the subject scrolled out of view") is the opposite of the truth, and
// the bucket the anchor exists to drive to zero. The same blindness aborted `--matrix` cell v04 on the
// live shell's `:is(.shell-topbar-title, .shell-topbar-jump-label)` union.
test("a candidate hidden by an ancestor is counted as display-none, never as off-viewport", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(
      '<div style="display:none"><div class="sample" style="width:80px;height:40px"></div></div>' +
        '<div class="sample" style="position:fixed;left:20px;top:20px;width:80px;height:40px"></div>',
    );
    const snapshot = await probeAppearanceDom(page, ROW);
    expect(snapshot.subjects[0]).toMatchObject({
      accounting: { candidates: 2, reached: 1, sampled: 1, offViewport: 0, skipped: [{ reason: "display-none", count: 1 }] },
      matchIndex: 1,
    });
  } finally {
    await browser.close();
  }
});

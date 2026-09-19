// THE DEV SERVER'S HUD IS NOT THE PRODUCT (#2429 item 2) — the planted control for
// `DEV_SERVER_HUD` (tooling/src/_shared/browser-context.ts), which every probe context installs.
//
// THE DEFECT, reproduced in the first arm. `vite-plugin-checker` mounts a
// `<vite-plugin-checker-error-overlay>` at the viewport's bottom-right corner (overlay.position "br",
// packages/client/vite.config.ts) and its collapsed badge paints rgb(255,85,85). Measured live
// 2026-09-19 under the Light theme it sits ON TOP of the chat composer — so a framebuffer sample taken
// around the composer read the BADGE and called the result a verdict about the app. Any instrument that
// samples pixels (contrast fill, contrast edge, design-audit, a screenshot) inherits that lie.
//
// IT ASSERTS THROUGH THE CONTRAST ARM's public door rather than through a computed style, because the
// defect is a POISONED SAMPLE, not a hidden element: the arm is what a reviewer runs, and the surround
// colour it prints is the thing that was wrong.
import { chromium } from "@playwright/test";
import { DEV_SERVER_HUD } from "../../../tooling/src/_shared/browser-context.ts";
import { captureContrastEvidence } from "../../../tooling/src/snap/ops/arms/contrast.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(60_000);
const VIEWPORT = { width: 400, height: 240 } as const;
/** An origin nothing listens on — the fixture is served by a route interception, so the test needs no
 *  server and reaches no network. */
const ORIGIN = "http://orb-probe-fixture.invalid";

/** The badge is modelled as what it is on screen: a dev-server layer painted over the app, under the one
 *  subject a probe was asked about. The subject keeps its own fill, so the only thing the HUD can change
 *  is the SURROUND the fill arm measures against — which is exactly how it decided a live verdict. */
const PAGE = `
  <style>
    body { margin: 0; background: #0a0a0a; }
    vite-plugin-checker-error-overlay { position: fixed; inset: 0; display: block; background: rgb(255,85,85); }
    #swatch { position: fixed; left: 170px; top: 100px; width: 40px; height: 40px; background: #141414; z-index: 2; }
  </style>
  <vite-plugin-checker-error-overlay></vite-plugin-checker-error-overlay>
  <div id="swatch"></div>
`;

async function surroundOf(withHide: boolean): Promise<{ readonly surround: unknown; readonly hostDisplay: string }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    if (withHide) {
      await context.addInitScript({ content: DEV_SERVER_HUD.initScript });
    }
    const page = await context.newPage();
    // A REAL NAVIGATION, not `setContent`: an init script runs at document-start of each navigation, and
    // `setContent` replaces the document that about:blank's run had already decorated — the fixture would
    // report the fix missing for a reason the product never has (every probe context navigates).
    await page.route(`${ORIGIN}/**`, async (route) => await route.fulfill({ contentType: "text/html", body: PAGE }));
    await page.goto(`${ORIGIN}/`);
    const [swatch] = await captureContrastEvidence(page, ["#swatch"], false, VIEWPORT);
    // RAW STRING, the house spelling for a browser body from a NODE-lib program (tooling has no DOM lib,
    // so `document` is a TS2584 in a real function and a cast would only smuggle the name past tsc).
    const hostDisplay = await page.evaluate(`(() => {
      const host = document.querySelector(${JSON.stringify(DEV_SERVER_HUD.selector)});
      return host === null ? "absent" : getComputedStyle(host).display;
    })()`);
    return { surround: swatch?.evidence.backdrop, hostDisplay: String(hostDisplay) };
  } finally {
    await browser.close();
  }
}

test("the dev-server checker HUD never reaches a probe's pixels", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  // ── THE PLANTED POSITIVE CONTROL: without the hide script the badge IS the measured surround. A
  // fixture that could not show the poisoning would prove nothing about removing it.
  const poisoned = await surroundOf(false);
  expect(poisoned.hostDisplay).toBe("block");
  expect(poisoned.surround, "the control must actually poison the sample").toMatchObject({ r: 255, g: 85, b: 85 });

  // ── AND THE FIX: with the init script every probe context installs, the badge paints nothing and the
  // arm measures the page the app actually rendered.
  const clean = await surroundOf(true);
  expect(clean.hostDisplay).toBe("none");
  expect(clean.surround).toMatchObject({ r: 10, g: 10, b: 10 });
});

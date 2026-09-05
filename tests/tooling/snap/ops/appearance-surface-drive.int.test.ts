// @instrument-proof: #1104 — an appearance row whose SURFACE never comes up must refuse BY NAME. The drive
// that found this reported `--matrix` as NO VERDICT with nothing saying which row, which surface or which
// settle subject was missing, because a bare `Timeout … exceeded` from the selector wait travelled up as an
// unattributed throw. A timeout is never a verdict; a named refusal is.
//
// @instrument-absence-proof: the second arm is the planted control in the other direction — the SAME call
// against a page that DOES show the surface's settle subject returns normally, so the refusal above is a
// real answer about the surface rather than a wait that can only fail.
import { chromium } from "@playwright/test";
import type { RuntimeAppearanceHistoricalRow } from "../../../../tooling/src/_shared/appearance-matrix.ts";
import { driveSurface } from "../../../../tooling/src/snap/ops/appearance-surface-drive.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// The refusing arm SPENDS the surface-settle budget (WAIT_SELECTOR_TIMEOUT_MS, 10s base) by design, so the
// file's own ceiling is well clear of it.
const BROWSER_TIMEOUT_MS = scaledBudget(90_000);
const VIEWPORT = { width: 800, height: 600 } as const;

/** A NON-chat row (`shell`): its settle subject is the shell grid, so the fixture needs no chat data to be
 *  the honest subject of this question. */
const HOME_ROW: RuntimeAppearanceHistoricalRow = {
  id: "psh-home-row",
  surface: "shell",
  subjects: [{ id: "sample", selector: ".shell-grid", population: "one", sample: "geometry" }],
  cascade: [],
  merge: { mechanism: "merge-not-applicable", reason: "direct-carrier", selector: ".shell-grid", owner: "fixture" },
  requiredChecks: [],
  optionalSubjectIds: [],
};

/** The nav bridge the drive calls, answering `{ok:true}` — the point of both arms is what happens AFTER a
 *  navigation the app accepted. */
const NAV_SHIM = "<script>globalThis.__orb={nav:{section:()=>({ok:true}),openModal:()=>({ok:true}),openConfig:()=>({ok:true})}};</script>";

async function drive(body: string): Promise<Error | null> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(`${NAV_SHIM}${body}`);
    try {
      await driveSurface(page, HOME_ROW);
      return null;
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  } finally {
    await browser.close();
  }
}

test("a surface that never shows its settle subject refuses by name instead of timing out", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const failure = await drive("<main>no shell here</main>");

  expect(failure, "an absent surface must not read as a successful drive").not.toBeNull();
  const message = String(failure?.message);
  // The refusal is snap's own vocabulary, not Playwright's — that is the whole fix.
  expect(message).toContain("INSTRUMENT ERROR");
  // …and it names every fact the reader needs to act: the row, the surface, the settle subject, the
  // ceiling that was spent, and that the cell is UNMEASURED rather than failed.
  expect(message).toContain(HOME_ROW.id);
  expect(message).toContain(HOME_ROW.surface);
  expect(message).toContain(".shell-grid");
  expect(message).toContain("NO VERDICT");
});

test("the same drive returns normally once the surface's settle subject is there", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  expect(await drive('<div class="shell-grid">shell</div>')).toBeNull();
});

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
import { anchorRowSubject, driveSurface } from "../../../../tooling/src/snap/ops/appearance-surface-drive.ts";
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

// @instrument-proof: #2402 — ONE `scrollIntoView` IS NOT A VERDICT. The chat list re-pins to its latest
// turn once the virtualizer has measured, which landed AFTER the drive's single scroll and put the one row
// `dark-name-time-short-bubble` judges ~4100px above the fold; the census then classified a legitimately
// mounted sample as `offViewport:1` and `pnpm snap --matrix` refused the whole run at that cell (measured
// on `1bec07baa`, `withheld-rect top=-4097`). The anchor scrolls, re-measures after a settle, and retries.
//
// @instrument-absence-proof: the second arm is the planted control in the other direction — a surface that
// re-pins FOREVER gets a named refusal carrying the last measured rect, so "anchored" is a real answer
// about the surface rather than a loop that can only succeed.
const ANCHOR_ROW: RuntimeAppearanceHistoricalRow = {
  id: "dark-name-time-short-bubble",
  surface: "chat",
  subjects: [{ id: "attribution", selector: "#subject", population: "many", sample: "pixel" }],
  cascade: [],
  merge: { mechanism: "merge-not-applicable", reason: "direct-carrier", selector: "#subject", owner: "fixture" },
  requiredChecks: [],
  optionalSubjectIds: [],
};

/** A scroller parked at its own bottom with the subject far above the fold, whose `scroll` handler re-pins
 *  to the bottom for the first `repins` scrolls — the virtualized message list's behaviour, in 20 lines.
 *
 *  `pump` ALSO re-pins every animation frame, and the never-anchorable control needs it: a `scroll` listener
 *  is the only re-pin driver the fixture had, and on a contended box a frame can pass between the anchor's
 *  `scrollIntoView` and its settled read WITHOUT the listener having run — the subject then measures held
 *  and the control PASSES when it is supposed to refuse (observed 2026-09-19 under a 10-file parallel run;
 *  the same arm takes 8 attempts and refuses when run alone). A real virtualizer re-pins off its own
 *  measurement, not only off scroll events, so the pump is the more faithful surface as well as the stable
 *  one. The bounded arm keeps the listener alone on purpose: its whole point is a re-pin that lands AFTER
 *  the anchor's scroll and then stops. */
function repinningSurface(repins: number, pump = false): string {
  return `<div id="scroller" style="height:300px;overflow:auto">
      <div style="height:4000px"></div>
      <div id="subject" style="height:20px">subject</div>
      <div style="height:4000px"></div>
    </div>
    <script>
      const scroller = document.getElementById("scroller");
      let remaining = ${String(repins)};
      const repin = () => { if (remaining > 0) { remaining -= 1; scroller.scrollTop = scroller.scrollHeight; } };
      scroller.scrollTop = scroller.scrollHeight;
      scroller.addEventListener("scroll", repin);
      if (${String(pump)}) {
        const frame = () => { repin(); requestAnimationFrame(frame); };
        requestAnimationFrame(frame);
      }
    </script>`;
}

async function anchor(body: string): Promise<{ readonly failure: Error | null; readonly top: number | null }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(body);
    let failure: Error | null = null;
    try {
      await anchorRowSubject(page, ANCHOR_ROW);
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
    // A page-level EXPRESSION string, never `locator.evaluate("(element) => …")`: that spelling returns the
    // function itself and measures nothing (#2402's root cause, pinned in the drive's header).
    const top = await page.evaluate("document.querySelector('#subject').getBoundingClientRect().top");
    return { failure, top: typeof top === "number" ? top : null };
  } finally {
    await browser.close();
  }
}

test("the anchor holds its subject in view through a surface that re-pins after the scroll", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const anchored = await anchor(repinningSurface(2));

  expect(anchored.failure, "a surface that stops re-pinning must anchor, not refuse").toBeNull();
  // The defect this pins is geometric, so the assertion is geometric: the subject ENDS inside the viewport.
  expect(anchored.top).not.toBeNull();
  expect(anchored.top ?? Number.NaN).toBeGreaterThan(0);
  expect(anchored.top ?? Number.NaN).toBeLessThan(VIEWPORT.height);
});

test("a surface that never stops scrolling away refuses by name with the rect it last measured", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const anchored = await anchor(repinningSurface(1000, true));

  expect(anchored.failure, "an unanchorable surface must not read as a successful anchor").not.toBeNull();
  const message = String(anchored.failure?.message);
  expect(message).toContain("INSTRUMENT ERROR");
  expect(message).toContain(ANCHOR_ROW.id);
  expect(message).toContain("attribution");
  expect(message).toContain("NO VERDICT");
  // The geometry is the whole point of the refusal: `offViewport:1` with no rect is what made #2402 unreadable.
  expect(message).toContain("Last measured rect=");
});

// @instrument-proof: #2430 — A CANDIDATE'S OWN COMPUTED `display` IS BLIND TO A HIDDEN ANCESTOR. The anchor
// picked "the first candidate whose own computed display/visibility is not none/hidden", and CSS resolves a
// child of a `display:none` subtree to its DECLARED value, so an unrendered node passed that filter, handed
// back an all-zero rect and could never be anchored. Measured on the live shell 2026-09-19 at
// desktop 1280x800 on `home`: the row `opposite-os-app-prepaint` judges
// `:is(.shell-topbar-title, .shell-topbar-jump-label)`, whose FIRST match is the topbar's narrow identity
// title — `display:block`, `visibility:visible`, `checkVisibility() === false`, parent `display:none`,
// rect all zeros — while the genuinely rendered `.shell-topbar-jump-label` sits 39x20 at x=1109 later in
// document order. `--matrix` spent 8 scroll attempts on the phantom and aborted cell v04 with no verdict.
//
// @instrument-absence-proof: the second arm is the planted control in the other direction — with NO rendered
// candidate behind the phantom, the anchor still refuses by its own "reaches no rendered candidate" name, so
// the arm above is a real answer about which node is rendered rather than a predicate that can only pass.
function ancestorHiddenFirstCandidate(renderedSibling: boolean): string {
  return `<div style="display:none"><span id="subject" style="height:20px">phantom</span></div>
    ${renderedSibling ? '<span id="subject" style="display:block;height:20px;width:80px">real ink</span>' : ""}`;
}

test("the anchor skips a candidate hidden by an ANCESTOR and takes the rendered one", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const anchored = await anchor(ancestorHiddenFirstCandidate(true));

  expect(anchored.failure, "a rendered candidate behind an ancestor-hidden one must anchor, not refuse").toBeNull();
});

test("an ancestor-hidden candidate with nothing rendered behind it refuses as UNREACHED, not unanchorable", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const anchored = await anchor(ancestorHiddenFirstCandidate(false));

  expect(anchored.failure, "a phantom-only surface must not read as a successful anchor").not.toBeNull();
  const message = String(anchored.failure?.message);
  expect(message).toContain("INSTRUMENT ERROR");
  expect(message).toContain("reaches no rendered candidate to anchor on");
});

// @instrument-proof: #2437 — a population=0 miss must name the WHOLE row's subject census. The
// hover-pointer twin reported `bubble` population 0 and stopped there; the cause was that EVERY subject of
// the row was 0 (each one is scoped through the same relational `:has(... :not([data-sticky]) ...)` row,
// and the arm had turned every visible header sticky), which the one-subject message could not say. A lane
// spent an afternoon re-deriving by hand what the instrument already had in the page.
const CENSUS_ROW: RuntimeAppearanceHistoricalRow = {
  id: "hover-pointer",
  surface: "chat",
  subjects: [
    { id: "bubble", selector: "#missing-bubble", population: "many", sample: "geometry" },
    { id: "actions-row", selector: ".present-actions", population: "many", sample: "geometry" },
  ],
  cascade: [],
  merge: { mechanism: "merge-not-applicable", reason: "direct-carrier", selector: ".present-actions", owner: "fixture" },
  requiredChecks: [],
  optionalSubjectIds: [],
};

test("a zero-population anchor miss names every subject population, not just its own", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    // The anchored subject matches NOTHING; a sibling subject matches two rendered nodes. A report that
    // cannot tell those apart sends its reader to the wrong owner (the row's selector vs the surface).
    await page.setContent('<div class="present-actions">a</div><div class="present-actions">b</div>');
    let failure: Error | null = null;
    try {
      await anchorRowSubject(page, CENSUS_ROW);
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }

    expect(failure, "an empty anchor subject must refuse").not.toBeNull();
    const message = String(failure?.message);
    expect(message).toContain("last selector population=0");
    expect(message).toContain("Row subject populations:");
    expect(message).toContain("bubble=0");
    // The PLANTED CONTROL in the other direction: a non-zero sibling is reported as non-zero, so the
    // census is a measurement rather than a row of zeroes the message always prints.
    expect(message).toContain("actions-row=2");
  } finally {
    await browser.close();
  }
});

// The appearance row's SURFACE DRIVE: reach the surface a row judges, and settle on that surface's own
// subject. Split out of `appearance-invariant-runtime.ts` when #1104's refusal pushed that file over the
// tooling-size cap — the drive is one question ("is this row's surface up?") and the runtime owner reads as
// one call.
import { instrumentRefusal, navResultShape, pageNumber, pageObject } from "@orb/tooling/_shared/page-validate";
import type { Page } from "@playwright/test";
import type { RuntimeAppearanceHistoricalRow } from "../../_shared/appearance-matrix.ts";
import { settle } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { buildNavScript } from "../../_shared/nav.ts";
import { MOUNT_SETTLE_MS, STEP_SETTLE_MS, WAIT_SELECTOR_TIMEOUT_MS } from "../lib/budgets.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --matrix");

/** THE SETTLE SUBJECT IS THE ROW'S OWN SURFACE (#1104). Each row states the surface it is about, and each
 *  surface has ONE element that means "this surface is up": a chat row's message list, the sizing group's
 *  density preview, the shell grid for everything else. The subject is picked here rather than by the
 *  caller because the row is the only thing that knows which surface it judges.
 *
 *  The wait is bounded by WAIT_SELECTOR_TIMEOUT_MS — the budget every other snap surface wait uses — and
 *  NOT by the dialog-attach ceiling it used until #1104: a popup that has been asked to open returns in a
 *  frame or two, but reaching a chat on a cold stage means a route chunk, a query and a virtualized list,
 *  and a 5s popup ceiling made that read as a defect on load alone. */
function appearanceSurfaceNav(row: RuntimeAppearanceHistoricalRow): readonly ["goto" | "open-chat", string, string] {
  if (row.surface === "chat" || row.id === "light-art-scrim-glass-elevation") {
    return ["open-chat", "latest", '[data-slot="message-row"]'];
  }
  if (row.surface === "config-sizing") {
    return ["goto", "settings:appearance.sizing", '[data-slot="density-preview"]'];
  }
  return ["goto", "home", ".shell-grid"];
}

/** Exported for its pin (`tests/tooling/snap/ops/appearance-surface-drive.int.test.ts`): the arm that
 *  proves an unreachable surface REFUSES BY NAME instead of surfacing as a bare Playwright timeout. */
export async function driveSurface(page: Page, row: RuntimeAppearanceHistoricalRow): Promise<void> {
  const [kind, target, waitSelector] = appearanceSurfaceNav(row);
  const result = navResultShape(await page.evaluate(buildNavScript(kind, target)), `nav ${kind} ${target}`);
  if (!result.ok) {
    instrumentRefusal(`Appearance row ${row.id} navigation refused: ${result.reason ?? "unknown"}`);
  }
  // @orb-waive caught-failure-ownership(catch): the failure is CONVERTED, never swallowed — a bare `Timeout 5000ms exceeded` reached the matrix loop as an unattributed throw and the drive reported NO VERDICT with nothing naming which row, surface or subject was missing (#1104). Ends when the wait stops being able to fail.
  try {
    await page.locator(waitSelector).first().waitFor({ state: "attached", timeout: WAIT_SELECTOR_TIMEOUT_MS });
  } catch {
    instrumentRefusal(
      `Appearance row ${row.id} reached ${kind} ${target} but its ${row.surface} surface never showed ${waitSelector} within ${String(WAIT_SELECTOR_TIMEOUT_MS)}ms — this row has NO VERDICT, not a failed one. The usual cause is a stage whose ${row.surface} surface has no content (an isolated stage with no chat turns); re-run against a stage that has it, or exclude this row's cell.`,
    );
  }
  await settle(page, MOUNT_SETTLE_MS);
}

/** THE ROWS WHOSE JUDGED SUBJECT IS NOT WHERE THE SURFACE PARKS ITSELF. A chat list virtualizes around the
 *  LATEST turn and a merely-visible header can sit under the shell's fixed chrome, so the one relational
 *  row these policies judge is routinely thousands of pixels above the fold. The anchor centres it so the
 *  census judges that row instead of classifying a legitimately mounted sample as offscreen. */
const ANCHOR_SUBJECT_BY_ROW: Readonly<Record<string, string>> = {
  "dark-name-time-short-bubble": "attribution",
  "hover-pointer": "bubble",
  "opposite-os-app-prepaint": "theme-ink",
};

/** How many scroll-then-remeasure rounds the anchor spends before it calls the surface unanchorable. The
 *  loop exists because ONE scroll is not a verdict (#2402): the chat list re-pins to its latest turn once
 *  the virtualizer has measured, which silently undid the single `scrollIntoView` this drive used to do and
 *  surfaced ~4100px later as an unexplained `offViewport:1` at census time, refusing the whole matrix. */
const ANCHOR_ATTEMPTS = 8;

interface AnchorRect {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

// WHY A PAGE-EVALUATED FUNCTION AND NOT `locator.evaluate("(element) => …")` — THE #2402 ROOT CAUSE.
// Playwright's `Locator.evaluate` with a STRING evaluates it as an EXPRESSION and returns its value; an
// arrow-function string therefore evaluates to a function object, is never CALLED with the element, and
// serialises back as `undefined`. Measured 2026-09-18 against @playwright/test in this checkout: both
// `loc.evaluate("(element) => element.getBoundingClientRect().top")` and the block-bodied form return
// `undefined`, while the same body passed as a real function returns `8`. The #1228 comment that put a
// string there was solving the right problem (tooling/src is DOM-less, so `HTMLElement` is a TS2584) with
// the one spelling that silently does NOTHING — which is exactly why the row's `scrollIntoView` never ran.
// The house answer is `ops/appearance-invariant-dom.ts`'s: pass a REAL function to `page.evaluate` and
// declare the browser shapes it touches locally, so the program stays DOM-less and the call still executes.
interface AnchorBrowserElement {
  readonly scrollIntoView: (options: { readonly block: string; readonly inline: string }) => void;
  readonly getBoundingClientRect: () => {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly width: number;
    readonly height: number;
  };
}

interface AnchorBrowserGlobals {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly document: { readonly querySelectorAll: (selector: string) => readonly AnchorBrowserElement[] };
  readonly getComputedStyle: (element: AnchorBrowserElement) => { readonly display: string; readonly visibility: string };
}

/** Runs IN THE BROWSER. Centres the first rendered candidate (the census's own reach order) and hands back
 *  the geometry that decides whether it landed — `null` when the selector reaches nothing rendered. */
function browserAnchorSubject(input: { readonly selector: string; readonly scroll: boolean }): AnchorRect | null {
  const browser = globalThis as unknown as AnchorBrowserGlobals;
  const element = [...browser.document.querySelectorAll(input.selector)].find((candidate) => {
    const style = browser.getComputedStyle(candidate);
    return style.display !== "none" && style.visibility !== "hidden";
  });
  if (element === undefined) {
    return null;
  }
  if (input.scroll) {
    element.scrollIntoView({ block: "center", inline: "nearest" });
  }
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height: rect.height,
    viewportWidth: browser.innerWidth,
    viewportHeight: browser.innerHeight,
  };
}

function anchorRectShape(value: unknown, label: string): AnchorRect {
  const rect = pageObject(value, label);
  return {
    top: pageNumber(rect["top"], `${label}.top`),
    bottom: pageNumber(rect["bottom"], `${label}.bottom`),
    left: pageNumber(rect["left"], `${label}.left`),
    right: pageNumber(rect["right"], `${label}.right`),
    width: pageNumber(rect["width"], `${label}.width`),
    height: pageNumber(rect["height"], `${label}.height`),
    viewportWidth: pageNumber(rect["viewportWidth"], `${label}.viewportWidth`),
    viewportHeight: pageNumber(rect["viewportHeight"], `${label}.viewportHeight`),
  };
}

/** The census's own in-viewport predicate (`ops/appearance-invariant-dom.ts#inViewport`), asked here so the
 *  anchor's success condition and the classification it exists to prevent cannot drift apart. */
function anchorInViewport(rect: AnchorRect): boolean {
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < rect.viewportHeight && rect.left < rect.viewportWidth;
}

function anchorHeld(scrolled: AnchorRect, settled: AnchorRect): boolean {
  return anchorInViewport(settled) && scrolled.top === settled.top && scrolled.left === settled.left;
}

/** Centre the row's judged subject and PROVE it stayed there — exported for its pins in
 *  `tests/tooling/snap/ops/appearance-surface-drive.int.test.ts`. Called immediately before every census so
 *  a late re-pin cannot land between the scroll and the measurement. A row with no anchor is a no-op. */
export async function anchorRowSubject(page: Page, row: RuntimeAppearanceHistoricalRow): Promise<void> {
  const subjectId = ANCHOR_SUBJECT_BY_ROW[row.id];
  if (subjectId === undefined) {
    return;
  }
  const selector = row.subjects.find((subject) => subject.id === subjectId)?.selector;
  if (selector === undefined) {
    instrumentRefusal(`Appearance row ${row.id} has no ${subjectId} drive subject`);
  }
  let settled: AnchorRect | null = null;
  for (let attempt = 0; attempt < ANCHOR_ATTEMPTS; attempt += 1) {
    const label = `Appearance row ${row.id} anchor ${subjectId} attempt ${String(attempt)}`;
    const reached: unknown = await page.evaluate(browserAnchorSubject, { selector, scroll: true });
    if (reached === null) {
      instrumentRefusal(
        `${label}: ${selector} reaches no rendered candidate to anchor on — the ${row.surface} surface is not showing the subject this row judges.`,
      );
    }
    const scrolled = anchorRectShape(reached, label);
    await settle(page, STEP_SETTLE_MS);
    settled = anchorRectShape(await page.evaluate(browserAnchorSubject, { selector, scroll: false }), `${label} settled`);
    if (anchorHeld(scrolled, settled)) {
      return;
    }
  }
  instrumentRefusal(
    `Appearance row ${row.id} could not hold its ${subjectId} anchor in view over ${String(ANCHOR_ATTEMPTS)} scroll attempts — the ${row.surface} surface keeps scrolling away from the subject this row judges, so the cell has NO VERDICT rather than a failed one. Last measured rect=${JSON.stringify(settled)} for ${selector}`,
  );
}

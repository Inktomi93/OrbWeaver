// The appearance row's SURFACE DRIVE: reach the surface a row judges, and settle on that surface's own
// subject. Split out of `appearance-invariant-runtime.ts` when #1104's refusal pushed that file over the
// tooling-size cap — the drive is one question ("is this row's surface up?") and the runtime owner reads as
// one call.
import { instrumentRefusal, navResultShape } from "@orb/tooling/_shared/page-validate";
import type { Page } from "@playwright/test";
import type { RuntimeAppearanceHistoricalRow } from "../../_shared/appearance-matrix.ts";
import { settle } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { buildNavScript } from "../../_shared/nav.ts";
import { MOUNT_SETTLE_MS, STEP_SETTLE_MS, STEP_TIMEOUT_MS, WAIT_SELECTOR_TIMEOUT_MS } from "../lib/budgets.ts";

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
  if (row.id === "dark-name-time-short-bubble" || row.id === "hover-pointer") {
    const subjectId = row.id === "dark-name-time-short-bubble" ? "attribution" : "bubble";
    const selector = row.subjects.find((subject) => subject.id === subjectId)?.selector;
    if (selector === undefined) {
      instrumentRefusal(`Appearance row ${row.id} has no ${subjectId} drive subject`);
    }
    // The chat list virtualizes around the latest turn, and a merely-visible header can sit under the
    // shell's fixed chrome. Center the client-declared relational subject so the pixel census judges the
    // row itself rather than classifying a legitimate mounted sample as offscreen/occluded.
    await page
      .locator(selector)
      .filter({ visible: true })
      .first()
      // #1228: a string body, not a typed `(element) => …` callback — the latter needs lib.dom's
      // `HTMLElement`/`SVGElement` (`scrollIntoView` isn't on Playwright's own minimal element type),
      // which this program deliberately does not carry (tooling/src stays DOM-less by design; see
      // tsconfig.json's header). Same pattern as this file's other `page.evaluate` string calls above.
      .evaluate(`(element) => element.scrollIntoView({ block: "center", inline: "nearest" })`, undefined, { timeout: STEP_TIMEOUT_MS });
    await settle(page, STEP_SETTLE_MS);
  }
  if (row.id === "opposite-os-app-prepaint") {
    const selector = row.subjects.find((subject) => subject.id === "theme-ink")?.selector;
    if (selector === undefined) {
      instrumentRefusal("opposite-os-app-prepaint policy is missing its theme-ink subject");
    }
    await page
      .locator(selector)
      .filter({ visible: true })
      .first()
      // #1228: same string-body reasoning as above.
      .evaluate(`(element) => element.scrollIntoView({ block: "center", inline: "nearest" })`, undefined, { timeout: STEP_TIMEOUT_MS });
    await settle(page, STEP_SETTLE_MS);
  }
}

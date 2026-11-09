// What axe reads on the primitives behind the evidence walk's structure findings: a scrolling Text is a tab stop and the inline hint trigger is
// a WCAG 2.5.8 target. The Base UI focus-guard excusal that `accessibilityScan` applies must not swallow an authored aria-hidden control.
import { accessibilityScan } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { ScrollAndHintStory } from "./_structure-stories.tsx";

const SCROLL_STORY = "tests/ui/primitives/text/_structure-stories/ScrollAndHintStory";
const MINIMUM_TARGET = 24;
const FOCUS_GUARD_MARKER = "data-base-ui-focus-guard";

test("a scrolling Text is reachable by keyboard and the hint trigger is at least the 24px target", async ({ mount, page }) => {
  await mount<typeof ScrollAndHintStory>(SCROLL_STORY, {});
  const region = page.getByRole("region", { name: "Scrolling block", exact: true });
  await expect(region).toHaveAttribute("tabindex", "0");
  const hint = page.getByRole("button", { name: "More info about Word count", exact: true });
  const box = await hint.boundingBox();
  expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(MINIMUM_TARGET);
  const { violations } = await accessibilityScan(page);
  expect(violations.filter(({ id }) => id === "scrollable-region-focusable" || id === "target-size")).toEqual([]);
});

// axe treats a popup's guards as "needs review" whenever its modal-open heuristic fires, which a mounted popup does not reliably trigger, so
// the guard is stood in by a node that wears the library's marker and nothing else.
test("a library focus guard is not an aria-hidden-focus finding and an authored focusable aria-hidden control is", async ({ mount, page }) => {
  await mount<typeof ScrollAndHintStory>(SCROLL_STORY, {});
  await page.evaluate((marker) => {
    const guard = document.createElement("span");
    guard.setAttribute("aria-hidden", "true");
    guard.setAttribute("tabindex", "0");
    guard.setAttribute(marker, "");
    const trap = document.createElement("button");
    trap.setAttribute("aria-hidden", "true");
    trap.textContent = "Authored trap";
    document.body.append(guard, trap);
  }, FOCUS_GUARD_MARKER);
  const { violations } = await accessibilityScan(page);
  const nodes = violations.filter(({ id }) => id === "aria-hidden-focus").flatMap((violation) => violation.nodes);
  expect(nodes.map(({ html }) => html)).toEqual([expect.stringContaining("Authored trap")]);
});

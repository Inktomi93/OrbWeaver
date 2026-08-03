// CT: the assembled-preview DISCLOSURE reveals what it discloses (side-eye F-13, re-filed as R-6).
//
// THE DEFECT: at 1280×800 the "Show assembled preview" trigger sits at y≈778, so opening it rendered ~935px
// of preview entirely below the fold and the ONLY feedback was the button's label flipping to "Hide" —
// Nielsen #1, on the affordance whose whole job is to show you something.
//
// WHY THIS FILE EXISTS AS WELL AS THE FIX: the re-check re-measured `scrollTop: 0` after the fix had already
// landed, which is a claim about a SMOOTH scroll read at the moment it was requested rather than after it
// settled. Rather than argue timing, this drives the real disclosure in a real scroller and waits for the
// scroll to SETTLE — so the mechanism is pinned by behaviour, and a future regression (a dropped effect, a
// ref that stops resolving, a scroll container that stops being an ancestor) reds here.

import { expect, test } from "@playwright/experimental-ct-react";
import { PromptReadoutDisclosureStory } from "./_readout-stories.tsx";

const SHOW = "Show assembled preview";
const HIDE = "Hide assembled preview";

test("opening the assembled preview scrolls it into view, not just below the fold", async ({ mount, page }) => {
  const story = await mount(<PromptReadoutDisclosureStory />);
  // Page-scoped: the providers render no DOM of their own, so the mounted component root IS the scroller —
  // a component-scoped locator would search its descendants and never find it.
  const scroller = page.locator("[data-readout-scroller]");
  const trigger = story.getByRole("button", { name: SHOW });
  await expect(trigger).toBeVisible();

  // The precondition the defect needs: the readout already overflows, and we are at the top of it.
  const before = await scroller.evaluate((el) => ({ top: el.scrollTop, overflow: el.scrollHeight - el.clientHeight }));
  expect(before.overflow, "the story must actually overflow, or this proves nothing").toBeGreaterThan(0);
  expect(before.top).toBe(0);

  await trigger.click();
  await expect(story.getByRole("button", { name: HIDE })).toBeVisible();

  // THE CLAIM, polled to SETTLED: the disclosed region is visible in the scrollport. The scroll is smooth,
  // so the assertion has to wait for it — reading in the same tick as the click is what produced the
  // "still scrollTop 0" measurement. The region is the one the trigger already names through
  // `aria-controls`, so the test asks the same question a screen reader would.
  const controls = await story.getByRole("button", { name: HIDE }).getAttribute("aria-controls");
  expect(controls).not.toBeNull();
  await expect
    .poll(
      async () =>
        scroller.evaluate((el, id) => {
          const target = el.querySelector(`#${CSS.escape(id)}`);
          if (target === null) {
            return null;
          }
          const box = target.getBoundingClientRect();
          const port = el.getBoundingClientRect();
          return box.top < port.bottom && box.bottom > port.top;
        }, controls ?? ""),
      { intervals: [100, 200, 400, 800, 1000], timeout: 10_000 },
    )
    .toBe(true);
});

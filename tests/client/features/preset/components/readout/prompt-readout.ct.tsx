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

// THE MAIN-PROMPT BLOCK SAYS IT HAS A SECOND ARM (side-eye 2026-08-08 P2, scope-add). The preview paints
// `main_prompt`'s built-in default verbatim — which is the PER-SPEAKER framing — with no sign that a
// narrator round resolves a different one. A reader who never opens the drill-in leaves the preview
// believing the sentence on screen is the whole story.
//
// The cue is a POINTER, not the explanation: `MarkerCopy.templateNote` stays the one home for what actually
// changes, in the section body where the field is edited. So the assertions are BOTH halves — the cue rides
// exactly the one block whose template is mode-aware, and it is not the note.
const NARRATOR_CUE = "Adapts on narrator turns";
/** The preview block for the built-in `main` section — `DEFAULT_PROMPT_CONFIG` names it "Main". */
const MAIN_BLOCK = /^Main/;

test("the assembled preview cues the main-prompt block's narrator arm — and only that block", async ({ mount, page }) => {
  const story = await mount(<PromptReadoutDisclosureStory />);
  await story.getByRole("button", { name: SHOW }).click();
  const hide = story.getByRole("button", { name: HIDE });
  await expect(hide).toBeVisible();

  // Scoped to the disclosed region the trigger names — the readout's BUDGET BARS above it are buttons named
  // by the same sections, so a story-wide locator addresses two different surfaces.
  const controls = await hide.getAttribute("aria-controls");
  expect(controls).not.toBeNull();
  const preview = page.locator(`[id="${controls ?? ""}"]`);

  // The preview's blocks are click-through buttons named by the section — `main` ships as "Main".
  const mainBlock = preview.getByRole("button", { name: MAIN_BLOCK });
  await expect(mainBlock).toBeVisible();
  await expect(mainBlock.getByText(NARRATOR_CUE)).toBeVisible();

  // ONE block carries it: every other enabled section in the built-in config draws none.
  await expect(preview.getByText(NARRATOR_CUE)).toHaveCount(1);
  // …and the cue is not the drill-in's sentence re-printed into the preview.
  await expect(page.getByText("Anything you write here replaces it on every turn")).toHaveCount(0);
});

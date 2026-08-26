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
import { PromptReadoutDisclosureStory, PromptReadoutMeterStory } from "./_readout-stories.tsx";

const SHOW = "Show assembled preview";
const HIDE = "Hide assembled preview";
const NONEMPTY_ID = /.+/u;

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
  await expect.poll(async () => (await scroller.evaluate((el) => ({ top: el.scrollTop, overflow: el.scrollHeight - el.clientHeight }))).top).toBe(0);

  await trigger.click();
  await expect(story.getByRole("button", { name: HIDE })).toBeVisible();

  // THE CLAIM, polled to SETTLED: the disclosed region is visible in the scrollport. The scroll is smooth,
  // so the assertion has to wait for it — reading in the same tick as the click is what produced the
  // "still scrollTop 0" measurement. The region is the one the trigger already names through
  // `aria-controls`, so the test asks the same question a screen reader would.
  const hide = story.getByRole("button", { name: HIDE });
  await expect(hide).toHaveAttribute("aria-controls", NONEMPTY_ID);
  const controls = await hide.getAttribute("aria-controls");
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
  await expect(hide).toHaveAttribute("aria-controls", NONEMPTY_ID);
  const controls = await hide.getAttribute("aria-controls");
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

// ── #483 / P2-7: the meter column has to be able to say something ────────────────────────────────
// THE DEFECT, measured live on a 146px rail: of the first 17 rows, SEVEN fills were 0px and SIX were 0.7px
// — a 0.5% sliver, sub-pixel at DPR 1 — because one section owns the scale and flattens the rest. So a
// disabled row (fill 0) and a two-token enabled row (fill 0.7) drew the SAME empty track, and the one thing
// the column could usefully say — which sections are actually costing you — was exactly what it could not.
//
// TWO PINS, because the fix has two halves and either alone would pass for the wrong reason:
//   1. no enabled row paints a sub-pixel sliver (a visible floor, LINEAR above it);
//   2. an OFF row is structurally distinct — it draws no rail at all, so "switched off" cannot be mistaken
//      for "costs almost nothing".
// Both are read off the RENDERED boxes, never off the model.

const TRACK_BAR = '[data-slot="track-bar"]';
const TRACK_FILL = '[data-slot="track-bar-fill"]';

test("#483 P2-7 no budget bar paints a sub-pixel fill — a tiny section is visibly smaller, never invisible", async ({ mount }) => {
  const readout = await mount(<PromptReadoutMeterStory />);
  await expect(readout.getByText("Instructions", { exact: true })).toBeVisible();

  // The census the report ran, as a vector: every fill's rendered width, in DOM order.
  const fills = await readout.locator(TRACK_FILL).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  expect(fills.length, "the story must actually render bars, or this proves nothing").toBeGreaterThan(2);
  // A fill is either NOTHING (a row that genuinely costs zero) or a fill the eye can see. The old code drew
  // 0.7px here for the two- and three-token rows.
  expect(
    fills.filter((width) => width > 0 && width < 1),
    `sub-pixel fills: ${fills.map((width) => width.toFixed(2)).join(",")}`,
  ).toEqual([]);
  // …and the scale is still LINEAR at the top: the dominant section owns (nearly) the whole rail, so the
  // floor did not become a log scale by the back door.
  const rail = await readout
    .locator(TRACK_BAR)
    .first()
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.max(...fills), "the largest section still fills its rail").toBeGreaterThan(rail * 0.9);
});

test("#483 P2-7 a DISABLED row draws no rail at all — off is not a very small number", async ({ mount }) => {
  const readout = await mount(<PromptReadoutMeterStory />);
  const offRow = readout.locator("button", { hasText: "Off big" }).first();
  const tinyRow = readout.locator("button", { hasText: "Tiny A" }).first();
  await expect(offRow).toBeVisible();

  // ABSENT, not empty: the two states used to be one picture.
  await expect(offRow.locator(TRACK_BAR), "an off row's meter is removed, not zeroed").toHaveCount(0);
  await expect(tinyRow.locator(TRACK_BAR), "…and an enabled row still has one").toHaveCount(1);
  // The DATUM survives the meter's removal, struck — which is what carries "off" now (F-26: the row stays
  // in the budget list; a disabled section still has a size).
  await expect(offRow.getByText("~100", { exact: true })).toHaveCSS("text-decoration-line", "line-through");
});

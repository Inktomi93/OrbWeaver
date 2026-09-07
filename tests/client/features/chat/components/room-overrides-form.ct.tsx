// CT: the room-overrides form (room-overrides-form.tsx) F1 SWITCH pin (stickler review
// 2026-07-16-merge-block-28523122). This autosave form mounts under ContextTabsPanel, which keys by TAB id
// only — so switching chats with the Overrides tab open must remount the form on the NEW chat's identity
// (keyed ABOVE the hook owner in room-overrides-form.tsx), else chat A's frozen FormApi survives and one
// keystroke autosaves A's overrides into chat B.
//
// The factory obligations (seed/key-remount/onFieldUnmount) are pinned once at the factory level
// (tests/client/forms/create-autosave-entity-form.ct.tsx); this consumer CT proves the room-overrides
// wiring reseeds on a chat switch. A seeds mainPrompt="A-prompt" (a field the test never edits — the tell
// of which seed is live); B seeds it empty. Dirty A via the Scenario field, switch to B, edit B's Scenario:
// the saved overrides' UNTOUCHED mainPrompt must be B's (absent), never A's frozen "A-prompt".

import { expect, test } from "@playwright/experimental-ct-react";
import { measureClamp } from "../../../../support/browser/measure-clamp.ts";
import { touchFloorPx } from "../../../../support/browser/touch-floor.ts";
import { RoomOverridesSwitchStory } from "../_ct-stories.tsx";

const SAVED = '[data-testid="room-overrides-saved"]';

/** WCAG 2.5.5's coarse-pointer target floor — asserted on the RESOLVED token before it is trusted, so a
 *  fine-pointer run (where the token answers 28) cannot read as a pass. */
const WCAG_TOUCH_FLOOR_PX = 44;

test("SWITCH pin — switching chats reseeds the form on the new chat, never the previous chat's frozen overrides", async ({ mount }) => {
  const component = await mount(<RoomOverridesSwitchStory />);

  // Chat A (mainPrompt="A-prompt"). The overrides are collapse-until-needed rows, so expand Scenario first,
  // then dirty it so the FormApi is non-default; the debounced autosave carries A's whole overrides —
  // including mainPrompt="A-prompt".
  await component.getByRole("button", { name: "Scenario" }).click();
  await component.getByRole("textbox", { name: "Scenario" }).fill("A-scenario");
  await expect(component.locator(SAVED)).toContainText('"mainPrompt":"A-prompt"');

  // Switch to chat B (mainPrompt empty). The remount resets the collapse state, so re-expand Scenario, then
  // edit it; the whole saved overrides must reflect B's OWN seed — mainPrompt absent (empty fields omit on
  // save). A leaked A instance would re-save "A-prompt".
  await component.getByRole("button", { name: "switch chat" }).click();
  await component.getByRole("button", { name: "Scenario" }).click();
  await component.getByRole("textbox", { name: "Scenario" }).fill("B-scenario");
  await expect(component.locator(SAVED)).toContainText('"scenario":"B-scenario"');
  await expect(component.locator(SAVED)).not.toContainText("A-prompt");
});

// RETIRED FIELD (owner ruling 2026-08-01): the author's note was a second home for what `chat_injections`
// owns (the identical at-depth splice), so the section is THREE text overrides and nothing else — no note
// textarea, and none of the at-depth controls (depth / role) its expanded editor used to carry.
test("no author's-note field — the section is exactly the three text overrides", async ({ mount }) => {
  const component = await mount(<RoomOverridesSwitchStory />);

  await expect(component.getByRole("button", { name: "Main prompt" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Post-history" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Scenario" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Author's note" })).toHaveCount(0);
  await expect(component.getByRole("textbox", { name: "Author's note" })).toHaveCount(0);
  // Role-agnostic: keyed to `spinbutton`, this absence check would go blind if the depth control ever came
  // back as an @orb/ui NumberField (Base UI renders those as a TEXTBOX, never a spinbutton).
  await expect(component.getByLabel("Depth")).toHaveCount(0);
  await expect(component.getByRole("combobox", { name: "Role" })).toHaveCount(0);
});

// #847 — THE COLLAPSED CARD'S SNIPPET MUST END ON A LINE BOUNDARY. Same defect, same spelling, second
// site (the mechanism is written out in full at the injections-manager pin): the one-line clamp and the
// block padding sat on the SAME element, `overflow: hidden` clips at the padding box, so the clamped-away
// line 2 painted into the ~11.9px of bottom padding. The oracle is the line grid (`measure-clamp.ts`),
// and the value must be long enough to wrap at the story's 380px or the defect is unreachable.
const LONG_SNIPPET =
  "A rainy dock at the edge of the shipping district, lantern-lit and loud, where the night crews are still loading and nobody looks twice at a stranger.";

test("#847: a long collapsed snippet is clamped to WHOLE lines — no second line sliced through its x-height", async ({ mount }) => {
  const component = await mount(<RoomOverridesSwitchStory />);

  // The snippet only exists on a SET field that is closed, so seed one: open Scenario, type, close it.
  await component.getByRole("button", { name: "Scenario" }).click();
  await component.getByRole("textbox", { name: "Scenario" }).fill(LONG_SNIPPET);
  await component.getByRole("button", { name: "Scenario" }).click();

  // The paragraph, NOT the textarea — the closing panel's textarea still holds the same string for the
  // length of its exit, so a bare text match is a two-element strict-mode violation.
  const snippet = component.getByRole("paragraph").filter({ hasText: LONG_SNIPPET });
  await expect(snippet).toBeVisible();
  expect(await measureClamp(snippet)).toMatchObject({ partialLinePx: 0, visibleLines: 1 });
});

// Full-row tap target (side-eye P2, WCAG 2.5.8): the block padding lives on the CollapsibleTrigger, not the
// Card, so the WHOLE row is the click/tap surface — previously the trigger was a ~23px band with dead Card
// padding above/below. Probe an UNSET field (Post-history — no snippet, so the card IS just the trigger row):
// a point 2px below the card's top edge (the old dead zone) must now resolve into the trigger button, and the
// trigger must fill the card height (± the 1px borders).
test("full-row tap target — the trigger fills its row; the card's top edge hits the trigger, not dead padding", async ({ mount }) => {
  const component = await mount(<RoomOverridesSwitchStory />);
  const trigger = component.getByRole("button", { name: "Post-history" });
  await expect(trigger).toBeVisible();

  const readProbeAtAssertion = async (): Promise<typeof probe> =>
    await trigger.evaluate((btn) => {
      const card = btn.closest('[data-slot="card-root"]') as HTMLElement;
      const rect = card.getBoundingClientRect();
      const topEdgeHit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 2);
      return { inTrigger: btn.contains(topEdgeHit), triggerHeight: btn.getBoundingClientRect().height, cardHeight: rect.height };
    });
  const probe = await trigger.evaluate((btn) => {
    const card = btn.closest('[data-slot="card-root"]') as HTMLElement;
    const rect = card.getBoundingClientRect();
    const topEdgeHit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 2);
    return { inTrigger: btn.contains(topEdgeHit), triggerHeight: btn.getBoundingClientRect().height, cardHeight: rect.height };
  });

  await expect.poll(async () => (await readProbeAtAssertion()).inTrigger).toBe(true);
  expect(Math.abs(probe.triggerHeight - probe.cardHeight)).toBeLessThanOrEqual(2);
});

// ── #822: the Field-overrides triggers meet the coarse-pointer touch floor ────────────────────────────
// MEASURED before the fix (side-eye 2026-08-30 §5-P2, live `--mobile` 430×932): 411×40 with
// `getComputedStyle(el, "::after").inset === "auto"` — no touch pseudo in play at all — and
// `elementFromPoint` ±3px outside the box resolving elsewhere, i.e. a real 40px target against the 44px
// floor, on the tab's FIRST THREE controls. The fix is the `size="control"` variant (the rule row's
// fire-log disclosure took the same arm at #655), which pins the pointer-CONDITIONAL
// `--spacing-control-sm`: 44px coarse, 32px fine. So the desktop box is unchanged and only a finger sees
// the growth — which is why this pin must run under an emulated coarse pointer. A narrow viewport alone
// would not see it: pointer class is a browser-CONTEXT flag, and at a fine pointer the token answers 28.
test.describe("#822: coarse pointer — the Field-overrides disclosures meet the touch floor", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 932 } });

  test("each of the three override triggers is at least the resolved touch floor tall", async ({ mount, page }) => {
    // Settled snapshot: pointer class is fixed when the browser context is created (`hasTouch` above), not
    // page state — there is nothing async for a poll to wait out, and a poll would only mask a config miss.
    await expect.poll(async () => await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

    const component = await mount(<RoomOverridesSwitchStory />);
    // The floor is the RESOLVED token, never a hardcoded 44 — a literal both fails correct fixes and
    // survives a token retune. Asserted against WCAG's number first, so a fine-pointer run (where the
    // token answers 28) cannot read as a pass.
    const floor = await touchFloorPx(page);
    expect(floor).toBeGreaterThanOrEqual(WCAG_TOUCH_FLOOR_PX);

    for (const label of ["Main prompt", "Post-history", "Scenario"]) {
      const trigger = component.getByRole("button", { name: label });
      await expect(trigger).toBeVisible();
      // THE BOX, not a hit sweep: this trigger's floor is a real `min-height` on its own border box
      // (`size="control"`), not an overflowing `::after`, so the box IS the target — and an ancestor sweep
      // would credit the card's padding to it (the #662 hole).
      await expect.poll(async () => (await trigger.boundingBox())?.height, { intervals: [20, 50, 100, 200] }).toBeGreaterThanOrEqual(floor);
    }
  });
});

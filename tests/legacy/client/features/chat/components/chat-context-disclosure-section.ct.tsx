// CT: the This-chat tab's DISCLOSURE SECTION (chat-context-disclosure-section.tsx, #1153).
//
// WHY IT EXISTS. The component was extracted from settings-context-tab.tsx at the `component-size` cap and
// landed with no CT and no ledger waiver, which is what `tests/tooling/chat-component-presence.test.ts` went
// red on. Feeding is the fix: the extracted part carries a real seam of its own, and a waiver would have
// bought silence over it.
//
// SPLIT OF DUTY. `settings-context-tab.ct.tsx` owns WHICH sections the tab declares and which of them open
// by default — that tab IS the production mount and the OPEN/CLOSED default law stays with it. This file
// owns what the component itself promises, which the tab's story structurally cannot show:
//   1. the `defaultOpen` posture is the answer only UNTIL the user gives one, and the user's answer is
//      remembered PER SECTION ID across a remount (the whole reason the posture lives in a store rather
//      than in the tab's render);
//   2. `keepMounted` keeps a CLOSED panel's body in the DOM, which is the precondition for
//   3. the SILENT-CONTRIBUTOR COLLAPSE: a graft whose body renders nothing hides its Section — kicker
//      included — while a graft that renders something keeps its kicker even while closed. Unmount the
//      closed panel and the `has-[…:empty]` selector has nothing to ask, and every silent contributor
//      spends an orphan heading on every room.
//
// The store is device-local and persisted; each Playwright CT gets a fresh page, so no test inherits
// another's expanded set and the story lands its state through the real toggle rather than an effect.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { ChatContextDisclosureSectionStory } from "../_ct-stories.tsx";

/** The four sections the story mounts, by the accessible name of their kicker trigger. */
const OPEN_BY_DEFAULT = "Field overrides";
const CLOSED_BY_DEFAULT = "Host controls";
const SILENT_GRAFT = "Silent plugin";
const LOUD_GRAFT = "Loud plugin";

function trigger(component: Locator, name: string): Locator {
  return component.getByRole("button", { name, exact: true });
}

test("the kicker IS the disclosure, and defaultOpen decides the first frame", async ({ mount }) => {
  const component = await mount(<ChatContextDisclosureSectionStory />);

  // The heading slot is a real button, not a label with a chevron beside it.
  await expect(trigger(component, OPEN_BY_DEFAULT)).toHaveAttribute("aria-expanded", "true");
  await expect(trigger(component, CLOSED_BY_DEFAULT)).toHaveAttribute("aria-expanded", "false");

  // A closed panel WITHOUT keepMounted is gone from the DOM — the arm the graft sections opt out of.
  await expect(component.getByText("the open section's body")).toBeVisible();
  await expect(component.getByText("the closed section's body")).toHaveCount(0);
});

test("the user's answer OUTLIVES the mount, per section id", async ({ mount }) => {
  const component = await mount(<ChatContextDisclosureSectionStory />);

  // Both sections are answered AGAINST their own default, so a remount that simply re-read `defaultOpen`
  // would restore the opposite of what is asserted below — the pin cannot pass on the default alone.
  await trigger(component, CLOSED_BY_DEFAULT).click();
  await trigger(component, OPEN_BY_DEFAULT).click();
  await expect(component.getByText("the closed section's body")).toBeVisible();
  await expect(component.getByText("the open section's body")).toHaveCount(0);

  await component.getByRole("button", { name: "remount the pane" }).click();

  await expect(trigger(component, CLOSED_BY_DEFAULT)).toHaveAttribute("aria-expanded", "true");
  await expect(trigger(component, OPEN_BY_DEFAULT)).toHaveAttribute("aria-expanded", "false");
  await expect(component.getByText("the closed section's body")).toBeVisible();
  await expect(component.getByText("the open section's body")).toHaveCount(0);
});

test("a graft that renders NOTHING hides its whole section; one that renders something keeps its kicker", async ({ mount }) => {
  const component = await mount(<ChatContextDisclosureSectionStory />);

  // Both grafts are CLOSED. The loud one still owns a visible kicker — that is the state the collapse must
  // not swallow — while the silent one is hidden with its heading, so no room spends a heading on nothing.
  await expect(trigger(component, LOUD_GRAFT)).toBeVisible();
  await expect(trigger(component, LOUD_GRAFT)).toHaveAttribute("aria-expanded", "false");
  // Two assertions, because either alone is satisfiable by the wrong thing: the role query proves the
  // trigger left the ACCESSIBILITY TREE (a `toBeHidden` on it would also pass if the section had never
  // rendered), and the text query proves the section is still MOUNTED and merely unpainted — which is what
  // says the collapse hid it rather than the graft failing to render at all.
  await expect(component.getByRole("button", { name: SILENT_GRAFT, exact: true })).toHaveCount(0);
  await expect(component.getByText(SILENT_GRAFT, { exact: true })).toBeHidden();

  // …and the collapse is only ASKABLE because `keepMounted` left both closed bodies in the DOM. Without it
  // the silent graft's wrapper would be unmounted, `:empty` would match nothing, and the orphan kicker the
  // collapse exists to prevent would be the visible result.
  await expect(component.locator('[data-slot="chat-settings-graft-body"]')).toHaveCount(2);

  // Opening the loud graft reveals its body and nothing about the silent one changes.
  await trigger(component, LOUD_GRAFT).click();
  await expect(component.getByText("a contribution that renders something")).toBeVisible();
  await expect(component.getByRole("button", { name: SILENT_GRAFT, exact: true })).toHaveCount(0);
});

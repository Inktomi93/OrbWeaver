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
import { RoomOverridesSwitchStory } from "../_ct-stories";

const SAVED = '[data-testid="room-overrides-saved"]';

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

// Full-row tap target (side-eye P2, WCAG 2.5.8): the block padding lives on the CollapsibleTrigger, not the
// Card, so the WHOLE row is the click/tap surface — previously the trigger was a ~23px band with dead Card
// padding above/below. Probe an UNSET field (Post-history — no snippet, so the card IS just the trigger row):
// a point 2px below the card's top edge (the old dead zone) must now resolve into the trigger button, and the
// trigger must fill the card height (± the 1px borders).
test("full-row tap target — the trigger fills its row; the card's top edge hits the trigger, not dead padding", async ({ mount }) => {
  const component = await mount(<RoomOverridesSwitchStory />);
  const trigger = component.getByRole("button", { name: "Post-history" });
  await expect(trigger).toBeVisible();

  const probe = await trigger.evaluate((btn) => {
    const card = btn.closest('[data-slot="card-root"]') as HTMLElement;
    const rect = card.getBoundingClientRect();
    const topEdgeHit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 2);
    return { inTrigger: btn.contains(topEdgeHit), triggerHeight: btn.getBoundingClientRect().height, cardHeight: rect.height };
  });

  expect(probe.inTrigger).toBe(true);
  expect(Math.abs(probe.triggerHeight - probe.cardHeight)).toBeLessThanOrEqual(2);
});

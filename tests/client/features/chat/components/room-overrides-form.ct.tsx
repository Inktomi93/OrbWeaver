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

  // Chat A (mainPrompt="A-prompt"). Dirty it via the Scenario field so the FormApi is non-default; the
  // debounced autosave carries A's whole overrides — including mainPrompt="A-prompt".
  await component.getByRole("textbox", { name: "Scenario" }).fill("A-scenario");
  await expect(component.locator(SAVED)).toContainText('"mainPrompt":"A-prompt"');

  // Switch to chat B (mainPrompt empty). Edit B's Scenario; the whole saved overrides must reflect B's OWN
  // seed — mainPrompt absent (empty fields omit on save). A leaked A instance would re-save "A-prompt".
  await component.getByRole("button", { name: "switch chat" }).click();
  await component.getByRole("textbox", { name: "Scenario" }).fill("B-scenario");
  await expect(component.locator(SAVED)).toContainText('"scenario":"B-scenario"');
  await expect(component.locator(SAVED)).not.toContainText("A-prompt");
});

// CT: the group-config form (group-config-form.tsx, P3). Reworked onto `createAutosaveEntityForm` — each
// control debounces a WHOLE rebuilt config through `save` (the story renders the last saved config into the
// `group-config-saved` readout). The factory OBLIGATIONS (seed-on-load · key-remount · reseed-guard ·
// onFieldUnmount) are pinned once at the factory level (tests/client/forms/create-autosave-entity-form.ct
// .tsx) — this consumer CT proves the GROUP-CONFIG wiring: the output discriminator switches the DU arm (+
// re-derives the coupled speakerTags default), the scopedCards↔cardScope mapping seam, the narrator arm
// omits cardScope, and the Advanced disclosure reveals policy / member-visibility / auto-mode.

import { expect, test } from "@playwright/experimental-ct-react";
import { GroupConfigFormStory, GroupConfigSwitchStory } from "../_ct-stories.tsx";

const SAVED = '[data-testid="group-config-saved"]';

test("renders the output discriminator + the always-visible toggles (seeded from config)", async ({ mount }) => {
  const component = await mount(<GroupConfigFormStory />);

  await expect(component.getByRole("button", { name: "Per-speaker" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Narrator" })).toBeVisible();
  await expect(component.getByRole("switch", { name: "Label each speaker" })).toBeVisible();
  await expect(component.getByRole("switch", { name: "Nudge the group to stay in character" })).toBeVisible();
});

test("switching output to narrator rebuilds the arm + re-derives the coupled speakerTags default", async ({ mount }) => {
  const component = await mount(<GroupConfigFormStory />);

  await component.getByRole("button", { name: "Narrator" }).click();

  // The whole object is rebuilt onto the narrator arm; speakerTags' default couples to narrator (true).
  await expect(component.locator(SAVED)).toContainText('"output":"narrator"');
  await expect(component.locator(SAVED)).toContainText('"speakerTags":true');
  // The narrator arm is `.strict()` — the whole-object rebuild MUST drop cardScope entirely.
  await expect(component.locator(SAVED)).not.toContainText("cardScope");
});

test("toggling group-nudge commits the whole config", async ({ mount }) => {
  const component = await mount(<GroupConfigFormStory />);

  // DEFAULT groupNudge is true → toggle off.
  await component.getByRole("switch", { name: "Nudge the group to stay in character" }).click();
  await expect(component.locator(SAVED)).toContainText('"groupNudge":false');
});

test("the Advanced disclosure reveals policy · member-visibility · auto-mode", async ({ mount }) => {
  const component = await mount(<GroupConfigFormStory />);

  // Hidden at rest (progressive disclosure).
  await expect(component.getByRole("combobox", { name: "Who speaks each round" })).toHaveCount(0);

  await component.getByRole("button", { name: "Advanced" }).click();

  await expect(component.getByRole("combobox", { name: "Who speaks each round" })).toBeVisible();
  await expect(component.getByRole("combobox", { name: "How much of each member the others see" })).toBeVisible();
  await expect(component.getByRole("switch", { name: "Let characters reply to each other" })).toBeVisible();
  // Card-scope shows on the per-speaker default (narrator has no per-speaker card scope).
  await expect(component.getByRole("switch", { name: "Each character sees only their own card" })).toBeVisible();
});

test("the scopedCards toggle maps to the per-speaker cardScope arm", async ({ mount }) => {
  const component = await mount(<GroupConfigFormStory />);

  await component.getByRole("button", { name: "Advanced" }).click();
  await component.getByRole("switch", { name: "Each character sees only their own card" }).click();

  // The flat `scopedCards` boolean projects back onto the wire `cardScope: "scoped"` (per-speaker arm).
  await expect(component.locator(SAVED)).toContainText('"cardScope":"scoped"');
});

// F1 SWITCH pin (stickler review 2026-07-16-merge-block-28523122): this form mounts under
// ContextTabsPanel, which keys by TAB id only. Switching chats with the Group tab open must remount the
// form on the new chat's identity (keyed ABOVE the hook owner) — else chat A's frozen FormApi survives and
// its config autosaves into chat B. A seeds groupNudge=true, B seeds groupNudge=false (a field the test
// never touches — the decisive tell of WHICH seed is live). Dirty A by toggling label-speakers ON, switch
// to B, then toggle label-speakers on B: the saved config's UNTOUCHED groupNudge must read B's false, never
// A's frozen true.
test("SWITCH pin — switching chats reseeds the form on the new chat, never the previous chat's frozen config", async ({ mount }) => {
  const component = await mount(<GroupConfigSwitchStory />);

  // Chat A (groupNudge=true). Dirty it via a DIFFERENT field so the FormApi is non-default → the leg-3-style
  // teardown/persistence hazard is live: toggle "Label each speaker" ON. The save carries A's groupNudge=true.
  await component.getByRole("switch", { name: "Label each speaker" }).click();
  await expect(component.locator(SAVED)).toContainText('"groupNudge":true');

  // Switch to chat B (groupNudge=false). Toggle label-speakers on B; the whole saved config must carry B's
  // OWN untouched groupNudge=false. A leaked A instance (frozen seed) would save groupNudge=true here.
  await component.getByRole("button", { name: "switch chat" }).click();
  await component.getByRole("switch", { name: "Label each speaker" }).click();
  await expect(component.locator(SAVED)).toContainText('"groupNudge":false');
});

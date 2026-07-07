// CT: the Roster tab controls (roster-panel.tsx, task #29). The panel is now a PURE component (source-
// agnostic, dual-mode J2/J3) — it takes `members` + the three write CALLBACKS and owns no network. So this
// tests it as pure: fixed members in, and each control's callback observed via the story's
// `roster-last-action` readout (the committed verbs / draft store writes are exercised where they're wired
// — the panel's job is only to CALL back with the right args). Proves: a row per member, mute flips the
// value, the talkativeness slider commits, force-turn fires AND stays enabled for a MUTED member (#29),
// and — the DRAFT case — omitting `onForceTurn` drops the Zap entirely (a draft has no turn to force).

import { expect, test } from "@playwright/experimental-ct-react";
import { RosterPanelStory } from "../_ct-stories";

const LAST_ACTION = '[data-testid="roster-last-action"]';

test("renders one control row per member + the (committed) force-turn button", async ({
  mount,
}) => {
  const component = await mount(<RosterPanelStory />);

  await expect(component.locator('[data-slot="roster-row"]')).toHaveCount(2);
  await expect(component.getByRole("button", { name: "Mute Aria" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Make Bryn speak next" })).toBeVisible();
});

test("the mute toggle invokes onSetDisabled with the flipped value", async ({ mount }) => {
  const component = await mount(<RosterPanelStory />);

  // Aria starts unmuted (disabled:false) → mute flips to true.
  await component.getByRole("button", { name: "Mute Aria" }).click();

  await expect(component.locator(LAST_ACTION)).toHaveText("disabled:character_aria:true");
});

test("the talkativeness slider commits onSetTalkativeness (commit-on-release)", async ({
  mount,
}) => {
  const component = await mount(<RosterPanelStory />);

  // Keyboard-drive the thumb (Base UI commits on keyup): +1 step from 0.5.
  const thumb = component.getByRole("slider", { name: "Talkativeness: Aria" });
  await thumb.focus();
  await thumb.press("ArrowRight");

  await expect(component.locator(LAST_ACTION)).toContainText("talkativeness:character_aria:");
});

test("force-turn fires onForceTurn — and stays enabled for a MUTED member (#29)", async ({
  mount,
}) => {
  const component = await mount(<RosterPanelStory />);

  const force = component.getByRole("button", { name: "Make Bryn speak next" });
  // The #29 decision: a muted member (Bryn: disabled) is still summonable — NOT disabled by mute state.
  await expect(force).toBeEnabled();
  await force.click();

  await expect(component.locator(LAST_ACTION)).toHaveText("force:character_bryn");
});

test("a DRAFT roster (no onForceTurn) drops the Zap button — no turn to force pre-commit", async ({
  mount,
}) => {
  const component = await mount(<RosterPanelStory omitForceTurn={true} />);

  await expect(component.locator('[data-slot="roster-row"]')).toHaveCount(2);
  // Mute + talkativeness stay; force-turn is gone.
  await expect(component.getByRole("button", { name: "Mute Aria" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Make Bryn speak next" })).toHaveCount(0);
});

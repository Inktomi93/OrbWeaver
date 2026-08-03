// config-selection store CT — the KINDED drill (the config workspace's ONE selection across N sibling
// collections). A CT, not a unit test, because the store's only read surface is the reactive
// `useCollectionSelection` hook (useSyncExternalStore needs a real browser — the world-info/preset
// selection-store posture).
//
// What it pins that a plain drill store cannot express: the selection carries its KIND, so switching from a
// tag to a script is one write and the host can route CONTENT/CONTEXT off it; and `goToCollection` — the
// intent every retired `openSettingsTo("tags"|"regex")` deep link became — arrives with the group EXPANDED,
// because groups are collapsed by default and a deep link onto a closed door is the defect it would be.

import { expect, test } from "@playwright/experimental-ct-react";
import { ConfigSelectionProbe } from "./_ct-stories";

test("selection carries its KIND, and switching kinds replaces it", async ({ mount }) => {
  const probe = await mount(<ConfigSelectionProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("selection=none");

  await probe.getByRole("button", { name: "select tag member" }).click();
  await expect(state).toContainText("selection=tags:tag_probe");

  await probe.getByRole("button", { name: "select regex member" }).click();
  await expect(state).toContainText("selection=regex:regex_probe");

  await probe.getByRole("button", { name: "clear collection selection" }).click();
  await expect(state).toContainText("selection=none");
});

test("selectCollectionMemberFromList selects AND closes the LIST slide-over", async ({ mount }) => {
  const probe = await mount(<ConfigSelectionProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "open config list sheet" }).click();
  await expect(state).toContainText("openOverlayPanel=list");

  await probe.getByRole("button", { name: "select member from list" }).click();
  await expect(state).toContainText("selection=regex:regex_probe");
  await expect(state).toContainText("openOverlayPanel=none");
});

test("goToCollection lands on the config section with THAT group expanded and no stale member", async ({ mount }) => {
  const probe = await mount(<ConfigSelectionProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "go to chats" }).click();
  await probe.getByRole("button", { name: "select regex member" }).click();
  await expect(state).toContainText("section=chats");
  await expect(state).toContainText("tagsOpen=false");

  await probe.getByRole("button", { name: "go to the tags collection" }).click();
  await expect(state).toContainText("section=config");
  // The group the caller asked for is OPEN — the whole reason the intent carries a kind.
  await expect(state).toContainText("tagsOpen=true");
  // …and it opens on the workspace welcome, not on whatever was last edited.
  await expect(state).toContainText("selection=none");
});

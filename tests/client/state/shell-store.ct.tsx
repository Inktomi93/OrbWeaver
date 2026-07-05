// shell-store CT — drives the hook-backed shell layout store through its module actions and asserts
// the read hooks reflect each transition: section switch, per-panel toggle, and the toggleFocus
// derivation (immersive ⇄ command-center) computed off the two panel fields (no third flag).

import { expect, test } from "@playwright/experimental-ct-react";
import { ShellStoreProbe } from "./_ct-stories";

test("section switch + panel toggle + focus toggle drive the read hooks", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  // Reset to a known baseline (the module store is a page singleton — persist may carry prior state).
  await probe.getByRole("button", { name: "reset" }).click();
  await expect(state).toHaveText(
    "section=chats list=docked context=collapsed immersive=false modal=none",
  );

  // Section switch.
  await probe.getByRole("button", { name: "go corpus" }).click();
  await expect(state).toContainText("section=corpus");

  // Panel toggle: docked → collapsed.
  await probe.getByRole("button", { name: "toggle list" }).click();
  await expect(state).toContainText("list=collapsed");

  // toggleFocus from (list collapsed, context collapsed) → both docked (command-center).
  await expect(state).toContainText("immersive=true");
  await probe.getByRole("button", { name: "toggle focus" }).click();
  await expect(state).toContainText("list=docked context=docked");
  await expect(state).toContainText("immersive=false");

  // toggleFocus again → both collapsed (immersive-ST).
  await probe.getByRole("button", { name: "toggle focus" }).click();
  await expect(state).toContainText("list=collapsed context=collapsed");
  await expect(state).toContainText("immersive=true");
});

test("openModal / closeModal drive the open-modal read", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "reset" }).click();
  await expect(state).toContainText("modal=none");

  await probe.getByRole("button", { name: "open settings" }).click();
  await expect(state).toContainText("modal=settings");

  await probe.getByRole("button", { name: "close modal" }).click();
  await expect(state).toContainText("modal=none");
});

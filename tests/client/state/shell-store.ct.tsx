// shell-store CT — drives the hook-backed shell layout store through its module actions and asserts the
// read hooks reflect each transition: section switch, the PER-SECTION panel override memory (§4.2 rule 2
// — switching away and back restores the section's own override, and a sibling section is unaffected),
// and `useListDocked` (the narrow #state projection chats-section.tsx reads instead of `useShellLayout`).
// The resolve (override ?? default) + toggle/focus derivations live in the app-shell feature hook
// (SECTION_PANEL_DEFAULTS is a feature table the store can't import) and are covered by app-shell.ct.tsx
// — here the store's raw overrides read `none` until explicitly set.

import { expect, test } from "@playwright/experimental-ct-react";
import { ShellStoreProbe } from "./_ct-stories";

test("panel overrides are PER-SECTION: set on one section, remembered, not leaked to another", async ({
  mount,
}) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  // Fresh page → default (chats active, no overrides set).
  await expect(state).toHaveText("section=chats list=none context=none modal=none docked=true");

  // Set the chats list override.
  await probe.getByRole("button", { name: "collapse list" }).click();
  await expect(state).toContainText("section=chats list=collapsed");

  // Switch to corpus — its own (unset) override reads `none`, NOT chats' collapsed (no leak).
  await probe.getByRole("button", { name: "go corpus" }).click();
  await expect(state).toHaveText("section=corpus list=none context=none modal=none docked=true");

  // Switch back to chats — the override is REMEMBERED (§4.2 rule 2).
  await probe.getByRole("button", { name: "go chats" }).click();
  await expect(state).toContainText("section=chats list=collapsed");

  // The other panel is independent — docking context leaves list untouched.
  await probe.getByRole("button", { name: "dock context" }).click();
  await expect(state).toContainText("list=collapsed context=docked");
});

test("openModal / closeModal drive the open-modal read", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("modal=none");

  await probe.getByRole("button", { name: "open settings" }).click();
  await expect(state).toContainText("modal=settings");

  await probe.getByRole("button", { name: "close modal" }).click();
  await expect(state).toContainText("modal=none");
});

test("useListDocked resolves override-over-default, per section, live", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  // No override yet → the probe's literal "docked" default wins.
  await expect(state).toContainText("docked=true");

  await probe.getByRole("button", { name: "collapse list" }).click();
  await expect(state).toContainText("docked=false");

  await probe.getByRole("button", { name: "dock list" }).click();
  await expect(state).toContainText("docked=true");
});

test("useListDocked forces `false` on mobile viewport regardless of override/default", async ({
  mount,
}) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  // Desktop + docked default → docked=true (the pre-existing algebra, unaffected).
  await expect(state).toContainText("docked=true");

  // Mobile: the real panel is never "docked" (a transient sheet) — docked reads false even though the
  // section's own default is "docked" and no override is set (the regression: mobile ChatContent's
  // `showRecents={!listDocked}` must stay true so "Recent chats" renders).
  await probe.getByRole("button", { name: "enter mobile viewport" }).click();
  await expect(state).toContainText("docked=false");

  // Back to desktop — the desktop algebra resumes unchanged.
  await probe.getByRole("button", { name: "enter desktop viewport" }).click();
  await expect(state).toContainText("docked=true");
});

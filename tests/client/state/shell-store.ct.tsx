// shell-store CT — drives the hook-backed shell layout store through its module actions and asserts the
// read hooks reflect each transition: section switch, the PER-SECTION panel override memory (§4.2 rule 2
// — switching away and back restores the section's own override, and a sibling section is unaffected),
// `useListDocked` (the narrow #state projection chats-section.tsx reads instead of `useShellLayout`), the
// settings deep-link (`openSettingsTo`), the CONTEXT tab request (`setContextTab`), and the dual-write
// `revealContextPanel` (writes contextTab + mobileSheet + the CONTEXT panel dock together). The resolve
// (override ?? the section registry's panelDefaults) + toggle/focus derivations live in the app-shell
// feature hook and are covered by app-shell.ct.tsx — here the store's raw overrides read `none` until
// explicitly set.

import { expect, test } from "@playwright/experimental-ct-react";
import { ShellStoreProbe } from "./_ct-stories";

const DEFAULT_STATE =
  "section=chats list=none context=none modal=none docked=true settingsTarget=none contextTab=none mobileSheet=none";

test("panel overrides are PER-SECTION: set on one section, remembered, not leaked to another", async ({
  mount,
}) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  // Fresh page → default (chats active, no overrides set).
  await expect(state).toHaveText(DEFAULT_STATE);

  // Set the chats list override.
  await probe.getByRole("button", { name: "collapse list" }).click();
  await expect(state).toContainText("section=chats list=collapsed");

  // Switch to corpus — its own (unset) override reads `none`, NOT chats' collapsed (no leak).
  await probe.getByRole("button", { name: "go corpus" }).click();
  await expect(state).toHaveText(
    "section=corpus list=none context=none modal=none docked=true settingsTarget=none contextTab=none mobileSheet=none",
  );

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

  await probe.getByRole("button", { name: "open settings", exact: true }).click();
  await expect(state).toContainText("modal=settings");

  await probe.getByRole("button", { name: "close modal" }).click();
  await expect(state).toContainText("modal=none");
});

test("openSettingsTo opens the settings modal AND targets the deep-link category", async ({
  mount,
}) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("modal=none");
  await expect(state).toContainText("settingsTarget=none");

  await probe.getByRole("button", { name: "open settings to tags" }).click();
  await expect(state).toContainText("modal=settings");
  await expect(state).toContainText("settingsTarget=tags");

  // closeModal clears BOTH the modal and the deep-link target (no stale category on reopen).
  await probe.getByRole("button", { name: "close modal" }).click();
  await expect(state).toContainText("modal=none");
  await expect(state).toContainText("settingsTarget=none");
});

test("setContextTab sets the opaque CONTEXT tab request", async ({ mount }) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("contextTab=none");

  await probe.getByRole("button", { name: "set context tab" }).click();
  await expect(state).toContainText("contextTab=members");
});

test("revealContextPanel dual-writes: contextTab + mobileSheet + the CONTEXT panel dock", async ({
  mount,
}) => {
  const probe = await mount(<ShellStoreProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("context=none");
  await expect(state).toContainText("contextTab=none mobileSheet=none");

  await probe.getByRole("button", { name: "reveal context panel" }).click();
  await expect(state).toContainText("context=docked");
  await expect(state).toContainText("contextTab=field mobileSheet=context");
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

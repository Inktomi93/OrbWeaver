// CT: the consolidated Settings CONTEXT tab (settings-context-tab.tsx, Context-Panel-Program §1 CP-1)
// mounted DIRECTLY as the component — its OWN section-composition contract, distinct from
// chats-section.ct's registry-resolve matrix. Pins: both sections render for a host+group; the
// "Group behavior" section is ABSENT for a non-host and ABSENT for a solo roster while "Appearance
// overrides" persists; the section headings are real h3s with the right accessible names (the
// settings-modal idiom). The committed arm routeTrpc-stubs `chat.getGroupConfig` (the Group-behavior
// section's suspense read) + `chat.setRoomOverrides`; the draft arm is store-backed (no network).

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { CommittedSettingsTabStory, DraftSettingsTabStory } from "../_ct-stories";

test("committed host + group: BOTH sections render as h3 headings", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
    "chat.setRoomOverrides": () => ({}),
  });

  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);

  await expect(component.getByRole("heading", { name: "Appearance overrides", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toBeVisible();
});

// The Group-behavior section's suspense read (chat.getGroupConfig) held pending: the QueryBoundary
// fallback must be the shape-matched skeleton (house loading law, UIP-309 / UI-Arch §4.3 rule 7), never
// the old spinner/text void. Hang the query with a route registered BEFORE routeTrpc so it wins the match.
test("committed host + group: the Group-behavior section shows a skeleton (never a spinner void) while loading", async ({ mount, page }) => {
  await page.route("**/api/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procs = decodeURIComponent(url.pathname.split("/api/trpc/")[1] ?? "");
    // Hold the group-config read pending forever so the QueryBoundary stays in its fallback.
    if (procs.includes("chat.getGroupConfig")) {
      return; // never fulfilled — the request hangs
    }
    await route.fallback();
  });
  await routeTrpc(page, { "chat.setRoomOverrides": () => ({}) });

  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={true} />);

  // The section heading renders immediately; its body is the skeleton region while the read is pending.
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toBeVisible();
  const busy = component.locator('[aria-busy="true"]');
  await expect(busy).toBeVisible();
  await expect(busy.locator('[data-slot="skeleton"]').first()).toBeVisible();
  // The old text-only fallback is gone.
  await expect(component.getByText("Loading group settings…")).toHaveCount(0);
});

test("committed non-host: Group behavior is ABSENT, Appearance overrides persists (read-only)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
  });

  const component = await mount(<CommittedSettingsTabStory isHost={false} showGroup={false} />);

  await expect(component.getByRole("heading", { name: "Appearance overrides", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toHaveCount(0);
  // The §8.1 host-only omit is at SECTION level — the overrides field is present but disabled for a member.
  await expect(component.getByLabel("Main prompt", { exact: true })).toBeDisabled();
});

test("committed host + SOLO (non-group): Group behavior is ABSENT, Appearance overrides persists", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.setRoomOverrides": () => ({}),
  });

  // A host of a NON-group chat: showGroup=false (resolveIsGroupChat is false at <2 cast) — the section is
  // omitted even though the viewer is host (the gate is host AND group, both required).
  const component = await mount(<CommittedSettingsTabStory isHost={true} showGroup={false} />);

  await expect(component.getByRole("heading", { name: "Appearance overrides", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toHaveCount(0);
  // Host copy — the overrides field is editable for the host.
  await expect(component.getByLabel("Main prompt", { exact: true })).toBeEnabled();
});

test("draft: Appearance overrides always renders; Group behavior gates on showGroup", async ({ mount }) => {
  const solo = await mount(<DraftSettingsTabStory showGroup={false} />);
  await expect(solo.getByRole("heading", { name: "Appearance overrides", level: 3 })).toBeVisible();
  await expect(solo.getByRole("heading", { name: "Group behavior", level: 3 })).toHaveCount(0);
});

test("draft ≥2 cast: BOTH sections render as h3 headings", async ({ mount }) => {
  const group = await mount(<DraftSettingsTabStory showGroup={true} />);
  await expect(group.getByRole("heading", { name: "Appearance overrides", level: 3 })).toBeVisible();
  await expect(group.getByRole("heading", { name: "Group behavior", level: 3 })).toBeVisible();
});

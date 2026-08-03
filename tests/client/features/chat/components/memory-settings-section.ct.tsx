// CT: the Memory settings SECTION (Phase B ① — memory-settings-section.tsx), the audit's #1 finding fixed.
// The per-user master switch memory.enabled was live-read every turn but unsettable; this section is its
// write path. Drives the production path: getUserSettings seeds the toggle, flipping it fires
// updateUserSettingsSection("memory") with { enabled }. Asserts the mutation fired (route recorder), never a
// UI reaction (busDriven, no refetch).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { MemorySettingsSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = {
  userId: "user_ct_memory",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
};

const ENABLED_VIEW = { ...SETTINGS_VIEW, config: { ...DEFAULT_USER_SETTINGS, memory: { ...DEFAULT_USER_SETTINGS.memory, enabled: true } } };

const UPDATE_PROC = "settings.updateUserSettingsSection";

function stub(page: Page, view: typeof SETTINGS_VIEW = SETTINGS_VIEW): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => view,
    [UPDATE_PROC]: () => ({}),
  });
}

/** The most recent memory-section patch body. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "memory" ? input.patch : undefined;
}

test("mounts with the persisted default (memory OFF) rendered", async ({ mount, page }) => {
  await stub(page);
  await mount(<MemorySettingsSectionStory />);
  await expect(page.getByRole("switch", { name: "Remember earlier in long chats" })).not.toBeChecked();
});

test("flipping the switch ON fires updateUserSettingsSection('memory') with enabled=true", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<MemorySettingsSectionStory />);
  await page.getByRole("switch", { name: "Remember earlier in long chats" }).click();
  await expect.poll(() => lastPatch(trpc)?.["enabled"], { intervals: [20, 50, 100] }).toBe(true);
});

test("from an ENABLED persisted state, flipping OFF fires enabled=false (the reverse direction)", async ({ mount, page }) => {
  const trpc = await stub(page, ENABLED_VIEW);
  await mount(<MemorySettingsSectionStory />);
  await expect(page.getByRole("switch", { name: "Remember earlier in long chats" })).toBeChecked();
  await page.getByRole("switch", { name: "Remember earlier in long chats" }).click();
  await expect.poll(() => lastPatch(trpc)?.["enabled"], { intervals: [20, 50, 100] }).toBe(false);
});

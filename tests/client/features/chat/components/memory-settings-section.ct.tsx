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

const FORWARD_ONLY_NOTE = /affects new activity only/i;
const BACKFILL_JOB_NOTE = /Memory backfill job/i;

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

test("states the manual-backfill model so enabling doesn't look broken", async ({ mount, page }) => {
  // Enabling memory does NOT auto-run a backfill (server: updateUserSettingsSection only emits settingsChanged);
  // the copy must say so and point at the manual Memory backfill job, or an enable looks like a no-op.
  await stub(page);
  await mount(<MemorySettingsSectionStory />);
  await expect(page.getByText(FORWARD_ONLY_NOTE)).toBeVisible();
  await expect(page.getByText(BACKFILL_JOB_NOTE)).toBeVisible();
  // …and the pointer is a DOOR, not a sentence (side-eye 2026-08-08 P3). The note used to end "…under
  // Settings → Jobs", naming a place and leaving the reader to find it; the affordance is what makes the
  // instruction followable, so its PRESENCE is the assertion.
  await expect(page.getByRole("button", { name: "Go to Jobs" })).toBeVisible();
});

test("the note is set as PROSE, at the switch description's step — not the 10.5px gloss default", async ({ mount, page }) => {
  // side-eye 2026-08-08 P2: the load-bearing note rendered a full type step BELOW the switch description it
  // continues. Assert the RESOLVED sizes agree, never a literal px — the tokens own the value.
  await stub(page);
  await mount(<MemorySettingsSectionStory />);
  const noteSize = await page.getByText(FORWARD_ONLY_NOTE).evaluate((el) => getComputedStyle(el).fontSize);
  const descriptionSize = await page
    .locator('[data-slot="field-description"]')
    .first()
    .evaluate((el) => getComputedStyle(el).fontSize);
  expect(noteSize).toBe(descriptionSize);
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

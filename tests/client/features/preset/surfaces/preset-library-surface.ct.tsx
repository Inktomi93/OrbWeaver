// CT: the preset LIBRARY list — the owner's remediation path for the "(edited)" duplicates the copy-on-write
// flood minted (the editor-side fix is pinned in preset-editor-surface.ct.tsx's FORK-ONCE test; these rows are
// the ones already in his library). Deleting them is a per-row ⋯ → Delete → confirm, and the ACTIVE row's
// delete must additionally clear the active-for-generation pointer so no stale id survives.
//
// The built-in row is deliberately NOT deletable (it renders a "Built-in default" subtitle instead of the
// actions menu) — asserted here so a future refactor can't hand the user a delete that the server refuses.
// `preset.list`/`settings.getUserSettings` are stubbed at the NETWORK (routeTrpc); the menu + ConfirmDialog
// render in a PORTAL, so they are located on `page`, not the mounted component.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { PresetLibrarySurfaceStory } from "./_ct-stories";

const BUILT_IN = "preset_00000000000000000000000000";
const EDITED_ONE = "preset_ct_edited0001";
const EDITED_TWO = "preset_ct_edited0002";

const EDITED_ONE_NAME = "Default (edited)";
const EDITED_TWO_NAME = "Default (edited) 2";

function summary(id: string, name: string, isSystemDefault: boolean): Record<string, unknown> {
  return { id, name, kind: isSystemDefault ? "system" : "generation", isSystemDefault, createdAt: 0, updatedAt: 0 };
}

const PRESETS = [summary(BUILT_IN, "Default", true), summary(EDITED_ONE, EDITED_ONE_NAME, false), summary(EDITED_TWO, EDITED_TWO_NAME, false)];

interface RemoveCall {
  readonly id?: string;
}
interface SettingsPatchCall {
  readonly patch?: { readonly defaultPresetId?: string | null };
}

/** The library with `activeId` as the active-for-generation pick. */
function routeLibrary(page: Page, activeId: string | null): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "preset.list": () => PRESETS,
    "settings.getUserSettings": () => ({
      userId: "user_ct_preset",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: activeId } },
      updatedAt: 0,
    }),
    "preset.remove": () => ({}),
    "settings.updateUserSettingsSection": () => ({}),
  });
}

test("an '(edited)' row deletes from its ⋯ menu — and the built-in row offers no delete at all", async ({ mount, page }) => {
  const trpc = await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);

  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();
  // The locked built-in carries no actions menu (its delete would be a server refusal).
  await expect(page.getByRole("button", { name: "Actions for Default", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: `Actions for ${EDITED_TWO_NAME}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  // THE PIN: the duplicate's OWN id reaches `preset.remove` (a row-indexed delete would send the wrong one).
  await expect.poll(() => (trpc.inputs("preset.remove") as RemoveCall[]).map((call) => call.id)).toEqual([EDITED_TWO]);
  // Nothing was active, so nothing clears the pointer.
  // ONESHOT-OK: settled — `onDelete` fires the (conditional) settings write and `preset.remove` in the SAME
  // click handler, and the batch link sends that tick's mutations in ONE request; the recorded remove above
  // therefore proves the request landed, so a settings write, had it happened, is already recorded too.
  expect(trpc.count("settings.updateUserSettingsSection")).toBe(0);
});

test("deleting the ACTIVE '(edited)' row also clears the active-for-generation pointer", async ({ mount, page }) => {
  const trpc = await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);

  await expect(component.getByText("Active", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: `Actions for ${EDITED_ONE_NAME}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect.poll(() => (trpc.inputs("preset.remove") as RemoveCall[]).map((call) => call.id)).toEqual([EDITED_ONE]);
  // The active pointer is nulled in the same gesture — a dangling id would silently fall back mid-generation.
  await expect.poll(() => (trpc.inputs("settings.updateUserSettingsSection") as SettingsPatchCall[]).at(-1)?.patch?.defaultPresetId).toBeNull();
});

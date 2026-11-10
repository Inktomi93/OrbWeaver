// @subject packages/client/src/features/config/components/config-save-footer.tsx
// The pane footer never says Saved over a write that has not happened: a valid draft waiting on its Save says so, and
// a field the form refuses says it needs a fix.

import { routeAuthConfig, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { ADMIN_SAVE_LABEL, adminSaveName } from "#client/features/user-admin/lib/admin-model.ts";
import { SYSTEM_TUNING_SUBCATEGORY } from "#client/features/user-admin/lib/system-tuning-nav.ts";
import type { ConfigSaveFooterStory } from "./_config-save-footer-stories.tsx";

// Any section's Save: the admin grammar with its section left open.
const ANY_ADMIN_SAVE = new RegExp(`^${RegExp.escape(adminSaveName(ADMIN_SAVE_LABEL, ""))}`, "u");

const STORY = "tests/client/features/config/surfaces/_config-save-footer-stories/ConfigSaveFooterStory";
const FOOTER = '[data-slot="config-save-footer"]';
const SAVED = "Saved";
const WAITING_FOR_SAVE = /Not saved\s*A section has changes waiting for Save/u;
const NEEDS_A_FIX = /Not saved\s*A section needs a fix/u;
const SERVED = [
  ...SECTION_PROCEDURES,
  "settings.getUserSettings",
  "settings.listThemes",
  "settings.getAppSettingsWithOverrides",
  "settings.updateAppSettings",
  "settings.updateUserSettingsSection",
  "admin.listUsers",
  "share.status",
  "share.signInMode",
] as const;

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 900 } });

test("a valid admin draft reads as waiting for Save, then Saved once saved", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(caller, SERVED));
  await mount<typeof ConfigSaveFooterStory>(STORY, { group: "admin" });
  const footer = page.locator(FOOTER);
  const depth = page.getByRole("textbox", { name: /^Prompt-cache depth floor/u });
  await expect(depth).toBeVisible();
  // Positive control: before any edit every section has reported and is saved.
  await expect(footer).toHaveText(SAVED);

  const floor = Number(await depth.inputValue());
  await depth.fill(String(floor + 1));
  await expect(footer).toContainText(WAITING_FOR_SAVE);

  await page.getByRole("button", { name: adminSaveName(ADMIN_SAVE_LABEL, SYSTEM_TUNING_SUBCATEGORY.label), exact: true, disabled: false }).click();
  await expect(footer).toHaveText(SAVED);
  expect((await caller.settings.getAppSettingsWithOverrides()).resolved.promptCacheMinDepth).toBe(floor + 1);
});

test("an admin draft Save cannot send needs a fix, not Saved", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(caller, SERVED));
  await mount<typeof ConfigSaveFooterStory>(STORY, { group: "admin" });
  const footer = page.locator(FOOTER);
  const cap = page.getByRole("textbox", { name: /^Max generated-image download/u });
  await expect(cap).toBeVisible();
  await expect(footer).toHaveText(SAVED);

  await cap.fill("");
  await expect(footer).toContainText(NEEDS_A_FIX);
  // The positive control for the reading: no section offers a Save that could send this draft.
  await expect(page.getByRole("button", { name: ANY_ADMIN_SAVE, disabled: false })).toHaveCount(0);
});

// An emptied box is no number: it must read as needing a fix and offer no Save, not become 0 or the field's minimum.
const NUMERIC_ADMIN_FIELDS = [
  { section: "system tuning", name: /^Prompt-cache depth floor/u },
  { section: "memory tuning", name: /^Block size/u },
  { section: "rate limits", name: /^Anonymous requests \/ min \/ IP/u },
] as const;

for (const { section, name } of NUMERIC_ADMIN_FIELDS) {
  test(`a blank ${section} field reads as needing a fix and cannot be saved`, async ({ mount, page }) => {
    await using root = await createServerHarness({ startJobs: false });
    const caller = await root.internalCallerFor(root.ownerId);
    await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
    await routeTrpc(page, serveCorpusProcedures(caller, SERVED));
    await mount<typeof ConfigSaveFooterStory>(STORY, { group: "admin" });
    const footer = page.locator(FOOTER);
    const field = page.getByRole("textbox", { name });
    await expect(field).toBeVisible();
    await expect(footer).toHaveText(SAVED);

    await field.fill("");
    await expect(footer).toContainText(NEEDS_A_FIX);
    await expect(footer).not.toContainText("waiting for Save");
    await expect(page.getByRole("button", { name: ANY_ADMIN_SAVE, disabled: false })).toHaveCount(0);
  });
}

// An autosave form whose field is refused reports `blocked` through the seam hook, and its hosted section draws no
// status of its own, so the footer is the only readout. No hosted pane can reach that state through the server today
// (the one hosted validator, the prose cap, never sees over-cap text because the stored blob heals it on read), so the
// report is made through the production hook beside the real pane.
test("a section whose form refuses its field reads as needing a fix, not as a draft waiting for Save", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(caller, SERVED));
  await mount<typeof ConfigSaveFooterStory>(STORY, { group: "admin", report: { id: "refused-field", state: "blocked" } });
  await expect(page.getByRole("textbox", { name: /^Prompt-cache depth floor/u })).toBeVisible();
  await expect(page.locator(FOOTER)).toContainText(NEEDS_A_FIX);
  await expect(page.locator(FOOTER)).not.toContainText("waiting for Save");
});

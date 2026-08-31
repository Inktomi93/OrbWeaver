// CT: the LOOKS section (#866 S4 / #297 apply-not-mode — config-revamp-design.md §7.3), superseding
// `theme-picker-surface.ct.tsx` (the modal mount died; the picker + builder live in Appearance now).
// Every arm the old CT pinned that survived the re-home is RE-PINNED here on the new anatomy — the O-8
// deferred mint most of all — plus the S4 contracts: picking a card APPLIES (the `selectedThemeId` patch
// through the real write seam; the Hearth card writes NULL — the base theme, no `[data-theme]` block),
// the Your-themes row ⋯ inventory (Apply · Edit in builder · Export · Delete), and Import → createTheme.

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { LooksSectionNarrowStory, LooksSectionStory } from "../_ct-stories.tsx";

const NOW = 0;
interface SeedView {
  readonly id: string;
  readonly name: string;
  readonly override: { readonly background: string; readonly accent: string };
  readonly css: null;
  readonly isSeed: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}
function seed(id: string, name: string, bg: string, accent: string): SeedView {
  return { id, name, override: { background: bg, accent }, css: null, isSeed: true, createdAt: NOW, updatedAt: NOW };
}
const HEARTH = seed("theme_00000000000000000000000001", "Hearth", "oklch(0.158 0.006 60)", "oklch(0.72 0.175 52)");
const MOCHA = seed("theme_00000000000000000000000002", "Mocha", "oklch(0.15 0.015 250)", "oklch(0.7 0.14 250)");
const LIGHT = seed("theme_00000000000000000000000003", "Light", "oklch(0.98 0.004 75)", "oklch(0.55 0.16 50)");
const OWNED = {
  id: "theme_owned01",
  name: "My Theme",
  override: { background: "oklch(0.2 0.02 300)", accent: "oklch(0.7 0.1 300)" },
  css: null,
  isSeed: false,
  createdAt: NOW,
  updatedAt: NOW,
};
const THEMES = [HEARTH, MOCHA, LIGHT, OWNED];
const SETTINGS_VIEW = {
  userId: "user_ct_theme",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS, // theme.selectedThemeId defaults to null ⇒ Hearth is current
  updatedAt: 0,
};
const APPLY_PROC = "settings.updateUserSettingsSection";

function stub(page: Page, extra: Record<string, unknown> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.listThemes": () => THEMES,
    "settings.getUserSettings": () => SETTINGS_VIEW,
    [APPLY_PROC]: () => ({}),
    ...extra,
  });
}

test("the three shipped cards + the owned row render; Hearth is current with no explicit selection", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<LooksSectionStory />);
  for (const name of ["Hearth", "Mocha", "Light"]) {
    await expect(component.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(component.getByText("My Theme", { exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Hearth", exact: true })).toHaveAttribute("aria-pressed", "true");
});

// APPLY-NOT-MODE (#297): the card IS the applying act, through the real write seam — parameterized over
// the three shipped looks. Hearth writes NULL: the base `@theme`, no `[data-theme]` block, and the
// anti-brick reset in one gesture.
for (const [name, expected] of [
  ["Mocha", MOCHA.id],
  ["Light", LIGHT.id],
  ["Hearth", null],
] as const) {
  test(`picking the ${name} card applies it — the selectedThemeId patch says ${expected === null ? "null (the base theme)" : "its id"}`, async ({
    mount,
    page,
  }) => {
    const trpc = await stub(page);
    const component = await mount(<LooksSectionStory />);
    await component.getByRole("button", { name, exact: true }).click();
    await expect.poll(() => trpc.lastInput(APPLY_PROC), { intervals: [20, 50, 100] }).toEqual({ section: "theme", patch: { selectedThemeId: expected } });
  });
}

test("a Your-themes row's ⋯ carries EXACTLY Apply · Edit in builder · Export · Delete, and Apply patches", async ({ mount, page }) => {
  const trpc = await stub(page);
  const component = await mount(<LooksSectionStory />);
  await component.getByRole("button", { name: "Actions for My Theme" }).click();
  for (const item of ["Apply", "Edit in builder", "Export", "Delete"]) {
    await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
  }
  await page.getByRole("menuitem", { name: "Apply" }).click();
  await expect.poll(() => trpc.lastInput(APPLY_PROC), { intervals: [20, 50, 100] }).toEqual({ section: "theme", patch: { selectedThemeId: OWNED.id } });
});

// ── The deferred mint (O-8), re-pinned on the ONE builder door: "New theme from Hearth…" duplicates the
//    CURRENT look at the FIRST REAL EDIT, never on the click.

test("builder door + zero edits + Back mints NOTHING — no row ever existed", async ({ mount, page }) => {
  const trpc = await stub(page, { "settings.duplicateTheme": () => OWNED });
  const component = await mount(<LooksSectionStory />);

  await component.getByRole("button", { name: "New theme from Hearth…" }).click();
  await expect(component.getByRole("textbox", { name: "Theme name" })).toBeVisible();
  await expect(component.locator('[data-slot="autosave-status"]')).toHaveText("Draft — edit to create");
  await component.getByRole("button", { name: "← Back to Looks" }).click();
  await expect(component.getByText("My Theme", { exact: true })).toBeVisible();

  // ONESHOT-OK: read after the list re-rendered; a mint could only have fired during the torn-down session.
  expect(trpc.count("settings.duplicateTheme")).toBe(0);
  // ONESHOT-OK: same settled barrier — either mint landing would be the same defect.
  expect(trpc.count("settings.createTheme")).toBe(0);
});

test("the first real edit mints the copy of the CURRENT look — and the autosave patches THAT row", async ({ mount, page }) => {
  const trpc = await stub(page, { "settings.duplicateTheme": () => OWNED, "settings.updateTheme": () => OWNED });
  const component = await mount(<LooksSectionStory />);

  await component.getByRole("button", { name: "New theme from Hearth…" }).click();
  await component.getByRole("textbox", { name: "Theme name" }).fill("Hearth but mine");

  await expect.poll(() => trpc.lastInput("settings.duplicateTheme"), { intervals: [20, 50, 100] }).toEqual({ id: HEARTH.id });
  await expect
    .poll(() => trpc.lastInput("settings.updateTheme"), { intervals: [50, 100, 200] })
    .toMatchObject({ id: OWNED.id, input: { name: "Hearth but mine" } });
  // ONESHOT-OK: reads AFTER the awaited updateTheme poll settled — no further mint can arrive from this edit.
  expect(trpc.count("settings.duplicateTheme")).toBe(1);
});

test("Edit in builder autosaves an OWNED row — no Save button, no mint", async ({ mount, page }) => {
  const trpc = await stub(page, { "settings.updateTheme": () => OWNED });
  const component = await mount(<LooksSectionStory />);

  await component.getByRole("button", { name: "Actions for My Theme" }).click();
  await page.getByRole("menuitem", { name: "Edit in builder" }).click();
  const nameField = component.getByRole("textbox", { name: "Theme name" });
  await expect(nameField).toBeVisible();
  await expect(component.getByRole("button", { name: "Save theme" })).toHaveCount(0);

  await nameField.fill("My Theme, retouched");
  await expect
    .poll(() => trpc.lastInput("settings.updateTheme"), { intervals: [50, 100, 200] })
    .toMatchObject({ id: OWNED.id, input: { name: "My Theme, retouched" } });
  // ONESHOT-OK: after the settled update — an owned edit must never mint.
  expect(trpc.count("settings.duplicateTheme")).toBe(0);
});

test("Delete does not destroy immediately — it opens an AlertDialog confirm (F4)", async ({ mount, page }) => {
  const trpc = await stub(page, { "settings.removeTheme": () => ({}) });
  const component = await mount(<LooksSectionStory />);
  await component.getByRole("button", { name: "Actions for My Theme" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByText("Delete this theme?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  // ONESHOT-OK: reads AFTER the awaited alertdialog assertions; the still-open confirm makes a later fire impossible.
  expect(trpc.count("settings.removeTheme")).toBe(0);
});

test("Export downloads the row's own bytes; Import feeds createTheme the parsed file", async ({ mount, page }) => {
  const trpc = await stub(page, { "settings.createTheme": () => OWNED });
  const component = await mount(<LooksSectionStory />);

  await component.getByRole("button", { name: "Actions for My Theme" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("My Theme.orbtheme.json");
  const path = await download.path();
  const exported: unknown = JSON.parse(readFileSync(path, "utf8"));
  expect(exported).toEqual({ name: OWNED.name, override: OWNED.override, css: null });

  // Import the SAME bytes back — the round-trip is identity at the create input.
  const file = join(tmpdir(), "cbc34-looks-import-fixture.json");
  writeFileSync(file, JSON.stringify({ name: "Weft", override: OWNED.override, css: null }));
  const chooserPromise = page.waitForEvent("filechooser");
  await component.getByRole("button", { name: "Import a theme file" }).click();
  await (await chooserPromise).setFiles(file);
  await expect.poll(() => trpc.lastInput("settings.createTheme"), { intervals: [50, 100, 200] }).toEqual({ name: "Weft", override: OWNED.override });
});

test("at the 430px pushed-pane width the shipped cards WRAP and the builder door stays inside", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<LooksSectionNarrowStory />);
  const host = page.getByTestId("looks-narrow-host");
  await expect(host).toBeVisible();
  const hostBox = await host.boundingBox();
  const door = component.getByRole("button", { name: "New theme from Hearth…" });
  await expect(door).toBeVisible();
  const doorBox = await door.boundingBox();
  expect(doorBox, "builder door has no box").not.toBeNull();
  expect(doorBox === null || hostBox === null ? -1 : hostBox.x + hostBox.width - (doorBox.x + doorBox.width), "door overhangs the host").toBeGreaterThan(-1);
});

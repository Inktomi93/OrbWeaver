// CT: the decomposed APPEARANCE PANE (SET-SEAMS stage 1). The pane is a `{kind:"sections"}` SKIMMER now —
// it has no surface of its own — so the only honest mount is the real settings shell, which is also the
// only place the §3 aggregate save-status host and the derived nav exist. Everything here is a PANE-level
// invariant; per-section reads/writes are pinned by each section's own CT at its owner's mirror path.
//
// Covers, from the SET-SEAMS §9 plan: the shared render-parity geometry harness · door order IS render
// order · P2 sibling isolation (a section's save leaves its siblings' edits and values alone) · P4 status
// aggregation (ONE footer, error > saved, inline retry AT the failing section, nav marker) · P5 nav/search
// parity for the subs that moved or were absorbed · the §7.4 sub-level deep link.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcResponder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc.ts";
import { findSettingsColumnViolation, readSettingsPaneGeometry } from "../../../../support/ct/settings-geometry.ts";
import { ConfigHostStory } from "../../config/_ct-stories.tsx";
import { AppearanceGroupStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_appearance_pane", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";

/** The anchors rendered AT REST, in door order (#866 S4): Looks leads (the theme fold), and the three
 *  `advanced` sections (sizing & motion · reading typography · effects) live INSIDE the collapsed
 *  "Customize this look" fold — their anchors only exist once the fold opens (asserted separately). */
const ANCHOR_ORDER = [
  "config-anchor-appearance-looks",
  "config-anchor-appearance-message-style",
  "config-anchor-appearance-avatars",
  "config-anchor-appearance-message-details",
  "config-anchor-appearance-background",
  "config-anchor-appearance-library",
];

/** The anchors the FOLD reveals, in door order — the fold panel renders AFTER the plain sections. */
const FOLDED_ANCHORS = ["config-anchor-appearance-sizing", "config-anchor-appearance-reading-typography", "config-anchor-appearance-effects"];
const EXPANDED_ANCHOR_ORDER = [...ANCHOR_ORDER, ...FOLDED_ANCHORS];

/** The nav rows the pane DERIVES from its contributions, in door order — the FOLD never hides a row (the
 *  LIST stays the map); a section that declares a `navLabel` shows THAT here. */
const NAV_LABELS = ["Looks", "Message style", "Avatars", "Sizing & motion", "Message details", "Background", "Reading typography", "Effects", "Library"];

/** The Looks section's theme reads (#866 S4) — three seeds, no owned rows. */
const LOOKS_THEMES = [
  { id: "theme_00000000000000000000000001", name: "Hearth", override: {}, css: null, isSeed: true, isDefault: true, createdAt: 0, updatedAt: 0 },
  { id: "theme_00000000000000000000000002", name: "Mocha", override: {}, css: null, isSeed: true, isDefault: false, createdAt: 0, updatedAt: 0 },
  { id: "theme_00000000000000000000000003", name: "Light", override: {}, css: null, isSeed: true, isDefault: false, createdAt: 0, updatedAt: 0 },
];

function stub(page: Page, update: TrpcResponder = (): unknown => ({})): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    // The config LIST paints every shelf, so the four collection bands read their rosters for the counts —
    // fed empty (the honest fresh-library arm) rather than left to routeTrpc's inert null.
    "tag.listTagsWithUsage": [],
    "regex.listScripts": [],
    "worldInfo.listBooksWithUsage": [],
    "rosterPreset.list": [],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "settings.listThemes": () => LOOKS_THEMES,
    "sessions.me": () => ({ user: { id: SETTINGS_VIEW.userId, role: "user" } }),
    [UPDATE_PROC]: update,
  });
}

/** Every `appearance` section-patch recorded so far. */
function patches(trpc: TrpcRecorder): Record<string, unknown>[] {
  return trpc
    .inputs(UPDATE_PROC)
    .map((input) => input as { section?: string; patch?: Record<string, unknown> })
    .filter((input) => input.section === "appearance")
    .map((input) => input.patch ?? {});
}

/** How many recorded patches named `key` — the per-section save counter (each section owns disjoint keys). */
function patchCountFor(trpc: TrpcRecorder, key: string): number {
  return patches(trpc).filter((patch) => key in patch).length;
}

test("at rest the skimmer renders Looks + the plain sections in door order — the fold's three are CLOSED", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceGroupStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();
  await expect
    .poll(async () => await page.evaluate(() => [...document.querySelectorAll('[id^="config-anchor-appearance-"]')].map((el) => el.id)))
    .toStrictEqual(ANCHOR_ORDER);
});

// Single-column-of-SECTIONS (owner ruling — Discord grammar): every subcategory SECTION shares the same
// left edge + full column width and stacks in registry order (never two sections side by side). Runs the
// SHARED render-parity harness (SET-SEAMS §9) — a decomposition that moves the pixels is a defect.
test("subcategory sections are a single column, stacked in registry order", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceGroupStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  const geometry = await readSettingsPaneGeometry(page, "appearance");
  expect(findSettingsColumnViolation(geometry, ANCHOR_ORDER.length)).toBeNull();
});

// #297's explicit custom arm (#866 S4): the fine-tuning knobs ride ONE collapsed disclosure. Opening it
// reveals the three advanced sections in door order; at rest their anchors do not exist (the rest-state
// half is the ANCHOR_ORDER assertion above).
test("the Customize-this-look fold opens to the three advanced sections, in door order", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceGroupStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  await page.getByRole("button", { name: /Customize this look/ }).click();
  await expect
    .poll(async () => await page.evaluate(() => [...document.querySelectorAll('[id^="config-anchor-appearance-"]')].map((el) => el.id)))
    .toStrictEqual(EXPANDED_ANCHOR_ORDER);
});

// R-BG (#866 S4): the background is picked by THUMBNAIL — the kind DERIVES from the tapped tile and every
// selection field rides ONE autosave patch (BG-D). Red-first: the pre-S4 surface had no grid at all.
test("tapping a seeded background tile writes kind+id in ONE patch; the None tile clears", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceGroupStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  const grid = page.getByRole("grid", { name: "Background image" });
  await grid.scrollIntoViewIfNeeded();
  await grid.getByRole("gridcell", { name: "Misty highlands" }).click();
  await expect
    .poll(() => patches(trpc).find((patch) => patch["backgroundImageKind"] === "seeded")?.["backgroundSeededId"], { intervals: [50, 100, 200] })
    .toBe("misty-highlands");

  await grid.getByRole("gridcell", { name: "No background" }).click();
  await expect.poll(() => patches(trpc).some((patch) => patch["backgroundImageKind"] === "none"), { intervals: [50, 100, 200] }).toBe(true);
});

// The DERIVED library population (R-BG): every `backgroundLibrary` entry is a tile, and removing the
// SELECTED entry resets the selection to None in the SAME patch (never a dangling assetId).
test("library entries render as tiles; Remove-from-library of the selected entry resets to None", async ({ mount, page }) => {
  const entryA = { entryId: "e1", assetId: "asset_00000000000000000000000001", assetHash: "hashaaa", mime: "image/png", name: "My dock" };
  const entryB = { entryId: "e2", assetId: "asset_00000000000000000000000002", assetHash: "hashbbb", mime: "image/png", name: "My forest" };
  const withLibrary = {
    ...SETTINGS_VIEW,
    config: {
      ...DEFAULT_USER_SETTINGS,
      appearance: {
        ...DEFAULT_USER_SETTINGS.appearance,
        backgroundImageKind: "asset",
        backgroundAssetId: entryA.assetId,
        backgroundAssetHash: entryA.assetHash,
        backgroundAssetMime: entryA.mime,
        backgroundLibrary: [entryA, entryB],
      },
    },
  };
  const trpc = await routeTrpc(page, {
    "tag.listTagsWithUsage": [],
    "regex.listScripts": [],
    "worldInfo.listBooksWithUsage": [],
    "rosterPreset.list": [],
    "settings.getUserSettings": () => withLibrary,
    "settings.listThemes": () => LOOKS_THEMES,
    "sessions.me": () => ({ user: { id: SETTINGS_VIEW.userId, role: "user" } }),
    [UPDATE_PROC]: () => ({}),
  });
  await mount(<AppearanceGroupStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  const grid = page.getByRole("grid", { name: "Background image" });
  await grid.scrollIntoViewIfNeeded();
  // Both entries are tiles (derived population, two planted), and the selected one wears aria-selected.
  await expect(grid.getByRole("gridcell", { name: "My dock" })).toBeVisible();
  await expect(grid.getByRole("gridcell", { name: "My forest" })).toBeVisible();
  await expect(grid.getByRole("gridcell", { name: "My dock" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Actions for My dock" }).click();
  await page.getByRole("menuitem", { name: "Remove from library" }).click();
  await expect
    .poll(
      () => {
        const patch = patches(trpc).find((p) => Array.isArray(p["backgroundLibrary"]) && (p["backgroundLibrary"] as unknown[]).length === 1);
        return patch === undefined
          ? null
          : { kind: patch["backgroundImageKind"], rows: (patch["backgroundLibrary"] as { entryId: string }[]).map((r) => r.entryId) };
      },
      { intervals: [50, 100, 200] },
    )
    .toEqual({ kind: "none", rows: ["e2"] });
});

// P2 — SIBLING ISOLATION (SET-SEAMS §9). The whole reason patches are key-minimal: section A's debounced
// save must not carry, re-seed, or stomp section B's state. Two sections of ONE namespace, edited in turn.
test("a section's save carries none of its siblings' keys and never re-fires or resets them", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceGroupStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  // B: Effects — inside the Customize-this-look fold now (#866 S4): open it, BARRIER on the panel's
  // height settling (the open animation moves the select trigger, and an anchored popup over a moving
  // trigger is never "stable" — ct-collapsible height-stability), then pick a texture.
  await page.getByRole("button", { name: /Customize this look/ }).click();
  const effectsAnchor = page.locator("#config-anchor-appearance-effects");
  await expect(effectsAnchor).toBeVisible();
  let lastHeight = -1;
  await expect
    .poll(
      async () => {
        const box = await effectsAnchor.boundingBox();
        const settled = box !== null && box.height === lastHeight;
        lastHeight = box?.height ?? -1;
        return settled;
      },
      { intervals: [100, 150, 200, 300] },
    )
    .toBe(true);
  await page.getByRole("combobox", { name: "Surface texture" }).click();
  await page.getByRole("option", { name: "Film grain" }).click();
  await expect.poll(() => patchCountFor(trpc, "surfaceTexture"), { intervals: [20, 50, 100] }).toBe(1);

  // A: Avatars — change a sibling section, wait for ITS save.
  await page.getByRole("combobox", { name: "Avatar size" }).click();
  await page.getByRole("option", { name: "Large" }).click();
  await expect.poll(() => patchCountFor(trpc, "avatarSize"), { intervals: [20, 50, 100] }).toBe(1);

  // A's payload names A's keys only — `surfaceTexture` is nowhere in it (a full-blob patch would have
  // carried A's STALE copy of it and silently reverted B; SET-SEAMS §2.1).
  const avatarPatch = patches(trpc).find((patch) => "avatarSize" in patch) ?? {};
  expect("surfaceTexture" in avatarPatch).toBe(false);
  expect(Object.keys(avatarPatch).sort()).toStrictEqual(["avatarAspect", "avatarRing", "avatarShape", "avatarSize", "showInChatAvatars"]);

  // …and B neither re-saved nor lost its value (no reseed churn — §2.2's projection-equality property).
  expect(patchCountFor(trpc, "surfaceTexture")).toBe(1);
  await expect(page.getByRole("combobox", { name: "Surface texture" })).toContainText("Film grain");
});

// P4 — STATUS AGGREGATION (SET-SEAMS §3/§9). Eight sections, ONE footer: the host renders the aggregate,
// and RETRY stays local to the section that owns the failed edit.
test("the pane shows exactly ONE aggregate save footer, not one per section", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceGroupStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  // Drive one real save so the sections have reported.
  await page.getByRole("switch", { name: "Auto-fix unfinished formatting" }).click();
  await expect(page.locator('[data-slot="config-save-footer"]')).toHaveCount(1);
  // Hosted sections render NO inline status while they are healthy — the footer is the only readout.
  await expect(page.locator('[data-slot="autosave-status"]')).toHaveCount(0);
});

test("a failing save lights the aggregate footer, an INLINE retry at the failing section, and a nav marker", async ({ mount, page }) => {
  await stub(page, () => trpcError({ code: "INTERNAL_SERVER_ERROR", message: "nope" }));
  await mount(<AppearanceGroupStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  await page.getByRole("combobox", { name: "Avatar size" }).click();
  await page.getByRole("option", { name: "Large" }).click();

  // The aggregate is read-only and LOCATES the failure (never a retry-all, D41).
  const footer = page.locator('[data-slot="config-save-footer"]');
  await expect(footer).toHaveCount(1);
  await expect(footer.getByText("A section failed to save —")).toBeVisible();
  await expect(footer.getByRole("button", { name: "Show me" })).toBeVisible();

  // The failing section — and only it — renders its OWN inline retry at its own anchor.
  const avatars = page.locator("#config-anchor-appearance-avatars");
  await expect(avatars.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.locator('[data-slot="autosave-status"]')).toHaveCount(1);

  // …and its nav row carries the locator marker — EXACTLY this word, never composed with "Modified"
  // (#1712, owner default: precedence stays). This section's picked value ("Large") already differs from
  // its default ("md", `appearance.ts`'s `avatarSize` schema) — a save-failed row is definitionally also a
  // modified one — and `{ exact: true }` is the receipt that the row states that ONE fact once, not both.
  await expect(page.getByRole("region", { name: "Settings groups" }).getByText("Save failed", { exact: true })).toBeVisible();
});

// P5 — NAV/SEARCH PARITY (SET-SEAMS §7.2/§7.3). The pane's nav DERIVES from the contributions now; a leaf
// whose section was absorbed by a sibling must still be findable and must still jump to a REAL anchor.
test("the derived nav lists every contributed section, in door order", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceGroupStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  const nav = page.getByRole("region", { name: "Settings groups" });
  await Promise.all(NAV_LABELS.map((label) => expect(nav.getByText(label, { exact: true })).toBeVisible()));
});

// §7.4 / §10 Q4 — a SUB-level deep link resolves the pane in render and lands on the section's anchor once
// the pane's DOM has it. The sub ids are byte-identical across the move, so old links keep working.
test("a sub-level deep link lands on the moved section's anchor", async ({ mount, page }) => {
  await stub(page);
  await mount(<ConfigHostStory target="appearance" sub="reading-typography" />);

  await expect(page.locator("#config-anchor-appearance-reading-typography")).toBeVisible();
  await expect(page.getByRole("slider", { name: "Line height" })).toBeVisible();
});

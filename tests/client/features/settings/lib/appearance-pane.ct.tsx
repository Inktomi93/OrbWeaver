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
import type { TrpcRecorder, TrpcResponder } from "../../../../support/ct/route-trpc";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { findSettingsColumnViolation, readSettingsPaneGeometry } from "../../../../support/ct/settings-geometry";
import { AppearancePaneStory, SettingsShellDeepLinkStory } from "../_ct-stories";

const SETTINGS_VIEW = { userId: "user_ct_appearance_pane", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";

/** The pane's eight sections, in the door's declared order (main.tsx) — which IS the render order. */
const ANCHOR_ORDER = [
  "settings-anchor-appearance-message-style",
  "settings-anchor-appearance-avatars",
  "settings-anchor-appearance-sizing",
  "settings-anchor-appearance-message-details",
  "settings-anchor-appearance-background",
  "settings-anchor-appearance-reading-typography",
  "settings-anchor-appearance-effects",
  "settings-anchor-appearance-library",
];

/** The nav rows the pane DERIVES from its contributions, in door order. */
const NAV_LABELS = ["Message style", "Avatars", "Sizing & motion", "Message details & actions", "Background", "Reading typography", "Effects", "Library"];
/** The absorbed `motion` sub's surviving search leaf. */
const REDUCE_MOTION_LEAF = /Reduce motion/;

function stub(page: Page, update: TrpcResponder = (): unknown => ({})): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => SETTINGS_VIEW,
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

test("the skimmer renders all eight contributed sections, in the door's declared order", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearancePaneStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  const anchorIds = await page.evaluate(() => [...document.querySelectorAll('[id^="settings-anchor-appearance-"]')].map((el) => el.id));
  expect(anchorIds).toStrictEqual(ANCHOR_ORDER);
});

// Single-column-of-SECTIONS (owner ruling — Discord grammar): every subcategory SECTION shares the same
// left edge + full column width and stacks in registry order (never two sections side by side). Runs the
// SHARED render-parity harness (SET-SEAMS §9) — a decomposition that moves the pixels is a defect.
test("subcategory sections are a single column, stacked in registry order", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearancePaneStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  const geometry = await readSettingsPaneGeometry(page, "appearance");
  expect(findSettingsColumnViolation(geometry, ANCHOR_ORDER.length)).toBeNull();
});

// P2 — SIBLING ISOLATION (SET-SEAMS §9). The whole reason patches are key-minimal: section A's debounced
// save must not carry, re-seed, or stomp section B's state. Two sections of ONE namespace, edited in turn.
test("a section's save carries none of its siblings' keys and never re-fires or resets them", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearancePaneStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  // B: Effects — pick a texture, wait for ITS save.
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
  await mount(<AppearancePaneStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  // Drive one real save so the sections have reported.
  await page.getByRole("switch", { name: "Auto-fix unfinished formatting" }).click();
  await expect(page.locator('[data-slot="settings-save-footer"]')).toHaveCount(1);
  // Hosted sections render NO inline status while they are healthy — the footer is the only readout.
  await expect(page.locator('[data-slot="autosave-status"]')).toHaveCount(0);
});

test("a failing save lights the aggregate footer, an INLINE retry at the failing section, and a nav marker", async ({ mount, page }) => {
  await stub(page, () => trpcError({ code: "INTERNAL_SERVER_ERROR", message: "nope" }));
  await mount(<AppearancePaneStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  await page.getByRole("combobox", { name: "Avatar size" }).click();
  await page.getByRole("option", { name: "Large" }).click();

  // The aggregate is read-only and LOCATES the failure (never a retry-all, D41).
  const footer = page.locator('[data-slot="settings-save-footer"]');
  await expect(footer).toHaveCount(1);
  await expect(footer.getByText("A section failed to save —")).toBeVisible();
  await expect(footer.getByRole("button", { name: "Show me" })).toBeVisible();

  // The failing section — and only it — renders its OWN inline retry at its own anchor.
  const avatars = page.locator("#settings-anchor-appearance-avatars");
  await expect(avatars.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.locator('[data-slot="autosave-status"]')).toHaveCount(1);

  // …and its nav row carries the locator marker.
  await expect(page.getByRole("navigation", { name: "Settings sections" }).getByText("Save failed")).toBeVisible();
});

// P5 — NAV/SEARCH PARITY (SET-SEAMS §7.2/§7.3). The pane's nav DERIVES from the contributions now; a leaf
// whose section was absorbed by a sibling must still be findable and must still jump to a REAL anchor.
test("the derived nav lists every contributed section, in door order", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearancePaneStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  const nav = page.getByRole("navigation", { name: "Settings sections" });
  await Promise.all(NAV_LABELS.map((label) => expect(nav.getByText(label, { exact: true })).toBeVisible()));
});

test("a search leaf whose section was ABSORBED still jumps to a live anchor", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearancePaneStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  // "Reduce motion" lost its own `motion` sub in the merge; its LEAF travelled into Sizing & motion.
  await page.getByRole("combobox", { name: "Search settings" }).fill("reduce motion");
  const result = page.getByRole("option", { name: REDUCE_MOTION_LEAF }).first();
  await expect(result).toBeVisible();
  await result.click();

  // The jump landed on a section that EXISTS and scrolled it into view — a stale leaf pointing at the
  // retired `motion` anchor would silently scroll to nothing.
  await expect(page.locator("#settings-anchor-appearance-sizing")).toBeInViewport();
  await expect(page.getByRole("switch", { name: "Reduce motion" })).toBeVisible();
});

// §7.4 / §10 Q4 — a SUB-level deep link resolves the pane in render and lands on the section's anchor once
// the pane's DOM has it. The sub ids are byte-identical across the move, so old links keep working.
test("a sub-level deep link lands on the moved section's anchor", async ({ mount, page }) => {
  await stub(page);
  await mount(<SettingsShellDeepLinkStory target="appearance" subId="reading-typography" />);

  await expect(page.locator("#settings-anchor-appearance-reading-typography")).toBeVisible();
  await expect(page.getByRole("slider", { name: "Line height" })).toBeVisible();
});

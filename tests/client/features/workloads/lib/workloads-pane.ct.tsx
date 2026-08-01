// CT: the decomposed WORKLOADS PANE (SET-SEAMS stage 3). The pane is a `{kind:"sections"}` SKIMMER now — it
// has no surface of its own — so the only honest mount is the real settings shell, which is also the only
// place the derived nav and the §3 aggregate save-status host exist. Everything here is a PANE-level
// invariant; per-section reads/writes are pinned by each section's own CT at its mirror path.
//
// Covers, from the SET-SEAMS §9 plan: the shared render-parity geometry harness · door order IS render order
// · P5 nav/search parity for the two moved subs · the §7.4 sub-level deep link onto a moved section · the
// pane's per-user (NOT admin-gated) visibility.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { findSettingsColumnViolation, readSettingsPaneGeometry } from "../../../../support/ct/settings-geometry";
import { SettingsShellDeepLinkStory, SettingsShellStory } from "../../settings/_ct-stories";
import { WorkloadsPaneStory } from "../_ct-stories";

const USER_VIEWER = { userId: "user_ct_kes", handle: "kes", globalRole: "user" };

/** The three sections at the `workloads` anchor, in the door's declared order (main.tsx) — which IS the
 *  render order: the two that moved out of the retired pane surface, then the analysis-tuning section. */
const ANCHOR_ORDER = ["settings-anchor-workloads-jobs", "settings-anchor-workloads-schedules", "settings-anchor-workloads-tuning"];

/** The nav rows the pane DERIVES from its contributions, in door order. */
const NAV_LABELS = ["Jobs", "Schedules", "Analysis tuning"];
/** A moved section's surviving search leaf (the option row also carries its category label). */
const CREATE_SCHEDULE_LEAF = /Create a schedule/;

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => ({ userId: USER_VIEWER.userId, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 }),
    "sessions.me": () => USER_VIEWER,
    "workloads.list": () => [],
    "workloads.listSchedules": () => [],
  });
}

test("the Workloads category shows in the shell nav for a PLAIN user (per-user, not admin-gated)", async ({ mount, page }) => {
  await stub(page);

  const component = await mount(<SettingsShellStory />);
  const workloadsNav = component.getByRole("button", { name: "Workloads" });
  await expect(workloadsNav).toBeVisible();
  await workloadsNav.click();

  // The real pane (not a placeholder): the jobs section's run affordance + filter tabs render.
  await expect(page.getByTestId("workloads-run-button")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Running" })).toBeVisible();
});

test("the skimmer renders all three workloads sections, in the door's declared order", async ({ mount, page }) => {
  await stub(page);
  await mount(<WorkloadsPaneStory />);
  await page.getByRole("heading", { name: "Jobs" }).waitFor();

  const anchorIds = await page.evaluate(() => [...document.querySelectorAll('[id^="settings-anchor-workloads-"]')].map((el) => el.id));
  expect(anchorIds).toStrictEqual(ANCHOR_ORDER);
});

// Single-column-of-SECTIONS (owner ruling — Discord grammar): every subcategory SECTION shares the same left
// edge + full column width and stacks in registry order. Runs the SHARED render-parity harness (SET-SEAMS
// §9) — a decomposition that moves the pixels is a defect.
test("subcategory sections are a single column, stacked in registry order", async ({ mount, page }) => {
  await stub(page);
  await mount(<WorkloadsPaneStory />);
  await page.getByRole("heading", { name: "Jobs" }).waitFor();

  const geometry = await readSettingsPaneGeometry(page, "workloads");
  expect(findSettingsColumnViolation(geometry, ANCHOR_ORDER.length)).toBeNull();
});

// P5 — NAV/SEARCH PARITY (SET-SEAMS §7.2/§7.3). The pane's nav DERIVES from the contributions now; the two
// moved subs keep their labels, their leaves, and their (category, subId) anchors.
test("the derived nav lists every contributed section, in door order", async ({ mount, page }) => {
  await stub(page);
  await mount(<WorkloadsPaneStory />);
  await page.getByRole("heading", { name: "Jobs" }).waitFor();

  const nav = page.getByRole("navigation", { name: "Settings sections" });
  await Promise.all(NAV_LABELS.map((label) => expect(nav.getByText(label, { exact: true })).toBeVisible()));
});

test("a search leaf of a MOVED section still jumps to a live anchor", async ({ mount, page }) => {
  await stub(page);
  await mount(<WorkloadsPaneStory />);
  await page.getByRole("heading", { name: "Jobs" }).waitFor();

  // "Create a schedule" travelled with the schedules section into its own nav file (§7.2).
  await page.getByRole("combobox", { name: "Search settings" }).fill("cadence");
  const result = page.getByRole("option", { name: CREATE_SCHEDULE_LEAF }).first();
  await expect(result).toBeVisible();
  await result.click();

  // The jump landed on a section that EXISTS and scrolled it into view — a stale leaf pointing at a retired
  // anchor would silently scroll to nothing.
  await expect(page.locator("#settings-anchor-workloads-schedules")).toBeInViewport();
  await expect(page.getByTestId("schedule-create-button")).toBeVisible();
});

// §7.4 / §10 Q4 — a SUB-level deep link resolves the pane in render and lands on the section's anchor once
// the pane's DOM has it. The sub ids are byte-identical across the move, so old links keep working.
test("a sub-level deep link lands on the moved section's anchor", async ({ mount, page }) => {
  await stub(page);
  await mount(<SettingsShellDeepLinkStory target="workloads" subId="schedules" />);

  await expect(page.locator("#settings-anchor-workloads-schedules")).toBeVisible();
  await expect(page.getByTestId("schedule-create-button")).toBeVisible();
});

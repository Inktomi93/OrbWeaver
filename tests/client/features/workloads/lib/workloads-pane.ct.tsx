// CT: the decomposed WORKLOADS PANE (SET-SEAMS stage 3). The pane is a `{kind:"sections"}` SKIMMER now — it
// has no surface of its own — so the only honest mount is the real settings shell, which is also the only
// place the derived nav and the §3 aggregate save-status host exist. Everything here is a PANE-level
// invariant; per-section reads/writes are pinned by each section's own CT at its mirror path.
//
// Covers, from the SET-SEAMS §9 plan: the shared render-parity geometry harness · door order IS render order
// · P5 nav/search parity for the two moved subs · the §7.4 sub-level deep link onto a moved section · the
// pane's per-user (NOT admin-gated) visibility. Plus (at the bottom) the POPULATED fixture: the pane's
// hard-to-reach states on one screen, because an empty stub is what a visual review kept landing on.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeOrbSocket } from "../../../../support/ct/route-orb-socket";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { findSettingsColumnViolation, readSettingsPaneGeometry, readSettingsShellColumns } from "../../../../support/ct/settings-geometry";
import { SettingsShellDeepLinkStory, SettingsShellNarrowStory, SettingsShellStory } from "../../settings/_ct-stories";
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

// The NARROW arm swept on the SECOND pane the side-eye receipts covered (the shell owns the behaviour, but
// workloads is the pane whose stacked-arm 60px window was measured alongside appearance): at 430×740 the
// nav owns the pane, selecting Workloads pushes its sections full-pane, and the jobs section's own run
// affordance — the pane's first control — is on-screen.
test.describe("narrow (430×740)", () => {
  test.use({ viewport: { width: 430, height: 740 } });

  test("Workloads pushes full-pane and its first control is on-screen", async ({ mount, page }) => {
    await stub(page);
    const component = await mount(<SettingsShellNarrowStory />);
    await expect(component.getByRole("button", { name: "Workloads" })).toBeVisible();
    expect((await readSettingsShellColumns(page)).contentPainted).toBe(false);

    await component.getByRole("button", { name: "Workloads" }).click();

    const columns = await readSettingsShellColumns(page);
    expect(columns.navPainted).toBe(false);
    expect(columns.contentPainted).toBe(true);
    expect(columns.contentWidth).toBe(columns.rowWidth);
    await expect(page.getByTestId("workloads-run-button")).toBeInViewport();
  });
});

// §7.4 / §10 Q4 — a SUB-level deep link resolves the pane in render and lands on the section's anchor once
// the pane's DOM has it. The sub ids are byte-identical across the move, so old links keep working.
test("a sub-level deep link lands on the moved section's anchor", async ({ mount, page }) => {
  await stub(page);
  await mount(<SettingsShellDeepLinkStory target="workloads" subId="schedules" />);

  await expect(page.locator("#settings-anchor-workloads-schedules")).toBeVisible();
  await expect(page.getByTestId("schedule-create-button")).toBeVisible();
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// THE POPULATED PANE — the review fixture. Every other mount in this file stubs `workloads.list` EMPTY,
// which is exactly why a visual review of this pane kept reporting on an empty page: the lane headings, a
// job actually in flight, the broken-row treatment and a finished run's result line were unreachable. This
// one renders all of them at once, through the real shell, so the next reviewer SEES them.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════

/** One workload row in the wire shape (`WorkloadRowAnyKind` — domain/workloads/contract). */
function workloadRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "workload_ct_pane",
    kind: "index",
    status: "running",
    mode: "singular",
    source: "all",
    lane: "sweep",
    ownerId: USER_VIEWER.userId,
    dependsOn: null,
    error: null,
    progress: null,
    poison: false,
    scheduledAt: 1_750_000_000_000,
    createdAt: 1_750_000_000_000,
    updatedAt: 1_750_000_000_000,
    params: {},
    result: null,
    ...overrides,
  };
}

/** One schedule row (`WorkloadScheduleRow` — domain/workloads/contract/schedule). */
function scheduleRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "workload_schedule_ct_pane",
    ownerId: USER_VIEWER.userId,
    kind: "index",
    mode: "singular",
    params: { source: "all" },
    cadence: "daily",
    nextRunAt: 1_750_000_100_000,
    lastRunAt: null,
    enabled: true,
    createdAt: 1_750_000_000_000,
    updatedAt: 1_750_000_000_000,
    ...overrides,
  };
}

test("POPULATED: both lanes, a job in flight, a poison row, a finished stats rebuild and live schedules", async ({ mount, page }) => {
  await routeTrpc(page, {
    "settings.getUserSettings": () => ({ userId: USER_VIEWER.userId, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 }),
    "sessions.me": () => USER_VIEWER,
    "workloads.list": () => [
      // INTERACTIVE lane + the DURABLE progress column: the position a reload actually reads, with no live
      // event at all. Two lanes present ⇒ the lane headings render (a single lane drops them).
      workloadRow({
        id: "workload_ct_pane_ingest",
        kind: "databank-ingest",
        lane: "interactive",
        status: "running",
        progress: { pct: 61, message: "Embedded 610 of 1000" },
      }),
      // The SWEEP lane, mid-flight with no durable position yet — the indeterminate bar.
      workloadRow({ id: "workload_ct_pane_sweep", kind: "import-st", lane: "sweep", status: "running" }),
      // A POISON row: stored params this build can no longer read. Visibly broken, still retryable.
      workloadRow({
        id: "workload_ct_pane_poison",
        kind: "compute-themes",
        status: "failed",
        error: "unrecognized or malformed workload kind: compute-themes",
        params: null,
        poison: true,
      }),
      // The stats rebuild — the queue twin of the analytics pane's "Recompute now" — with its result SENTENCE.
      workloadRow({
        id: "workload_ct_pane_stats",
        kind: "reconcile-stats",
        lane: "sweep",
        status: "succeeded",
        result: { owners: 1, characters: 128 },
      }),
    ],
    "workloads.listSchedules": () => [
      scheduleRow({}),
      scheduleRow({ id: "workload_schedule_ct_pane_2", kind: "reconcile-stats", cadence: "weekly", enabled: false }),
    ],
  });
  // Two rows are ACTIVE, so each joins a `workloads` room on the tab's one socket — the socket has to answer.
  await routeOrbSocket(page, { frames: [], awaitAttaches: 0 });

  await mount(<WorkloadsPaneStory />);
  await page.getByRole("heading", { name: "Jobs" }).waitFor();

  const jobs = page.getByTestId("workloads-section");
  // BOTH lane headings — the "why are two things running at once?" answer.
  await expect(jobs.getByText("Interactive — jobs you're waiting on")).toBeVisible();
  await expect(jobs.getByText("Sweeps — bulk maintenance")).toBeVisible();
  // The in-flight row's DURABLE position, and the sibling's indeterminate bar.
  await expect(jobs.getByRole("progressbar", { name: "Embedded 610 of 1000" })).toHaveAttribute("aria-valuenow", "61");
  await expect(jobs.getByRole("progressbar")).toHaveCount(2);
  // The poison row's face + the finished row's result copy (never the stored blob).
  await expect(jobs.getByText("Unreadable", { exact: true })).toBeVisible();
  await expect(jobs.getByText("1 owner · 128 characters")).toBeVisible();

  // Schedules: rows present ⇒ the header CTA is the ONE home for "New schedule" (the empty state owns it
  // when the list is empty), and it is SECONDARY — the pane's single accent belongs to "Run a workload…".
  const schedules = page.getByTestId("workloads-schedules-section");
  await expect(schedules.getByTestId("schedule-create-button")).toBeVisible();
  await expect(schedules.getByRole("switch", { name: "Enable Reconcile stats schedule" })).not.toBeChecked();

  // CD3, measured on the PIXELS across the whole pane: exactly one button carries the accent FILL at rest.
  // Both CTAs used to, 111px apart in the same scroll column.
  const accentFill = await page.getByTestId("workloads-run-button").evaluate((el) => getComputedStyle(el).backgroundColor);
  const scheduleFill = await schedules.getByTestId("schedule-create-button").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(scheduleFill).not.toBe(accentFill);
  expect(scheduleFill).toBe("rgba(0, 0, 0, 0)");
});

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
import { findSettingsColumnViolation, readSettingsPaneGeometry } from "../../../../support/browser/settings-geometry.ts";
import { routeOrbSocket } from "../../../../support/node/route-orb-socket.ts";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
// The bus's OWN transport mutations (#649). `stream.attach`/`detach` ride the BATCHED HTTP link, not the
// SSE leg (`use-orb-socket.ts:7,139` — only `stream.connect` is the subscription), so `routeOrbSocket`
// never answers them and they rode `routeTrpc`'s lenient null in every mount here. Imported from the bus's
// own fixture module rather than re-spelled, so the two directions of this feed cannot drift apart.
import { STREAM_MUTATION_ROUTES } from "../../../data/bus/fixtures.ts";
import { ConfigHostStory } from "../../config/_ct-stories.tsx";
import { WorkloadsGroupStory } from "../_ct-stories.tsx";

const USER_VIEWER = { userId: "user_ct_kes", handle: "kes", globalRole: "user" };

/** The three sections at the `workloads` anchor, in the door's declared order (main.tsx) — which IS the
 *  render order: the two that moved out of the retired pane surface, then the analysis-tuning section. */
const ANCHOR_ORDER = ["config-anchor-workloads-jobs", "config-anchor-workloads-schedules", "config-anchor-workloads-tuning"];

/** The nav rows the pane DERIVES from its contributions, in door order. */
const NAV_LABELS = ["Runs", "Schedules", "Analysis tuning"];
/** The expanded category row's own label. "Jobs" used to sit at BOTH levels (the pane and its first section
 *  were the same word, the Personas>Personas / Tags>Tags precedent) — two rows in ONE navigation landmark
 *  with the identical accessible name, which side-eye ruled a defect on 2026-08-08 (WCAG 2.4.6/4.1.2). The
 *  section is "Runs" now, so the group's name is unambiguous again; the assertion reads the group frame's OWN rows
 *  because ORDER is what it claims. */
/** The jump's flash-ring base class (`settings-scroll-spy.ts`) — the thing that carries the ring's box. */
const FLASH_ANCHOR_CLASS = /settings-flash-anchor/;

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    // The config LIST paints every shelf, so the four collection bands read their rosters for the counts —
    // fed empty (the honest fresh-library arm) rather than left to routeTrpc's inert null.
    "tag.listTagsWithUsage": [],
    "regex.listScripts": [],
    "worldInfo.listBooksWithUsage": [],
    "rosterPreset.list": [],
    ...STREAM_MUTATION_ROUTES,
    "settings.getUserSettings": () => ({ userId: USER_VIEWER.userId, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 }),
    "settings.listThemes": [],
    "sessions.me": () => USER_VIEWER,
    "workloads.list": () => [],
    "workloads.listSchedules": () => [],
  });
}

test("the Jobs category shows in the shell nav for a PLAIN user (per-user, not admin-gated)", async ({ mount, page }) => {
  await stub(page);

  const component = await mount(<ConfigHostStory />);
  // The pane's USER-FACING label is "Jobs" (owner 08-02) — "workloads" survives only as code/anchor vocab.
  const workloadsNav = component.getByRole("button", { name: "Jobs" });
  await expect(workloadsNav).toBeVisible();
  await workloadsNav.click();

  // The real pane (not a placeholder): the jobs section's run affordance + filter tabs render.
  await expect(page.getByTestId("workloads-run-button")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Running" })).toBeVisible();
});

test("the skimmer renders all three workloads sections, in the door's declared order", async ({ mount, page }) => {
  await stub(page);
  await mount(<WorkloadsGroupStory />);
  await page.getByRole("heading", { name: "Runs" }).waitFor();
  await expect
    .poll(async () => await page.evaluate(() => [...document.querySelectorAll('[id^="config-anchor-workloads-"]')].map((el) => el.id)))
    .toStrictEqual(ANCHOR_ORDER);
});

// Single-column-of-SECTIONS (owner ruling — Discord grammar): every subcategory SECTION shares the same left
// edge + full column width and stacks in registry order. Runs the SHARED render-parity harness (SET-SEAMS
// §9) — a decomposition that moves the pixels is a defect.
test("subcategory sections are a single column, stacked in registry order", async ({ mount, page }) => {
  await stub(page);
  await mount(<WorkloadsGroupStory />);
  await page.getByRole("heading", { name: "Runs" }).waitFor();

  const geometry = await readSettingsPaneGeometry(page, "workloads");
  expect(findSettingsColumnViolation(geometry, ANCHOR_ORDER.length)).toBeNull();
});

// P5 — NAV/SEARCH PARITY (SET-SEAMS §7.2/§7.3). The pane's nav DERIVES from the contributions now; the two
// moved subs keep their labels, their leaves, and their (category, subId) anchors.
test("the derived nav lists every contributed section, in door order", async ({ mount, page }) => {
  await stub(page);
  await mount(<WorkloadsGroupStory />);
  await page.getByRole("heading", { name: "Runs" }).waitFor();

  // The group's rows, in DOM order, scoped to the group's OWN frame — the band is a disclosure BUTTON (not a
  // list row) since #866 S1, so the rows under it are exactly the contributed sections, in door order.
  await expect
    .poll(async () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[aria-label="Settings groups"] [data-config-group="workloads"] [data-slot="list-row-title"]')].map(
          (el) => el.textContent,
        ),
      ),
    )
    .toStrictEqual(NAV_LABELS);
});

// …AND THE FLASH RING DOES NOT STRIKE THE TEXT IT HIGHLIGHTS (side-eye 2026-08-08 P2). The jump lights an
// INSET box-shadow on a section that has no padding of its own, so the ring drew straight through the
// heading's cap-height and the note's descenders. The fix buys block padding and hands the same amount back
// as negative block margin, so the ring clears the glyphs and the flex item's MARGIN-BOX is unchanged (a
// flash that reflowed the pane would be a worse defect than the one it fixed). Both halves are measured on
// resolved values — the padding against the token, the box against the pre-jump box.
test("the jump's flash ring clears the section's own text, and lights without reflowing the pane", async ({ mount, page }) => {
  await stub(page);
  await mount(<WorkloadsGroupStory />);
  await page.getByRole("heading", { name: "Runs" }).waitFor();

  const section = page.locator("#config-anchor-workloads-schedules");
  const outerHeight = async (): Promise<number> =>
    section.evaluate((el) => {
      const style = globalThis.getComputedStyle(el);
      return el.getBoundingClientRect().height + Number.parseFloat(style.marginTop) + Number.parseFloat(style.marginBottom);
    });
  const before = await outerHeight();

  // The LIST row's jump — the same `scrollToAnchor` path a search hit takes (S2's search CT drives that door).
  await page.getByRole("button", { name: "Schedules" }).click();
  await expect(section).toHaveClass(FLASH_ANCHOR_CLASS);

  const measured = await section.evaluate((el) => {
    const style = globalThis.getComputedStyle(el);
    const probe = document.createElement("div");
    probe.style.width = "var(--spacing-row)";
    el.append(probe);
    const step = globalThis.getComputedStyle(probe).width;
    probe.remove();
    return {
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
      marginTop: style.marginTop,
      marginBottom: style.marginBottom,
      step,
      // The inline axis is deliberately UNTOUCHED: an inline pair would push the section past its scroll
      // container and flash a horizontal scrollbar for the ring's whole life.
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
    };
  });
  const negated = `-${measured.step}`;
  await expect
    .poll(
      async () =>
        (
          await section.evaluate((el) => {
            const style = globalThis.getComputedStyle(el);
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-row)";
            el.append(probe);
            const step = globalThis.getComputedStyle(probe).width;
            probe.remove();
            return {
              paddingTop: style.paddingTop,
              paddingBottom: style.paddingBottom,
              marginTop: style.marginTop,
              marginBottom: style.marginBottom,
              step,
              // The inline axis is deliberately UNTOUCHED: an inline pair would push the section past its scroll
              // container and flash a horizontal scrollbar for the ring's whole life.
              paddingLeft: style.paddingLeft,
              paddingRight: style.paddingRight,
            };
          })
        ).paddingTop,
    )
    .toBe(measured.step);
  await expect
    .poll(
      async () =>
        (
          await section.evaluate((el) => {
            const style = globalThis.getComputedStyle(el);
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-row)";
            el.append(probe);
            const step = globalThis.getComputedStyle(probe).width;
            probe.remove();
            return {
              paddingTop: style.paddingTop,
              paddingBottom: style.paddingBottom,
              marginTop: style.marginTop,
              marginBottom: style.marginBottom,
              step,
              // The inline axis is deliberately UNTOUCHED: an inline pair would push the section past its scroll
              // container and flash a horizontal scrollbar for the ring's whole life.
              paddingLeft: style.paddingLeft,
              paddingRight: style.paddingRight,
            };
          })
        ).paddingBottom,
    )
    .toBe(measured.step);
  await expect
    .poll(
      async () =>
        (
          await section.evaluate((el) => {
            const style = globalThis.getComputedStyle(el);
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-row)";
            el.append(probe);
            const step = globalThis.getComputedStyle(probe).width;
            probe.remove();
            return {
              paddingTop: style.paddingTop,
              paddingBottom: style.paddingBottom,
              marginTop: style.marginTop,
              marginBottom: style.marginBottom,
              step,
              // The inline axis is deliberately UNTOUCHED: an inline pair would push the section past its scroll
              // container and flash a horizontal scrollbar for the ring's whole life.
              paddingLeft: style.paddingLeft,
              paddingRight: style.paddingRight,
            };
          })
        ).marginTop,
    )
    .toBe(negated);
  await expect
    .poll(
      async () =>
        (
          await section.evaluate((el) => {
            const style = globalThis.getComputedStyle(el);
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-row)";
            el.append(probe);
            const step = globalThis.getComputedStyle(probe).width;
            probe.remove();
            return {
              paddingTop: style.paddingTop,
              paddingBottom: style.paddingBottom,
              marginTop: style.marginTop,
              marginBottom: style.marginBottom,
              step,
              // The inline axis is deliberately UNTOUCHED: an inline pair would push the section past its scroll
              // container and flash a horizontal scrollbar for the ring's whole life.
              paddingLeft: style.paddingLeft,
              paddingRight: style.paddingRight,
            };
          })
        ).marginBottom,
    )
    .toBe(negated);
  await expect
    .poll(
      async () =>
        (
          await section.evaluate((el) => {
            const style = globalThis.getComputedStyle(el);
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-row)";
            el.append(probe);
            const step = globalThis.getComputedStyle(probe).width;
            probe.remove();
            return {
              paddingTop: style.paddingTop,
              paddingBottom: style.paddingBottom,
              marginTop: style.marginTop,
              marginBottom: style.marginBottom,
              step,
              // The inline axis is deliberately UNTOUCHED: an inline pair would push the section past its scroll
              // container and flash a horizontal scrollbar for the ring's whole life.
              paddingLeft: style.paddingLeft,
              paddingRight: style.paddingRight,
            };
          })
        ).paddingLeft,
    )
    .toBe("0px");
  await expect
    .poll(
      async () =>
        (
          await section.evaluate((el) => {
            const style = globalThis.getComputedStyle(el);
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-row)";
            el.append(probe);
            const step = globalThis.getComputedStyle(probe).width;
            probe.remove();
            return {
              paddingTop: style.paddingTop,
              paddingBottom: style.paddingBottom,
              marginTop: style.marginTop,
              marginBottom: style.marginBottom,
              step,
              // The inline axis is deliberately UNTOUCHED: an inline pair would push the section past its scroll
              // container and flash a horizontal scrollbar for the ring's whole life.
              paddingLeft: style.paddingLeft,
              paddingRight: style.paddingRight,
            };
          })
        ).paddingRight,
    )
    .toBe("0px");

  // The clearance is REAL: the ring's inner edge sits a full step above the section's first glyph.
  const [sectionBox, headingBox] = await Promise.all([section.boundingBox(), section.getByRole("heading", { name: "Schedules" }).boundingBox()]);
  if (sectionBox === null || headingBox === null) {
    throw new Error("the flashed section or its heading did not render a box");
  }
  expect(headingBox.y - sectionBox.y, "the heading's cap starts below the ring").toBeGreaterThanOrEqual(Number.parseFloat(measured.step));

  // …and lighting it moved nothing: same margin-box height as before the jump.
  expect(await outerHeight()).toBeCloseTo(before, 1);
});

// §7.4 / §10 Q4 — a SUB-level deep link resolves the pane in render and lands on the section's anchor once
// the pane's DOM has it. The sub ids are byte-identical across the move, so old links keep working.
test("a sub-level deep link lands on the moved section's anchor", async ({ mount, page }) => {
  await stub(page);
  await mount(<ConfigHostStory target="workloads" sub="schedules" />);

  await expect(page.locator("#config-anchor-workloads-schedules")).toBeVisible();
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
    // The config LIST paints every shelf, so the four collection bands read their rosters for the counts —
    // fed empty (the honest fresh-library arm) rather than left to routeTrpc's inert null.
    "tag.listTagsWithUsage": [],
    "regex.listScripts": [],
    "worldInfo.listBooksWithUsage": [],
    "rosterPreset.list": [],
    ...STREAM_MUTATION_ROUTES,
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

  await mount(<WorkloadsGroupStory />);
  await page.getByRole("heading", { name: "Runs" }).waitFor();

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
  // when the list is empty), and it is SECONDARY — the pane's single accent belongs to "Run a job…".
  const schedules = page.getByTestId("workloads-schedules-section");
  await expect(schedules.getByTestId("schedule-create-button")).toBeVisible();
  await expect(schedules.getByRole("switch", { name: "Enable Reconcile stats schedule" })).not.toBeChecked();

  // CD3, measured on the PIXELS across the whole pane: exactly one button carries the accent FILL at rest.
  // Both CTAs used to, 111px apart in the same scroll column.
  const accentFill = await page.getByTestId("workloads-run-button").evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect
    .poll(async () => await schedules.getByTestId("schedule-create-button").evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(accentFill);
  await expect
    .poll(async () => await schedules.getByTestId("schedule-create-button").evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe("rgba(0, 0, 0, 0)");
});

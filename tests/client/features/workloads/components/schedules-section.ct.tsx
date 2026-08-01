// CT: the Schedules SECTION (Settings → Workloads → Schedules — the recurring cadences over the built
// `workloads.*Schedule` verbs). Drives the PRODUCTION path: the section owns its own `workloads.listSchedules`
// + `sessions.me` read behind its own QueryBoundary (SET-SEAMS stage 3 — the viewer role + the gated
// `admin.listUsers` handle map used to arrive as props from the retired pane surface); the row controls fire
// the real owner-scoped verbs; the create/edit dialogs submit the real wire inputs, with the owner-only bulk
// affordances gated exactly as the server re-gates them.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { WorkloadsSchedulesSectionStory } from "../_ct-stories";

const USER_VIEWER = { userId: "user_ct_kes", handle: "kes", globalRole: "user" };
/** Matches BOTH homes of the create action ("New schedule…" in the header, "New schedule" in the empty state)
 *  — the point of the assertion is that only one of them is ever on screen. */
const NEW_SCHEDULE_LABEL = /New schedule/;
const OWNER_VIEWER = { userId: "user_ct_root", handle: "root", globalRole: "owner" };

const ADMIN_USERS = [
  {
    id: "user_ct_root",
    handle: "root",
    externalId: null,
    role: "owner",
    enabled: true,
    kind: "human",
    ownerHandle: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  },
  {
    id: "user_ct_mira",
    handle: "mira",
    externalId: null,
    role: "user",
    enabled: true,
    kind: "human",
    ownerHandle: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  },
];

/** One schedule row in the wire shape (`WorkloadScheduleRow` — domain/workloads/contract/schedule). */
function scheduleRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "workload_schedule_ct_1",
    ownerId: "user_ct_kes",
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

test("lists a schedule off its OWN read; toggle/delete fire the owner-scoped verbs; a plain user never fires admin.listUsers", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [scheduleRow()],
    "workloads.setScheduleEnabled": () => scheduleRow({ enabled: false }),
    "workloads.deleteSchedule": () => undefined,
  });

  await mount(<WorkloadsSchedulesSectionStory />);

  const section = page.getByTestId("workloads-schedules-section");
  await expect(section.getByText("Index (embeddings)")).toBeVisible();
  await expect(section.getByText("Every day", { exact: false })).toBeVisible();
  // The section stamps its own anchor now (§7.1 — the id is byte-identical across the move).
  await expect(page.locator("#settings-anchor-workloads-schedules")).toBeVisible();

  // Toggling the enable Switch fires the owner-scoped setScheduleEnabled with the row id.
  await section.getByRole("switch", { name: "Enable Index (embeddings) schedule" }).click();
  // No DOM correlate: the mock's `listSchedules` responder is static — tighten the poll instead.
  await expect.poll(() => trpc.count("workloads.setScheduleEnabled"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const toggled = trpc.lastInput("workloads.setScheduleEnabled") as { id?: unknown };
  expect(toggled.id).toBe("workload_schedule_ct_1");

  // Delete fires deleteSchedule with the row id.
  await section.getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => trpc.count("workloads.deleteSchedule"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const deleted = trpc.lastInput("workloads.deleteSchedule") as { id?: unknown };
  expect(deleted.id).toBe("workload_schedule_ct_1");

  // The handle map is an adminProcedure read, skipToken-gated for a plain user — it must never have fired.
  await expect.poll(() => trpc.count("admin.listUsers")).toBe(0);
});

// ONE ACTION, ONE HOME. "New schedule" used to render twice at once — a header button AND the empty state's
// CTA, 111px apart, both opening the same dialog. Whichever is on screen is the only one on screen.
test("the create action has exactly ONE home: the empty state when empty, the header once rows exist", async ({ mount, page }) => {
  await routeTrpc(page, {
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
  });

  await mount(<WorkloadsSchedulesSectionStory />);
  const section = page.getByTestId("workloads-schedules-section");

  // Empty: the empty state owns the action — one button, and it is the one INSIDE the empty state.
  await expect(section.getByTestId("schedule-create-button")).toHaveCount(1);
  await expect(section.getByRole("button", { name: NEW_SCHEDULE_LABEL })).toHaveCount(1);
  await expect(section.getByText("No schedules yet", { exact: false })).toBeVisible();
});

test("with rows the header owns the create action, and the empty state is gone", async ({ mount, page }) => {
  await routeTrpc(page, {
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [scheduleRow()],
  });

  await mount(<WorkloadsSchedulesSectionStory />);
  const section = page.getByTestId("workloads-schedules-section");

  await expect(section.getByTestId("schedule-create-button")).toHaveCount(1);
  await expect(section.getByText("No schedules yet", { exact: false })).toHaveCount(0);
  // CD3 — the pane's one accent at rest belongs to Jobs' "Run a job…", so this button is SECONDARY.
  // Asserted on the COMPUTED fill (an intent prop is not a pixel): secondary is `bg-transparent`.
  const fill = await section.getByTestId("schedule-create-button").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(fill).toBe("rgba(0, 0, 0, 0)");
});

test("the create dialog wires a singular createSchedule (kind + cadence + params)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
    "workloads.createSchedule": () => ({ id: "workload_schedule_ct_new" }),
  });

  await mount(<WorkloadsSchedulesSectionStory />);

  await page.getByTestId("schedule-create-button").click();
  await expect(page.getByTestId("create-schedule-dialog")).toBeVisible();

  // Pick a cadence; the kind defaults to the first runnable (index → source `all`).
  await page.getByRole("combobox", { name: "Runs" }).click();
  await page.getByRole("option", { name: "Every week" }).click();

  await page.getByTestId("create-schedule-submit").click();
  // CreateScheduleDialog closes only after `mutateAsync` resolves (its `onDone`) — wait on that
  // instead of polling the mock.
  await expect(page.getByTestId("create-schedule-dialog")).toHaveCount(0);
  const created = trpc.lastInput("workloads.createSchedule") as {
    input?: { kind?: unknown; params?: unknown };
    cadence?: unknown;
  };
  expect(created.input?.kind).toBe("index");
  expect(created.input?.params).toEqual({ source: "all" });
  expect(created.cadence).toBe("weekly");
});

test("owner: the create dialog offers a Bulk toggle on a sweep kind and wires a BULK schedule", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "sessions.me": () => OWNER_VIEWER,
    "workloads.listSchedules": () => [],
    "admin.listUsers": () => ADMIN_USERS,
    "workloads.createSchedule": () => ({ id: "workload_schedule_ct_new" }),
  });

  await mount(<WorkloadsSchedulesSectionStory />);

  await page.getByTestId("schedule-create-button").click();
  await expect(page.getByTestId("create-schedule-dialog")).toBeVisible();

  // The owner picker is GROUPED — the Maintenance group is present; the default sweep kind (index) shows
  // the owner-only Bulk toggle.
  await page.getByRole("combobox", { name: "Job" }).click();
  await expect(page.getByText("Maintenance (all deployments)")).toBeVisible();
  await page.getByRole("option", { name: "Index (embeddings)" }).click();
  await page.getByRole("switch", { name: "Bulk mode" }).click();

  await page.getByTestId("create-schedule-submit").click();
  await expect(page.getByTestId("create-schedule-dialog")).toHaveCount(0);
  const created = trpc.lastInput("workloads.createSchedule") as {
    input?: { kind?: unknown };
    mode?: unknown;
  };
  expect(created.input?.kind).toBe("index");
  expect(created.mode).toBe("bulk");
});

test("owner: a Maintenance kind schedule is bulk BY FORCE (a note, no toggle) and wires mode:bulk", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "sessions.me": () => OWNER_VIEWER,
    "workloads.listSchedules": () => [],
    "admin.listUsers": () => ADMIN_USERS,
    "workloads.createSchedule": () => ({ id: "workload_schedule_ct_new" }),
  });

  await mount(<WorkloadsSchedulesSectionStory />);

  await page.getByTestId("schedule-create-button").click();
  await page.getByRole("combobox", { name: "Job" }).click();
  await page.getByRole("option", { name: "Refresh model catalog" }).click();

  // Bulk BY FORCE — the maintenance note shows, no toggle.
  await expect(page.getByText("Recurs across every deployment (maintenance)")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Bulk mode" })).toHaveCount(0);

  await page.getByTestId("create-schedule-submit").click();
  await expect(page.getByTestId("create-schedule-dialog")).toHaveCount(0);
  const created = trpc.lastInput("workloads.createSchedule") as {
    input?: { kind?: unknown };
    mode?: unknown;
  };
  expect(created.input?.kind).toBe("refresh-model-catalog");
  expect(created.mode).toBe("bulk");
});

test("the Edit action opens a seeded dialog and wires updateSchedule (cadence retune)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [scheduleRow({ cadence: "daily" })],
    "workloads.updateSchedule": () => scheduleRow({ cadence: "weekly" }),
  });

  await mount(<WorkloadsSchedulesSectionStory />);

  const section = page.getByTestId("workloads-schedules-section");
  await section.getByRole("button", { name: "Edit Index (embeddings) schedule" }).click();
  await expect(page.getByTestId("edit-schedule-dialog")).toBeVisible();

  // The form seeded from the row (cadence "Every day"); retune it to weekly and save.
  await expect(page.getByRole("combobox", { name: "Runs" })).toContainText("Every day");
  await page.getByRole("combobox", { name: "Runs" }).click();
  await page.getByRole("option", { name: "Every week" }).click();
  await page.getByTestId("edit-schedule-submit").click();
  await expect(page.getByTestId("edit-schedule-dialog")).toHaveCount(0);
  const updated = trpc.lastInput("workloads.updateSchedule") as { id?: unknown; cadence?: unknown };
  expect(updated.id).toBe("workload_schedule_ct_1");
  expect(updated.cadence).toBe("weekly");
});

test("owner: a BULK schedule row wears the Bulk badge and a foreign row shows its owner handle", async ({ mount, page }) => {
  await routeTrpc(page, {
    "sessions.me": () => OWNER_VIEWER,
    "admin.listUsers": () => ADMIN_USERS,
    "workloads.listSchedules": () => [
      scheduleRow({
        id: "workload_schedule_ct_bulk",
        ownerId: "user_ct_mira",
        kind: "refresh-model-catalog",
        mode: "bulk",
        params: {},
      }),
    ],
  });

  await mount(<WorkloadsSchedulesSectionStory />);

  const section = page.getByTestId("workloads-schedules-section");
  await expect(section.getByText("Refresh model catalog")).toBeVisible();
  await expect(section.getByText("Bulk", { exact: true })).toBeVisible();
  // The foreign row (owner∪admin cross-owner view) shows the owning user's handle — resolved through the
  // section's OWN gated admin.listUsers read.
  await expect(section.getByText("for mira", { exact: false })).toBeVisible();
});

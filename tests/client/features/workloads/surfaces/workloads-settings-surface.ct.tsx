// CT: the real Workloads settings pane (Settings → Workloads — the per-user jobs surface over the
// built `workloads.*` verbs). Drives the PRODUCTION path: `workloads.list` + `sessions.me` seed the
// pane (QueryBoundary + suspense); the filter tabs slice client-side; the run dialog fires the real
// `workloads.start` wire (singular default; owner-only bulk + `targetOwnerId`); Cancel is
// confirm-gated (AlertDialog) and Retry fires on failure terminals; the live `workloads.subscribe`
// SSE tail (a scripted `text/event-stream` body — the notification-bell local pattern) drives the
// progress bar and the terminal-state refetch without a refresh. A PLAIN user's pane must never fire
// the adminProcedure `admin.listUsers` read (the skipToken gate).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { SettingsShellStory } from "../../settings/_ct-stories";
import { WorkloadsSettingsStory } from "../_ct-stories";

const USER_VIEWER = { userId: "user_ct_kes", handle: "kes", globalRole: "user" };
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

/** One workload row in the wire shape (`WorkloadRowAnyKind` — domain/workloads/contract). */
function workloadRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "workload_ct_1",
    kind: "index",
    status: "running",
    mode: "singular",
    source: "all",
    ownerId: "user_ct_kes",
    dependsOn: null,
    error: null,
    scheduledAt: 1_750_000_000_000,
    createdAt: 1_750_000_000_000,
    updatedAt: 1_750_000_000_000,
    params: { source: "all" },
    result: null,
    ...overrides,
  };
}

/** SSE frames in the tRPC tracked wire shape (the route-trpc-subscription.ts format, local here
 *  because that helper types its events as `ChatBusEvent`). */
function sseBody(events: readonly Record<string, unknown>[]): string {
  const frames = ["event: connected\ndata: {}\n\n"];
  for (const [i, event] of events.entries()) {
    frames.push(`data: ${JSON.stringify(event)}\nid: ${String(i + 1)}\n\n`);
  }
  return frames.join("");
}

/** Serve `workloads.subscribe` a scripted stream; everything else falls through to routeTrpc.
 *  Register AFTER routeTrpc (later routes run first; non-SSE requests fall through). */
async function routeWorkloadStream(page: Page, events: readonly Record<string, unknown>[]): Promise<void> {
  let served = false;
  await page.route("**/api/trpc/**", async (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    if (!accept.includes("text/event-stream")) {
      await route.fallback();
      return;
    }
    // First subscribe gets the script; a reconnect gets a bare connected frame (no replay).
    const body = served ? sseBody([]) : sseBody(events);
    served = true;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body,
    });
  });
}

test("the Workloads category shows in the shell nav for a PLAIN user (per-user, not admin-gated) and opens the real pane", async ({ mount, page }) => {
  await routeTrpc(page, {
    "settings.getUserSettings": () => ({
      userId: "user_ct_kes",
      schemaVersion: 1,
      config: DEFAULT_USER_SETTINGS,
      updatedAt: 0,
    }),
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
    "workloads.list": () => [],
  });
  await routeWorkloadStream(page, []);

  const component = await mount(<SettingsShellStory />);
  const workloadsNav = component.getByRole("button", { name: "Workloads" });
  await expect(workloadsNav).toBeVisible();
  await workloadsNav.click();
  // The real pane (not a placeholder): the run affordance + the filter tabs render.
  await expect(page.getByTestId("workloads-run-button")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Running" })).toBeVisible();
});

test("lists the caller's own jobs with status badges; a plain user never fires admin.listUsers; tabs filter", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "workloads.list": () => [
      workloadRow(),
      workloadRow({
        id: "workload_ct_2",
        kind: "distill-characters",
        status: "failed",
        error: "runtime: provider unreachable",
      }),
      workloadRow({
        id: "workload_ct_3",
        kind: "compute-themes",
        status: "succeeded",
        result: { themes: 7 },
      }),
    ],
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

  // All three rows render with their kind labels + status badges (badge text scoped to the panel —
  // the tab labels reuse "Failed").
  const allPanel = page.getByRole("tabpanel", { name: "All" });
  await expect(allPanel.getByText("Index (embeddings)")).toBeVisible();
  await expect(allPanel.getByText("Distill characters")).toBeVisible();
  await expect(allPanel.getByText("Compute themes")).toBeVisible();
  await expect(allPanel.getByText("Failed", { exact: true })).toBeVisible();
  await expect(allPanel.getByText("Succeeded", { exact: true })).toBeVisible();
  // The failure reason + the result preview render on their rows.
  await expect(allPanel.getByText("runtime: provider unreachable")).toBeVisible();
  await expect(allPanel.getByText('{"themes":7}')).toBeVisible();

  // The Failed tab slices client-side to the failure terminals only.
  await page.getByRole("tab", { name: "Failed" }).click();
  const failedPanel = page.getByRole("tabpanel", { name: "Failed" });
  await expect(failedPanel.getByText("Distill characters")).toBeVisible();
  await expect(failedPanel.getByText("Index (embeddings)")).toHaveCount(0);

  // The adminProcedure read is skipToken-gated for a plain user — it must never have fired.
  await expect.poll(() => trpc.count("admin.listUsers")).toBe(0);
});

test("run dialog: singular by default, params ride the kind, and a non-owner sees NO bulk affordances", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "workloads.list": () => [],
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
    "workloads.start": () => ({ id: "workload_ct_new" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);
  await page.getByTestId("workloads-run-button").click();
  await expect(page.getByTestId("run-workload-dialog")).toBeVisible();

  // The picker offers only singular-capable kinds — an unbuilt stub is absent by construction, and a
  // non-owner never sees the owner-only "Maintenance" group or its bulk-only kind.
  await page.getByRole("combobox", { name: "Workload" }).click();
  await expect(page.getByRole("option", { name: "Index (embeddings)" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Crew: director" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Refresh model catalog" })).toHaveCount(0);
  await expect(page.getByText("Maintenance (all deployments)")).toHaveCount(0);
  await page.getByRole("option", { name: "Index (embeddings)" }).click();

  // The index kind carries the source picker + the force tunable; a non-owner NEVER sees the bulk switch.
  await expect(page.getByRole("combobox", { name: "What to index" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Re-embed everything" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Bulk mode" })).toHaveCount(0);

  await page.getByTestId("run-workload-submit").click();
  // The dialog closes only after `mutateAsync` resolves (RunWorkloadDialog's `onDone`) — an
  // event-driven proxy for "the mutation landed" instead of polling the mock call-count.
  await expect(page.getByTestId("run-workload-dialog")).toHaveCount(0);
  const started = trpc.lastInput("workloads.start") as {
    input?: { kind?: unknown; params?: unknown };
    mode?: unknown;
    targetOwnerId?: unknown;
  };
  expect(started.input?.kind).toBe("index");
  // `index` always carries its REQUIRED source; the form defaults to `all` (reindex everything).
  expect(started.input?.params).toEqual({ source: "all" });
  expect(started.mode).toBe("singular");
  expect(started.targetOwnerId).toBeUndefined();
});

test("owner bulk create-kind: the Bulk switch + required target picker wire targetOwnerId", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "workloads.list": () => [],
    "sessions.me": () => OWNER_VIEWER,
    "workloads.listSchedules": () => [],
    "admin.listUsers": () => ADMIN_USERS,
    "workloads.start": () => ({ id: "workload_ct_new" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);
  await page.getByTestId("workloads-run-button").click();

  await page.getByRole("combobox", { name: "Workload" }).click();
  await page.getByRole("option", { name: "Import from SillyTavern" }).click();

  await page.getByRole("switch", { name: "Bulk mode" }).click();
  // A bulk CREATE-kind requires the mint target — submit is validation-blocked until one is picked.
  await page.getByTestId("run-workload-submit").click();
  await expect(page.getByText("Pick the user to import into.")).toBeVisible();
  await expect.poll(() => trpc.count("workloads.start")).toBe(0);
  await page.getByRole("combobox", { name: "Import into" }).click();
  await page.getByRole("option", { name: "mira" }).click();

  await page.getByTestId("run-workload-submit").click();
  await expect(page.getByTestId("run-workload-dialog")).toHaveCount(0);
  const started = trpc.lastInput("workloads.start") as {
    input?: { kind?: unknown };
    mode?: unknown;
    targetOwnerId?: unknown;
  };
  expect(started.input?.kind).toBe("import-st");
  expect(started.mode).toBe("bulk");
  expect(started.targetOwnerId).toBe("user_ct_mira");
});

test("owner maintenance kind: the Maintenance group offers refresh-model-catalog; it runs mode:bulk with NO target", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "workloads.list": () => [],
    "sessions.me": () => OWNER_VIEWER,
    "workloads.listSchedules": () => [],
    "admin.listUsers": () => ADMIN_USERS,
    "workloads.start": () => ({ id: "workload_ct_new" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);
  await page.getByTestId("workloads-run-button").click();

  // The owner's picker is GROUPED — "Run on my data" (singular kinds) + a distinct "Maintenance
  // (all deployments)" group carrying the built bulk-only kind.
  await page.getByRole("combobox", { name: "Workload" }).click();
  await expect(page.getByText("Maintenance (all deployments)")).toBeVisible();
  await page.getByRole("option", { name: "Refresh model catalog" }).click();

  // A maintenance kind is bulk BY FORCE — a note, not a toggle; no target picker.
  await expect(page.getByRole("switch", { name: "Bulk mode" })).toHaveCount(0);
  await expect(page.getByText("Runs across every deployment (maintenance)")).toBeVisible();

  await page.getByTestId("run-workload-submit").click();
  await expect(page.getByTestId("run-workload-dialog")).toHaveCount(0);
  const started = trpc.lastInput("workloads.start") as {
    input?: { kind?: unknown };
    mode?: unknown;
    targetOwnerId?: unknown;
  };
  expect(started.input?.kind).toBe("refresh-model-catalog");
  expect(started.mode).toBe("bulk");
  expect(started.targetOwnerId).toBeUndefined();
});

test("a failed row shows the FRIENDLY message; the raw exception stays one disclosure away", async ({ mount, page }) => {
  await routeTrpc(page, {
    "workloads.list": () => [
      workloadRow({
        status: "failed",
        error: "Unable to get model file path or buffer.",
      }),
    ],
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

  // The mapped, user-actionable line shows; the raw internal string is NOT the surfaced copy.
  await expect(page.getByText("A required local model wasn't available. Check the model is installed, then retry.")).toBeVisible();
  const raw = page.getByText("Unable to get model file path or buffer.");
  // The raw string lives inside the collapsed "Technical details" disclosure (hidden until expanded).
  await expect(raw).toHaveCount(0);
  await page.getByRole("button", { name: "Technical details" }).click();
  await expect(raw).toBeVisible();
});

test("an UNMAPPED failure falls back to the raw string verbatim (no disclosure)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "workloads.list": () => [workloadRow({ status: "failed", error: "runtime: something weirdly specific" })],
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

  await expect(page.getByText("runtime: something weirdly specific")).toBeVisible();
  // Nothing mapped → the raw string IS the surfaced copy; no "Technical details" disclosure.
  await expect(page.getByRole("button", { name: "Technical details" })).toHaveCount(0);
});

test("cancel is confirm-gated (AlertDialog) and retry fires on a failure terminal", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "workloads.list": () => [
      workloadRow(),
      workloadRow({
        id: "workload_ct_2",
        kind: "distill-characters",
        status: "failed",
        error: "runtime: boom",
      }),
    ],
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
    "workloads.cancel": () => ({ ok: true }),
    "workloads.retry": () => ({ id: "workload_ct_clone" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

  await page.getByRole("button", { name: "Cancel — Index (embeddings)" }).click();
  await expect(page.getByText("Cancel this workload?")).toBeVisible();
  // The M5 cancelLabel extension: this confirm's Cancel button reads "Keep running", not the default.
  await expect(page.getByRole("button", { name: "Keep running" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel workload" }).click();
  // No DOM correlate: the mock's `workloads.list` responder is static, so the invalidation-driven
  // refetch re-renders nothing observable — poll the call-count, but tightly (not the 1.85s default).
  await expect.poll(() => trpc.count("workloads.cancel"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const cancelled = trpc.lastInput("workloads.cancel") as { id?: unknown };
  expect(cancelled.id).toBe("workload_ct_1");

  await page.getByRole("button", { name: "Retry — Distill characters" }).click();
  await expect.poll(() => trpc.count("workloads.retry"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const retried = trpc.lastInput("workloads.retry") as { id?: unknown };
  expect(retried.id).toBe("workload_ct_2");
});

test("a LIVE progress event drives the row's determinate progress bar (row-local buffer)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "workloads.list": () => [workloadRow()],
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
  });
  await routeWorkloadStream(page, [
    {
      type: "progress",
      workloadId: "workload_ct_1",
      kind: "index",
      at: 1_750_000_001_000,
      progress: { pct: 40, message: "Embedding corpus rows" },
    },
  ]);

  await mount(<WorkloadsSettingsStory />);

  // The progressbar's accessible name IS its live label (the Progress primitive's Label part) —
  // the streamed message replaces the static status label once the event lands.
  const bar = page.getByRole("progressbar", { name: "Embedding corpus rows" });
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("aria-valuenow", "40");
});

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

test("Schedules section: lists a schedule, and toggle/delete fire the owner-scoped verbs", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "workloads.list": () => [],
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [scheduleRow()],
    "workloads.setScheduleEnabled": () => scheduleRow({ enabled: false }),
    "workloads.deleteSchedule": () => undefined,
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

  const section = page.getByTestId("workloads-schedules-section");
  await expect(section.getByText("Index (embeddings)")).toBeVisible();
  await expect(section.getByText("Every day", { exact: false })).toBeVisible();

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
});

test("Schedules section: the create dialog wires a singular createSchedule (kind + cadence + params)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "workloads.list": () => [],
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
    "workloads.createSchedule": () => ({ id: "workload_schedule_ct_new" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

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
    "workloads.list": () => [],
    "sessions.me": () => OWNER_VIEWER,
    "workloads.listSchedules": () => [],
    "admin.listUsers": () => ADMIN_USERS,
    "workloads.createSchedule": () => ({ id: "workload_schedule_ct_new" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

  await page.getByTestId("schedule-create-button").click();
  await expect(page.getByTestId("create-schedule-dialog")).toBeVisible();

  // The owner picker is GROUPED — the Maintenance group is present; the default sweep kind (index) shows
  // the owner-only Bulk toggle.
  await page.getByRole("combobox", { name: "Workload" }).click();
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
    "workloads.list": () => [],
    "sessions.me": () => OWNER_VIEWER,
    "workloads.listSchedules": () => [],
    "admin.listUsers": () => ADMIN_USERS,
    "workloads.createSchedule": () => ({ id: "workload_schedule_ct_new" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

  await page.getByTestId("schedule-create-button").click();
  await page.getByRole("combobox", { name: "Workload" }).click();
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

test("Schedules: the Edit action opens a seeded dialog and wires updateSchedule (cadence retune)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "workloads.list": () => [],
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [scheduleRow({ cadence: "daily" })],
    "workloads.updateSchedule": () => scheduleRow({ cadence: "weekly" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

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
    "workloads.list": () => [],
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
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

  const section = page.getByTestId("workloads-schedules-section");
  await expect(section.getByText("Refresh model catalog")).toBeVisible();
  await expect(section.getByText("Bulk", { exact: true })).toBeVisible();
  // The foreign row (owner∪admin cross-owner view) shows the owning user's handle.
  await expect(section.getByText("for mira", { exact: false })).toBeVisible();
});

// The exact server `dependency_failed` message (domain/workloads persistence DEPENDENCY_FAILED_MESSAGE) —
// the row exposes only this string, so the client keys on it to label the DAG terminal apart.
const DEPENDENCY_FAILED_MESSAGE = "a dependency did not succeed (a non-success terminal, or an absent dependency) — the dependent cannot run";

test("run dialog: setting 'Run at' defers the run — start carries scheduledAt (epoch ms)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "workloads.list": () => [],
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
    "workloads.start": () => ({ id: "workload_ct_new" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);
  await page.getByTestId("workloads-run-button").click();
  await page.getByRole("combobox", { name: "Workload" }).click();
  await page.getByRole("option", { name: "Index (embeddings)" }).click();

  // Defer to a far-future instant — the datetime-local control parses to an epoch-ms scheduledAt.
  await page.getByLabel("Run at").fill("2099-01-01T03:30");
  await page.getByTestId("run-workload-submit").click();
  await expect(page.getByTestId("run-workload-dialog")).toHaveCount(0);
  const started = trpc.lastInput("workloads.start") as { scheduledAt?: unknown };
  expect(typeof started.scheduledAt).toBe("number");
  // 2099 is ≈ 4.07e12 ms — well past any near-now default, tz-slack notwithstanding.
  expect(started.scheduledAt as number).toBeGreaterThan(4_000_000_000_000);
});

test("run dialog: 'Run after these complete' lists in-flight runs and wires dependsOn", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    // One in-flight run owned by the viewer → offered as a dependency candidate.
    "workloads.list": () => [workloadRow({ id: "workload_ct_dep", kind: "distill-characters", status: "running" })],
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
    "workloads.start": () => ({ id: "workload_ct_new" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);
  await page.getByTestId("workloads-run-button").click();
  const dialog = page.getByTestId("run-workload-dialog");
  // The default kind (index) is runnable → the DAG gate shows, listing the in-flight distill run.
  const depToggle = dialog.getByRole("button", { name: "Distill characters" });
  await expect(depToggle).toBeVisible();
  await depToggle.click();

  await page.getByTestId("run-workload-submit").click();
  await expect(page.getByTestId("run-workload-dialog")).toHaveCount(0);
  const started = trpc.lastInput("workloads.start") as { dependsOn?: unknown };
  expect(started.dependsOn).toEqual(["workload_ct_dep"]);
});

test("list: a deferred (future-dated) queued row shows the Scheduled state, not a progress bar", async ({ mount, page }) => {
  await routeTrpc(page, {
    "workloads.list": () => [
      workloadRow({
        status: "queued",
        // scheduledAt well past createdAt → deferred (both default to 1_750_000_000_000 in the fixture).
        scheduledAt: 1_750_000_600_000,
      }),
    ],
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

  const allPanel = page.getByRole("tabpanel", { name: "All" });
  await expect(allPanel.getByText("Scheduled", { exact: true })).toBeVisible();
  await expect(allPanel.getByText("Scheduled for", { exact: false })).toBeVisible();
  // A deferred row isn't processing → no indeterminate progress bar.
  await expect(allPanel.getByRole("progressbar")).toHaveCount(0);
});

test("list: a queued row with dependsOn shows the Waiting-on-dependencies state", async ({ mount, page }) => {
  await routeTrpc(page, {
    "workloads.list": () => [workloadRow({ status: "queued", dependsOn: ["workload_ct_a", "workload_ct_b"] })],
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

  const allPanel = page.getByRole("tabpanel", { name: "All" });
  await expect(allPanel.getByText("Waiting", { exact: true })).toBeVisible();
  await expect(allPanel.getByText("Waiting on 2 dependencies")).toBeVisible();
});

test("list: a dependency_failed terminal is labelled apart from a normal failure", async ({ mount, page }) => {
  await routeTrpc(page, {
    "workloads.list": () => [workloadRow({ status: "failed", error: DEPENDENCY_FAILED_MESSAGE })],
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

  const allPanel = page.getByRole("tabpanel", { name: "All" });
  // The status badge reads "Dependency failed", NOT a bare "Failed".
  await expect(allPanel.getByText("Dependency failed", { exact: true })).toBeVisible();
  await expect(allPanel.getByText("Failed", { exact: true })).toHaveCount(0);
  // The friendly, distinct copy explains it never ran; the raw server line stays one disclosure away.
  await expect(allPanel.getByText("one of the jobs it depends on didn't succeed", { exact: false })).toBeVisible();
});

test("a LIVE terminal event refetches the list — Running flips to Succeeded without a refresh", async ({ mount, page }) => {
  let listCalls = 0;
  await routeTrpc(page, {
    "workloads.list": () => {
      listCalls += 1;
      // The seed read sees the running row; the terminal-event invalidate refetches the succeeded one.
      return listCalls === 1 ? [workloadRow()] : [workloadRow({ status: "succeeded", result: { embedded: 12 } })];
    },
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
  });
  await routeWorkloadStream(page, [
    {
      type: "succeeded",
      workloadId: "workload_ct_1",
      kind: "index",
      at: 1_750_000_002_000,
      result: { embedded: 12 },
    },
  ]);

  await mount(<WorkloadsSettingsStory />);

  await expect(page.getByText("Succeeded", { exact: true })).toBeVisible();
  await expect(page.getByText('{"embedded":12}')).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel — Index (embeddings)" })).toHaveCount(0);
});

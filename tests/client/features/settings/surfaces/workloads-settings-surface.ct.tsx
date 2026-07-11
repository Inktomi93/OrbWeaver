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
import { SettingsShellStory, WorkloadsSettingsStory } from "../_ct-stories";

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
    kind: "embed-corpus",
    status: "running",
    mode: "singular",
    ownerId: "user_ct_kes",
    dependsOn: null,
    error: null,
    scheduledAt: 1_750_000_000_000,
    createdAt: 1_750_000_000_000,
    updatedAt: 1_750_000_000_000,
    params: {},
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
async function routeWorkloadStream(
  page: Page,
  events: readonly Record<string, unknown>[],
): Promise<void> {
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

test("the Workloads category shows in the shell nav for a PLAIN user (per-user, not admin-gated) and opens the real pane", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "settings.getUserSettings": () => ({
      userId: "user_ct_kes",
      schemaVersion: 1,
      config: DEFAULT_USER_SETTINGS,
      updatedAt: 0,
    }),
    "sessions.me": () => USER_VIEWER,
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

test("lists the caller's own jobs with status badges; a plain user never fires admin.listUsers; tabs filter", async ({
  mount,
  page,
}) => {
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
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

  // All three rows render with their kind labels + status badges (badge text scoped to the panel —
  // the tab labels reuse "Failed").
  const allPanel = page.getByRole("tabpanel", { name: "All" });
  await expect(allPanel.getByText("Embed corpus")).toBeVisible();
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
  await expect(failedPanel.getByText("Embed corpus")).toHaveCount(0);

  // The adminProcedure read is skipToken-gated for a plain user — it must never have fired.
  expect(trpc.count("admin.listUsers")).toBe(0);
});

test("run dialog: singular by default, params ride the kind, and a non-owner sees NO bulk affordances", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "workloads.list": () => [],
    "sessions.me": () => USER_VIEWER,
    "workloads.start": () => ({ id: "workload_ct_new" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);
  await page.getByTestId("workloads-run-button").click();
  await expect(page.getByTestId("run-workload-dialog")).toBeVisible();

  // The picker offers only singular-capable kinds — an unbuilt stub is absent by construction, and a
  // non-owner never sees the owner-only "Maintenance" group or its bulk-only kind.
  await page.getByRole("combobox", { name: "Workload" }).click();
  await expect(page.getByRole("option", { name: "Embed corpus" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Crew: director" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Refresh model catalog" })).toHaveCount(0);
  await expect(page.getByText("Maintenance (all deployments)")).toHaveCount(0);
  await page.getByRole("option", { name: "Embed corpus" }).click();

  // The embed kinds carry the force tunable; a non-owner NEVER sees the bulk switch.
  await expect(page.getByRole("switch", { name: "Re-embed everything" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Bulk mode" })).toHaveCount(0);

  await page.getByTestId("run-workload-submit").click();
  await expect.poll(() => trpc.count("workloads.start")).toBeGreaterThanOrEqual(1);
  const started = trpc.lastInput("workloads.start") as {
    input?: { kind?: unknown; params?: unknown };
    mode?: unknown;
    targetOwnerId?: unknown;
  };
  expect(started.input?.kind).toBe("embed-corpus");
  expect(started.input?.params).toEqual({});
  expect(started.mode).toBe("singular");
  expect(started.targetOwnerId).toBeUndefined();
});

test("owner bulk create-kind: the Bulk switch + required target picker wire targetOwnerId", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "workloads.list": () => [],
    "sessions.me": () => OWNER_VIEWER,
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
  expect(trpc.count("workloads.start")).toBe(0);
  await page.getByRole("combobox", { name: "Import into" }).click();
  await page.getByRole("option", { name: "mira" }).click();

  await page.getByTestId("run-workload-submit").click();
  await expect.poll(() => trpc.count("workloads.start")).toBeGreaterThanOrEqual(1);
  const started = trpc.lastInput("workloads.start") as {
    input?: { kind?: unknown };
    mode?: unknown;
    targetOwnerId?: unknown;
  };
  expect(started.input?.kind).toBe("import-st");
  expect(started.mode).toBe("bulk");
  expect(started.targetOwnerId).toBe("user_ct_mira");
});

test("owner maintenance kind: the Maintenance group offers refresh-model-catalog; it runs mode:bulk with NO target", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "workloads.list": () => [],
    "sessions.me": () => OWNER_VIEWER,
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
  await expect.poll(() => trpc.count("workloads.start")).toBeGreaterThanOrEqual(1);
  const started = trpc.lastInput("workloads.start") as {
    input?: { kind?: unknown };
    mode?: unknown;
    targetOwnerId?: unknown;
  };
  expect(started.input?.kind).toBe("refresh-model-catalog");
  expect(started.mode).toBe("bulk");
  expect(started.targetOwnerId).toBeUndefined();
});

test("a failed row shows the FRIENDLY message; the raw exception stays one disclosure away", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "workloads.list": () => [
      workloadRow({
        status: "failed",
        error: "Unable to get model file path or buffer.",
      }),
    ],
    "sessions.me": () => USER_VIEWER,
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

  // The mapped, user-actionable line shows; the raw internal string is NOT the surfaced copy.
  await expect(
    page.getByText(
      "A required local model wasn't available. Check the model is installed, then retry.",
    ),
  ).toBeVisible();
  const raw = page.getByText("Unable to get model file path or buffer.");
  // The raw string lives inside the collapsed "Technical details" disclosure (hidden until expanded).
  await expect(raw).toHaveCount(0);
  await page.getByRole("button", { name: "Technical details" }).click();
  await expect(raw).toBeVisible();
});

test("an UNMAPPED failure falls back to the raw string verbatim (no disclosure)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "workloads.list": () => [
      workloadRow({ status: "failed", error: "runtime: something weirdly specific" }),
    ],
    "sessions.me": () => USER_VIEWER,
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

  await expect(page.getByText("runtime: something weirdly specific")).toBeVisible();
  // Nothing mapped → the raw string IS the surfaced copy; no "Technical details" disclosure.
  await expect(page.getByRole("button", { name: "Technical details" })).toHaveCount(0);
});

test("cancel is confirm-gated (AlertDialog) and retry fires on a failure terminal", async ({
  mount,
  page,
}) => {
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
    "workloads.cancel": () => ({ ok: true }),
    "workloads.retry": () => ({ id: "workload_ct_clone" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsSettingsStory />);

  await page.getByRole("button", { name: "Cancel — Embed corpus" }).click();
  await expect(page.getByText("Cancel this workload?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel workload" }).click();
  await expect.poll(() => trpc.count("workloads.cancel")).toBeGreaterThanOrEqual(1);
  const cancelled = trpc.lastInput("workloads.cancel") as { id?: unknown };
  expect(cancelled.id).toBe("workload_ct_1");

  await page.getByRole("button", { name: "Retry — Distill characters" }).click();
  await expect.poll(() => trpc.count("workloads.retry")).toBeGreaterThanOrEqual(1);
  const retried = trpc.lastInput("workloads.retry") as { id?: unknown };
  expect(retried.id).toBe("workload_ct_2");
});

test("a LIVE progress event drives the row's determinate progress bar (row-local buffer)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "workloads.list": () => [workloadRow()],
    "sessions.me": () => USER_VIEWER,
  });
  await routeWorkloadStream(page, [
    {
      type: "progress",
      workloadId: "workload_ct_1",
      kind: "embed-corpus",
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

test("a LIVE terminal event refetches the list — Running flips to Succeeded without a refresh", async ({
  mount,
  page,
}) => {
  let listCalls = 0;
  await routeTrpc(page, {
    "workloads.list": () => {
      listCalls += 1;
      // The seed read sees the running row; the terminal-event invalidate refetches the succeeded one.
      return listCalls === 1
        ? [workloadRow()]
        : [workloadRow({ status: "succeeded", result: { embedded: 12 } })];
    },
    "sessions.me": () => USER_VIEWER,
  });
  await routeWorkloadStream(page, [
    {
      type: "succeeded",
      workloadId: "workload_ct_1",
      kind: "embed-corpus",
      at: 1_750_000_002_000,
      result: { embedded: 12 },
    },
  ]);

  await mount(<WorkloadsSettingsStory />);

  await expect(page.getByText("Succeeded", { exact: true })).toBeVisible();
  await expect(page.getByText('{"embedded":12}')).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel — Embed corpus" })).toHaveCount(0);
});

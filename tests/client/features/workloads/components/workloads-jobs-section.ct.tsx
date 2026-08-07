// CT: the Jobs SECTION (Settings → Workloads → Jobs — the per-user face of the workloads engine). Drives
// the PRODUCTION path: the section owns its own `workloads.list` + `sessions.me` read behind its own
// QueryBoundary (SET-SEAMS stage 3 — it used to ride the retired pane surface's batch); the filter tabs
// slice client-side; the run dialog fires the real `workloads.start` wire (singular default; owner-only bulk
// + `targetOwnerId`); Cancel is confirm-gated (AlertDialog) and Retry fires on failure terminals; the live
// tail drives the progress bar and the terminal-state refetch without a refresh. A PLAIN user's section must
// never fire the adminProcedure `admin.listUsers` read (the skipToken gate).
//
// THE TAIL IS A ROOM ON THE ONE SOCKET (SSE-1 S5). This file used to stub `workloads.subscribe` — one
// `text/event-stream` response per open row. That procedure is gone: every row ATTACHES a
// `{ channel: "workloads", workloadId }` room to the tab's single `stream.connect`, so the stub is the
// shared `routeOrbSocket` (frames authored as `{ channel, workloadId, event }`) and the lifecycle is
// directly assertable — see the socket-budget test at the bottom, which is the S5 claim: N watched runs,
// ONE connection. The story mounts the socket above the section, as `routes/app-root.tsx` does.

import type { WorkloadEvent } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { OrbSocketRecorder } from "../../../../support/ct/route-orb-socket.ts";
import { routeOrbSocket } from "../../../../support/ct/route-orb-socket.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { WorkloadsJobsSectionStory } from "../_ct-stories.tsx";

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
    lane: "sweep",
    ownerId: "user_ct_kes",
    dependsOn: null,
    error: null,
    progress: null,
    poison: false,
    scheduledAt: 1_750_000_000_000,
    createdAt: 1_750_000_000_000,
    updatedAt: 1_750_000_000_000,
    params: { source: "all" },
    result: null,
    ...overrides,
  };
}

/** The tab's ONE socket, scripted with this run's frames. A row's tail is a ROOM on it, so the stub holds
 *  the stream open until that room has attached — a frame for an unjoined room is dropped by the registry,
 *  exactly as the real server never sends one. Register AFTER routeTrpc: later routes run first. */
function routeWorkloadStream(page: Page, events: readonly WorkloadEvent[]): Promise<OrbSocketRecorder> {
  return routeOrbSocket(page, {
    frames: events.map((event) => ({ channel: "workloads", workloadId: event.workloadId, event })),
    awaitAttaches: events.length === 0 ? 0 : 1,
  });
}

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
        result: { scanned: 40, written: 7 },
      }),
    ],
    "sessions.me": () => USER_VIEWER,
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);

  // All three rows render with their kind labels + status badges (badge text scoped to the panel —
  // the tab labels reuse "Failed").
  const allPanel = page.getByRole("tabpanel", { name: "All" });
  await expect(allPanel.getByText("Index (embeddings)")).toBeVisible();
  await expect(allPanel.getByText("Distill characters")).toBeVisible();
  await expect(allPanel.getByText("Compute themes")).toBeVisible();
  await expect(allPanel.getByText("Failed", { exact: true })).toBeVisible();
  await expect(allPanel.getByText("Succeeded", { exact: true })).toBeVisible();
  // The failure reason + the result SUMMARY render on their rows. The summary is per-kind copy, never the
  // stored blob — this row used to read `{"scanned":40,"written":7}`.
  await expect(allPanel.getByText("runtime: provider unreachable")).toBeVisible();
  await expect(allPanel.getByText("40 rows · 7 written")).toBeVisible();

  // The section stamps its own anchor now (§7.1 — the id is byte-identical across the move).
  await expect(page.locator("#settings-anchor-workloads-jobs")).toBeVisible();

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
    "workloads.start": () => ({ id: "workload_ct_new" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);
  await page.getByTestId("workloads-run-button").click();
  await expect(page.getByTestId("run-workload-dialog")).toBeVisible();

  // The picker offers only singular-capable kinds — an unbuilt stub is absent by construction, and a
  // non-owner never sees the owner-only "Maintenance" group or its bulk-only kind.
  await page.getByRole("combobox", { name: "Job" }).click();
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
    "admin.listUsers": () => ADMIN_USERS,
    "workloads.start": () => ({ id: "workload_ct_new" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);
  await page.getByTestId("workloads-run-button").click();

  await page.getByRole("combobox", { name: "Job" }).click();
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
    "admin.listUsers": () => ADMIN_USERS,
    "workloads.start": () => ({ id: "workload_ct_new" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);
  await page.getByTestId("workloads-run-button").click();

  // The owner's picker is GROUPED — "Run on my data" (singular kinds) + a distinct "Maintenance
  // (all deployments)" group carrying the built bulk-only kind.
  await page.getByRole("combobox", { name: "Job" }).click();
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
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);

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
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);

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
    "workloads.cancel": () => ({ ok: true }),
    "workloads.retry": () => ({ id: "workload_ct_clone" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);

  await page.getByRole("button", { name: "Cancel — Index (embeddings)" }).click();
  await expect(page.getByText("Cancel this job?")).toBeVisible();
  // The M5 cancelLabel extension: this confirm's Cancel button reads "Keep running", not the default.
  await expect(page.getByRole("button", { name: "Keep running" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel job" }).click();
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
  });
  await routeWorkloadStream(page, [
    {
      type: "progress",
      workloadId: castId<WorkloadId>("workload_ct_1"),
      kind: "index",
      at: 1_750_000_001_000,
      progress: { pct: 40, message: "Embedding corpus rows" },
    },
  ]);

  await mount(<WorkloadsJobsSectionStory />);

  // The progressbar's accessible name IS its live label (the Progress primitive's Label part) —
  // the streamed message replaces the static status label once the event lands.
  const bar = page.getByRole("progressbar", { name: "Embedding corpus rows" });
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("aria-valuenow", "40");
});

// The exact server `dependency_failed` message (domain/workloads persistence DEPENDENCY_FAILED_MESSAGE) —
// the row exposes only this string, so the client keys on it to label the DAG terminal apart.
const DEPENDENCY_FAILED_MESSAGE = "a dependency did not succeed (a non-success terminal, or an absent dependency) — the dependent cannot run";

test("run dialog: setting 'Run at' defers the run — start carries scheduledAt (epoch ms)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "workloads.list": () => [],
    "sessions.me": () => USER_VIEWER,
    "workloads.start": () => ({ id: "workload_ct_new" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);
  await page.getByTestId("workloads-run-button").click();
  await page.getByRole("combobox", { name: "Job" }).click();
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
    "workloads.start": () => ({ id: "workload_ct_new" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);
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
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);

  const allPanel = page.getByRole("tabpanel", { name: "All" });
  await expect(allPanel.getByText("Scheduled", { exact: true })).toBeVisible();
  await expect(allPanel.getByText("Scheduled for", { exact: false })).toBeVisible();
  // A deferred row isn't processing → no indeterminate progress bar.
  await expect(allPanel.getByRole("progressbar")).toHaveCount(0);
});

// The lane split (two independent worker loops) is a real thing a user can observe: an interactive job and
// a sweep run AT THE SAME TIME. The section groups by lane so "why are two things running?" has an answer.
test("list: rows in BOTH lanes render under their lane headings", async ({ mount, page }) => {
  await routeTrpc(page, {
    "workloads.list": () => [
      workloadRow({ id: "workload_ct_ingest", kind: "databank-ingest", lane: "interactive", status: "running", params: {} }),
      workloadRow({ id: "workload_ct_sweep", kind: "import-st", lane: "sweep", status: "running", params: {} }),
    ],
    "sessions.me": () => USER_VIEWER,
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);

  const allPanel = page.getByRole("tabpanel", { name: "All" });
  await expect(allPanel.getByText("Interactive — jobs you're waiting on")).toBeVisible();
  await expect(allPanel.getByText("Sweeps — bulk maintenance")).toBeVisible();
  await expect(allPanel.getByText("Databank ingest")).toBeVisible();
  await expect(allPanel.getByText("Import from SillyTavern")).toBeVisible();
});

test("list: with every row in ONE lane the heading is dropped (a lone group label is noise)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "workloads.list": () => [workloadRow(), workloadRow({ id: "workload_ct_2", kind: "compute-themes", params: {} })],
    "sessions.me": () => USER_VIEWER,
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);

  const allPanel = page.getByRole("tabpanel", { name: "All" });
  await expect(allPanel.getByText("Compute themes")).toBeVisible();
  await expect(allPanel.getByText("Sweeps — bulk maintenance")).toHaveCount(0);
});

// The DURABLE progress column is what a reconnect actually reads — here the SSE tail carries NOTHING (the
// 61st second of a 20-minute import), and the row still renders its real position off the list read.
test("list: a running row renders its DURABLE progress with no live event at all", async ({ mount, page }) => {
  await routeTrpc(page, {
    "workloads.list": () => [workloadRow({ progress: { pct: 72, message: "Embedded 720 of 1000" } })],
    "sessions.me": () => USER_VIEWER,
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);

  const bar = page.getByRole("progressbar", { name: "Embedded 720 of 1000" });
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("aria-valuenow", "72");
});

// CATEGORY ≠ STATUS (side-eye 2026-08-06 P3). The `Bulk` chip wore the WARNING colour next to a green
// "Succeeded", so one row told two stories: a healthy run that looked half-alarmed. The run's MODE is a
// category — it takes the neutral tone the sibling queue-state chips already use — and colour on this row
// stays reserved for the status badge that owns it.
test("list: the Bulk badge is a NEUTRAL category chip, never a warning beside a green status", async ({ mount, page }) => {
  await routeTrpc(page, {
    "workloads.list": () => [workloadRow({ status: "succeeded", mode: "bulk", result: { embedded: 12, skipped: 0 } })],
    "sessions.me": () => USER_VIEWER,
  });
  await routeWorkloadStream(page, []);
  await mount(<WorkloadsJobsSectionStory />);

  const row = page.locator('[data-slot="workload-row"]');
  const bulk = row.locator('[data-slot="badge"]').filter({ hasText: "Bulk" });
  const status = row.locator('[data-slot="workload-status"] [data-slot="badge"]');
  await expect(bulk).toBeVisible();
  await expect(status).toHaveText("Succeeded");
  // The two chips must not share the warning skin — asserted as resolved colour, not a class name.
  const [bulkColor, statusColor] = await Promise.all([
    bulk.evaluate((el: HTMLElement): string => getComputedStyle(el).backgroundColor),
    status.evaluate((el: HTMLElement): string => getComputedStyle(el).backgroundColor),
  ]);
  expect(bulkColor).not.toBe(statusColor);
  // …and it is the same neutral skin the queue-state chips wear (one vocabulary for "this is a category").
  const neutral = await page.evaluate((): string => {
    const probe = document.createElement("span");
    probe.className = "bg-muted";
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  });
  expect(bulkColor).toBe(neutral);
});

// A row whose stored params no longer parse used to VANISH from this list. It is now visibly broken here.
test("list: a POISON row is visible, flagged, and retryable", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "workloads.list": () => [workloadRow({ status: "failed", error: "unrecognized or malformed workload kind: compute-themes", params: null, poison: true })],
    "sessions.me": () => USER_VIEWER,
    "workloads.retry": () => ({ id: "workload_ct_retry" }),
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);

  const allPanel = page.getByRole("tabpanel", { name: "All" });
  await expect(allPanel.getByText("Unreadable", { exact: true })).toBeVisible();
  await expect(allPanel.getByText("This run's saved settings can no longer be read", { exact: false })).toBeVisible();
  await allPanel.getByRole("button", { name: "Retry — Index (embeddings)" }).click();
  await expect.poll(() => trpc.count("workloads.retry")).toBe(1);
});

test("list: a queued row with dependsOn shows the Waiting-on-dependencies state", async ({ mount, page }) => {
  await routeTrpc(page, {
    "workloads.list": () => [workloadRow({ status: "queued", dependsOn: ["workload_ct_a", "workload_ct_b"] })],
    "sessions.me": () => USER_VIEWER,
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);

  const allPanel = page.getByRole("tabpanel", { name: "All" });
  await expect(allPanel.getByText("Waiting", { exact: true })).toBeVisible();
  await expect(allPanel.getByText("Waiting on 2 dependencies")).toBeVisible();
});

test("list: a dependency_failed terminal is labelled apart from a normal failure", async ({ mount, page }) => {
  await routeTrpc(page, {
    "workloads.list": () => [workloadRow({ status: "failed", error: DEPENDENCY_FAILED_MESSAGE })],
    "sessions.me": () => USER_VIEWER,
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);

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
      return listCalls === 1 ? [workloadRow()] : [workloadRow({ status: "succeeded", result: { embedded: 12, skipped: 0 } })];
    },
    "sessions.me": () => USER_VIEWER,
  });
  await routeWorkloadStream(page, [
    {
      type: "succeeded",
      workloadId: castId<WorkloadId>("workload_ct_1"),
      kind: "index",
      at: 1_750_000_002_000,
      result: { embedded: 12 },
    },
  ]);

  await mount(<WorkloadsJobsSectionStory />);

  await expect(page.getByText("Succeeded", { exact: true })).toBeVisible();
  await expect(page.getByText("12 embedded")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel — Index (embeddings)" })).toHaveCount(0);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// THE S5 CLAIM. Before the fold this pane opened ONE BROWSER CONNECTION PER ACTIVE ROW, on top of the
// tab's standing chat/rpg/user streams — three watched runs plus a second tab sat at the browser's
// ~6-per-origin ceiling with the user doing nothing unusual (the 2026-08-01 starvation incident,
// docs/design/sse-multiplex-spec.md §1). Rooms cost attach round-trips; connections stay at one.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════
test("THREE active rows attach THREE rooms over exactly ONE socket; a finished run gives its room back", async ({ mount, page }) => {
  let listCalls = 0;
  await routeTrpc(page, {
    "workloads.list": () => {
      listCalls += 1;
      const first = listCalls === 1 ? workloadRow() : workloadRow({ status: "succeeded", result: { embedded: 12 } });
      return [
        first,
        workloadRow({ id: "workload_ct_2", kind: "compute-themes", params: {} }),
        workloadRow({ id: "workload_ct_3", kind: "distill-characters", params: {} }),
      ];
    },
    "sessions.me": () => USER_VIEWER,
    "workloads.listSchedules": () => [],
  });
  const socket = await routeOrbSocket(page, {
    // Serve the terminal only once all three rooms are attached — the registry drops a frame for a room
    // nobody joined, exactly as the real server never sends one.
    awaitAttaches: 3,
    frames: [
      {
        channel: "workloads",
        workloadId: castId<WorkloadId>("workload_ct_1"),
        event: {
          type: "succeeded",
          workloadId: castId<WorkloadId>("workload_ct_1"),
          kind: "index",
          at: 1_750_000_002_000,
          result: { embedded: 12 },
        },
      },
    ],
  });

  await mount(<WorkloadsJobsSectionStory />);
  await expect(page.getByRole("tabpanel", { name: "All" }).getByText("Compute themes")).toBeVisible();

  // One room per running row, each keyed by its own workloadId…
  await expect.poll(() => [...socket.attachedChannels()].sort()).toEqual(["workloads:workload_ct_1", "workloads:workload_ct_2", "workloads:workload_ct_3"]);
  // …over ONE EventSource. That number used to be three, on top of the tab's standing streams.
  expect(socket.connects()).toBe(1);
  // Live-only: no room asks for a replay — the durable `progress` column + `workloads.list` are the truth a
  // reconnect reads (D117 (10)), so there is no cursor to rewind to.
  expect(socket.attachRequests().every(({ sinceSeq }) => sinceSeq === null)).toBe(true);

  // The terminal event invalidates the list; the row leaves the ACTIVE set, so its room is given back —
  // and ONLY its room. The socket and the other two tails are untouched.
  await expect(page.getByText("Succeeded", { exact: true })).toBeVisible();
  await expect.poll(() => socket.detaches().map((ref) => ("workloadId" in ref ? ref.workloadId : ref.channel))).toEqual(["workload_ct_1"]);
  expect(socket.connects()).toBe(1);
});

// The two-homes CTA fix (SE-D, owner 08-02). An empty FILTERED tab is a state to READ ("no failed jobs"),
// not a dead end — the header's "Run a job…" is on screen directly above it, so a per-tab CTA was a second
// simultaneous home for one verb. Only the ALL tab (genuinely nothing to read, ever) keeps its own.
test("empty states: only the ALL tab carries a run CTA; a filtered tab's empty state has none", async ({ mount, page }) => {
  await routeTrpc(page, {
    "workloads.list": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await routeWorkloadStream(page, []);

  await mount(<WorkloadsJobsSectionStory />);

  const allPanel = page.getByRole("tabpanel", { name: "All" });
  await expect(allPanel.getByText("No jobs yet. Background jobs you run appear here.")).toBeVisible();
  await expect(allPanel.getByRole("button", { name: "Run a job" })).toBeVisible();

  await page.getByRole("tab", { name: "Failed" }).click();
  const failedPanel = page.getByRole("tabpanel", { name: "Failed" });
  await expect(failedPanel.getByText("No failed jobs. Good.")).toBeVisible();
  await expect(failedPanel.getByRole("button")).toHaveCount(0);

  // The ONE surviving home is the section header's primary — never hidden per-tab (hiding it would flicker).
  await expect(page.getByTestId("workloads-run-button")).toBeVisible();
});

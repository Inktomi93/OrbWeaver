// The readiness rail's per-pass doors on the production Corpus overview: each row states what its pass needs and
// offers the door the viewer's state allows, and a door starts its own pass through the production queue.

import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { absenceWindow, holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { READINESS_PASSES } from "#client/features/discovery/lib/corpus-readiness-passes.ts";
import type { CorpusCoverageStory } from "../surfaces/_coverage-stories.tsx";

const STORY = "tests/client/features/discovery/surfaces/_coverage-stories/CorpusCoverageStory";
const MEMBER_HANDLE = "companion";
// A start the Cancel wrongly fired reaches the queue within one round trip; this holds well past it.
const ENQUEUE_WINDOW_MS = 500;

test.use({ hasTouch: false, isMobile: false });

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

/** Serve the overview's reads and the doors' writes from `caller`, then mount the production Corpus content. */
async function serveOverview(page: Page, caller: Caller, intercept?: Parameters<typeof serveCorpusProcedures>[2]): Promise<void> {
  await routeTrpc(
    page,
    serveCorpusProcedures(
      caller,
      [
        "discovery.home",
        "discovery.catalog",
        "discovery.visualArchetypes",
        "discovery.forgottenGems",
        "discovery.topKeywords",
        "discovery.unusedCharacters",
        "discovery.modelRouting",
        "discovery.themeDrift",
        "workloads.list",
        "workloads.start",
        "workloads.estimateModelCalls",
        "connection.listBindings",
        "connection.list",
        "settings.getUserSettings",
        "settings.getAppSettingsWithOverrides",
        "sessions.me",
      ],
      intercept,
    ),
  );
}

async function visibleRail(page: Page): Promise<Locator> {
  const rail = page.getByRole("list", { name: "Analysis passes", exact: true });
  await expect(rail).toBeVisible();
  return rail;
}

/** One readiness row, found by the pass name it shows. */
function row(rail: Locator, label: string): Locator {
  return rail.getByRole("listitem").filter({ hasText: label });
}

function passLine(rail: Locator, label: string): Locator {
  return row(rail, label).locator('[data-slot="readiness-pass"]');
}

async function memberCaller(root: Root, owner: Caller): Promise<Caller> {
  const member = (await owner.admin.listUsers()).find((user) => user.handle === MEMBER_HANDLE);
  if (member === undefined) {
    throw new Error(`The corpus must hold the ${MEMBER_HANDLE} member`);
  }
  return await root.internalCallerFor(brandedId("UserId").parse(member.id) satisfies UserId);
}

test("with memory on and a helper model ready, every row states its prerequisite and offers its own pass", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  expect((await owner.settings.getUserSettings()).config.memory.enabled).toBe(true);
  await serveOverview(page, owner);
  await mount<typeof CorpusCoverageStory>(STORY, {});
  const rail = await visibleRail(page);
  const rows = [
    ["Visual families", READINESS_PASSES.families],
    ["Distilled: genre, tone, pitch", READINESS_PASSES.distilled],
    ["Story themes", READINESS_PASSES.storyThemes],
    ["Keywords", READINESS_PASSES.keywords],
    ["Near-duplicates", READINESS_PASSES.duplicates],
  ] as const;
  for (const [label, pass] of rows) {
    const line = passLine(rail, label);
    await expect(line).toHaveAttribute("data-pass-action", "run");
    await expect(line).toContainText(pass.needs);
    await expect(line.getByRole("button", { name: pass.runLabel, exact: true })).toBeEnabled();
  }
});

test("a pass that calls no model starts at once, and its row reads the queued run as running", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const before = (await owner.workloads.list({})).filter((run) => run.kind === "find-duplicates").length;
  await serveOverview(page, owner);
  await mount<typeof CorpusCoverageStory>(STORY, {});
  const rail = await visibleRail(page);

  await passLine(rail, "Near-duplicates").getByRole("button", { name: READINESS_PASSES.duplicates.runLabel, exact: true }).click();

  await expect.poll(async () => (await owner.workloads.list({})).filter((run) => run.kind === "find-duplicates").length).toBe(before + 1);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("a pass that calls the helper model confirms its estimated calls, then enqueues its chain", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const estimate = await Promise.all([
    owner.workloads.estimateModelCalls({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
    owner.workloads.estimateModelCalls({ input: { kind: "compute-themes", params: {} }, mode: "singular" }),
  ]);
  const calls = estimate.reduce((sum, answer) => sum + (answer.calls ?? 0), 0);
  expect(calls).toBeGreaterThan(0);
  const before = new Set((await owner.workloads.list({})).map((run) => run.id));
  await serveOverview(page, owner);
  await mount<typeof CorpusCoverageStory>(STORY, {});
  const rail = await visibleRail(page);

  await passLine(rail, "Story themes").getByRole("button", { name: READINESS_PASSES.storyThemes.runLabel, exact: true }).click();

  const dialog = page.getByRole("alertdialog", { name: READINESS_PASSES.storyThemes.confirmTitle, exact: true });
  await expect(dialog).toContainText(`about ${calls} model calls`);
  await dialog.getByRole("button", { name: READINESS_PASSES.storyThemes.runLabel, exact: true }).click();
  // The harness clock is frozen, so both rows share a createdAt; the chain is read off the ids instead.
  await expect
    .poll(async () => {
      const added = (await owner.workloads.list({})).filter((run) => !before.has(run.id));
      const backfill = added.find((run) => run.kind === "memory-backfill");
      return added.map((run) => ({
        kind: run.kind,
        dependsOn: run.dependsOn ?? [],
        waitsOnBackfill: backfill !== undefined && run.dependsOn?.[0] === backfill.id,
      }));
    })
    .toEqual(
      expect.arrayContaining([
        { kind: "memory-backfill", dependsOn: [], waitsOnBackfill: false },
        { kind: "compute-themes", dependsOn: [expect.any(String)], waitsOnBackfill: true },
      ]),
    );
});

test("a queued run of a row's pass holds that row at running instead of offering a second run", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  // Scheduled a day ahead, so the run stays queued for the whole test.
  await owner.workloads.start({ input: { kind: "find-duplicates", params: {} }, mode: "singular", scheduledAt: root.clock.now() + CADENCE_INTERVAL_MS.daily });
  await serveOverview(page, owner);
  await mount<typeof CorpusCoverageStory>(STORY, {});
  const rail = await visibleRail(page);
  const line = passLine(rail, "Near-duplicates");
  await expect(line).toHaveAttribute("data-pass-action", "running");
  await expect(line).toContainText("Running");
  await expect(line.getByRole("button")).toHaveCount(0);
  await expect(passLine(rail, "Distilled: genre, tone, pitch")).toHaveAttribute("data-pass-action", "run");
});

test("with memory off, the rows that read chat summaries say so and offer to turn memory on", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  await owner.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: false } });
  await serveOverview(page, owner);
  await mount<typeof CorpusCoverageStory>(STORY, {});
  const rail = await visibleRail(page);
  for (const label of ["Story themes", "Keywords"]) {
    const line = passLine(rail, label);
    await expect(line).toHaveAttribute("data-pass-action", "turn-on-memory");
    await expect(line).toContainText(READINESS_PASSES.keywords.needs);
    await expect(line.getByRole("button", { name: "Turn on chat memory", exact: true })).toBeVisible();
  }
  await expect(passLine(rail, "Distilled: genre, tone, pitch")).toHaveAttribute("data-pass-action", "run");
});

test("with no helper model, the passes that call one send the reader to Model roles instead of running", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  await owner.connection.setBinding({ task: "summarize", connectionId: null });
  await serveOverview(page, owner);
  await mount<typeof CorpusCoverageStory>(STORY, {});
  const rail = await visibleRail(page);
  for (const label of ["Distilled: genre, tone, pitch", "Story themes"]) {
    const line = passLine(rail, label);
    await expect(line).toHaveAttribute("data-pass-action", "pick-helper-model");
    await expect(line.getByRole("button", { name: "Open Model roles", exact: true })).toBeVisible();
  }
  // The helper-model note runs to the prose measure, never the rail's whole width.
  const note = page.locator('[data-slot="understanding-pass-utility"]').first();
  await expect(note).toBeVisible();
  const reading = await note.evaluate((node) => ({ cap: getComputedStyle(node.firstElementChild ?? node).maxWidth }));
  expect(reading.cap).not.toBe("none");
  // The near-duplicate and keyword passes call no model, so a missing one does not hold them.
  await expect(passLine(rail, "Near-duplicates")).toHaveAttribute("data-pass-action", "run");
  await expect(passLine(rail, "Keywords")).toHaveAttribute("data-pass-action", "run");
});

test("a member's keywords row names the box owner instead of offering a run the transport refuses", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const member = await memberCaller(root, await root.internalCallerFor(root.ownerId));
  expect((await member.sessions.me()).globalRole).not.toBe("owner");
  await serveOverview(page, member);
  await mount<typeof CorpusCoverageStory>(STORY, {});
  const rail = await visibleRail(page);
  const line = passLine(rail, "Keywords");
  await expect(line).toHaveAttribute("data-pass-action", "box-owner-only");
  await expect(line).toContainText("The box owner runs this pass");
  await expect(line.getByRole("button")).toHaveCount(0);
});

test("a paid door reads busy and cannot be pressed again while its spend is being counted", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const counting = holdServed();
  const queuedRuns = async (): Promise<ReadonlySet<string>> => new Set((await owner.workloads.list({})).map((run) => run.id));
  const before = await queuedRuns();
  // Only the spend count is held; the overview's own reads must answer for the rail to mount.
  await serveOverview(page, owner, (request) => (typeof request === "object" && "mode" in request ? counting : undefined));
  await mount<typeof CorpusCoverageStory>(STORY, {});
  const rail = await visibleRail(page);
  const door = passLine(rail, "Story themes").getByRole("button", { name: READINESS_PASSES.storyThemes.runLabel, exact: true });

  await door.click();
  await counting.requested;
  await expect(door).toHaveAttribute("aria-busy", "true");
  await expect(door).toBeDisabled();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  counting.release();
  const dialog = page.getByRole("alertdialog", { name: READINESS_PASSES.storyThemes.confirmTitle, exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(door).not.toHaveAttribute("aria-busy", "true");
  await expect(door).toBeEnabled();
  await absenceWindow(page, ENQUEUE_WINDOW_MS);
  expect(await queuedRuns()).toEqual(before);
});

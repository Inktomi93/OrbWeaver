import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { testId } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { personaCollisionReviewSchema, ST_SETTINGS_FILE } from "@orb/contracts/import";
import { createPersonaSchema } from "@orb/contracts/persona";
import { exportCharacterPath, PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { actionGroupGeometry, resolvedLength, settledBox } from "@orb/testkit/browser/spec";
import { routeAuthConfig, routeOrbSocket, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, servePhysicalPeer } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page, TestInfo } from "@playwright/test";
import {
  COLLISION_KEEP_ALL_NAME,
  COLLISION_KEEP_BOTH_TITLE,
  COLLISION_MERGE_ALL_NAME,
  COLLISION_MERGE_TITLE,
  IMPORT_FILE_PICKER_NAME,
  IMPORT_FOLDER_NAME,
  IMPORT_INTRO_LEAD,
  importFilePreflightTitle,
  importFolderPreflightTitle,
} from "#client/features/workloads/lib/import-library-names.ts";
import { IMPORT_CONFIRM_NAMES } from "#client/features/workloads/lib/portability-model.ts";
import { WORKLOAD_KIND_LABELS } from "#client/features/workloads/lib/workloads-model.ts";
import {
  cancelWorkloadName,
  retryWorkloadName,
  WORKLOAD_BULK_BADGE,
  WORKLOAD_CANCEL_TITLE,
  WORKLOAD_KEEP_RUNNING_NAME,
  WORKLOAD_SCHEDULED_BADGE,
  WORKLOAD_WAITING_BADGE,
} from "#client/features/workloads/lib/workloads-names.ts";
import type { ScheduleIdentity } from "#client/features/workloads/lib/workloads-schedule-model.ts";
import { SCHEDULE_CADENCE_LABELS, scheduleDeleteName, scheduleEditName } from "#client/features/workloads/lib/workloads-schedule-model.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { WorkloadActionGroupsStory } from "./_action-groups-stories.tsx";

const STORY = "tests/client/features/workloads/components/_action-groups-stories/WorkloadActionGroupsStory";
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
/** A singular and a bulk schedule of one kind and cadence: the row controls' geometry is the subject. */
const SINGULAR_AND_BULK_SCHEDULE = { kind: "import-token-usage-backfill", cadence: "daily", ownerHandle: null } as const satisfies Omit<
  ScheduleIdentity,
  "mode"
>;
const nameMaximum = createPersonaSchema.shape.name.maxLength;
if (nameMaximum === null) {
  throw new Error("The collision case requires a bounded persona name");
}
const PERSONA_NAMES = ["A".repeat(nameMaximum), "B".repeat(nameMaximum)] as const;
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

async function measureActions(row: Locator, controls: readonly Locator[], testInfo: TestInfo, label: string): Promise<void> {
  const page = row.page();
  const geometry = await actionGroupGeometry(row, controls);
  const hostGeometry = await actionGroupGeometry(page.getByRole("group", { name: "Workload action host", exact: true }), controls);
  await testInfo.attach(label, { body: JSON.stringify({ geometry, hostGeometry }), contentType: "application/json" });
  expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
  expect(hostGeometry.inlineOverflow).toBeLessThanOrEqual(1);
  const floor = await resolvedLength(page, `var(${TOKENS["size.control-sm"].cssVar})`, row);
  for (const box of geometry.controls) {
    expect(box.width).toBeGreaterThanOrEqual(floor);
    expect(box.height).toBeGreaterThanOrEqual(floor);
  }
}

async function routeImportReads(page: Page, root: ServerTestHarness): Promise<void> {
  const auth = await root.http.request("/api/auth/config");
  const authBody = await auth.text();
  expect(auth.status).toBe(200);
  await routeAuthConfig(page, authBody);
}

// WebKit applies CORS after URL rewriting; the adapter preserves native multipart bytes across the gallery/root origins.
async function routeNativeReview(page: Page, root: ServerTestHarness, baseURL: string | undefined): Promise<AsyncDisposable> {
  if (baseURL === undefined) {
    throw new Error("Native import review requires the configured gallery origin");
  }
  const origin = new URL(baseURL).origin;
  await using ownership = new AsyncDisposableStack();
  const reviewOrigin = ownership.use(
    await servePhysicalPeer(async (request) => {
      const cors = {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": `${CSRF_HEADER}, content-type`,
      };
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }
      const response = await root.http.request(request);
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries(cors)) {
        headers.set(name, value);
      }
      return new Response(response.body, { status: response.status, headers });
    }),
  ).origin;
  await page.route("**/api/import/tree/review", (route) => route.continue({ url: `${reviewOrigin}/api/import/tree/review` }));
  return ownership.move();
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
    });

    test("card preflight actions fit and cancellation leaves the library unchanged", async ({ mount, page }, testInfo) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const card = await caller.character.create({
        input: createCharacterSchema.parse({
          handle: "import-action-card",
          name: "Import action card",
          description: "An exported card for the real preflight.",
        }),
      });
      const exported = await root.http.request(exportCharacterPath(card.id));
      expect(exported.status).toBe(200);
      const bytes = Buffer.from(await exported.arrayBuffer());
      await routeImportReads(page, root);
      await routeTrpc(page, serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me"]));
      await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "backup-import", width: regime.width, appearance: regime.appearance });
      const intro = page.getByText(new RegExp(`^${RegExp.escape(IMPORT_INTRO_LEAD)}`, "u"));
      await expect(intro).toBeVisible();
      expect((await settledBox(intro)).width).toBeLessThanOrEqual((await resolvedLength(page, `var(${TOKENS["reading.measure-prose"].cssVar})`, intro)) + 1);
      const picker = page.getByLabel(IMPORT_FILE_PICKER_NAME, { exact: true });
      await picker.focus();
      await expect(picker).toBeFocused();
      const chooserPromise = page.waitForEvent("filechooser");
      await page.keyboard.press("Enter");
      await (await chooserPromise).setFiles({ name: "import-action-card.png", mimeType: "image/png", buffer: bytes });
      const preflight = page.getByRole("group", { name: importFilePreflightTitle("import-action-card.png"), exact: true });
      await expect(preflight).toBeFocused();
      const confirm = preflight.getByRole("button", { name: IMPORT_CONFIRM_NAMES.file, exact: true });
      const cancel = preflight.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true });
      await expect(confirm).toBeEnabled();
      await measureActions(confirm.locator(".."), [confirm, cancel], testInfo, "card-preflight-actions");
      // Cancel comes first in the commit row, so Tab from it reaches the submit and Shift+Tab returns.
      await cancel.focus();
      await page.keyboard.press("Tab");
      await expect(confirm).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(cancel).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(preflight).toHaveCount(0);
      await expect(picker).toBeFocused();
      expect((await caller.character.get({ characterId: card.id })).name).toBe(card.name);
      expect(await caller.workloads.list({})).toEqual([]);
    });

    test("real folder collision bulk choices fit and cancellation preserves both personas", async ({ mount, page, baseURL }, testInfo) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const personas = await Promise.all(
        PERSONA_NAMES.map((name) =>
          caller.persona.create({ input: createPersonaSchema.parse({ name, description: "The owned description stays unchanged." }) }),
        ),
      );
      const folder = testInfo.outputPath("persona-profile");
      const cards = join(folder, "characters");
      await mkdir(cards, { recursive: true });
      const card = await caller.character.create({
        input: createCharacterSchema.parse({
          handle: "collision-profile-card",
          name: "Collision profile card",
          description: "A real profile card accompanying its persona settings.",
        }),
      });
      const exported = await root.http.request(exportCharacterPath(card.id));
      expect(exported.status).toBe(200);
      await writeFile(join(cards, "collision-profile-card.png"), Buffer.from(await exported.arrayBuffer()));
      await writeFile(
        join(folder, ST_SETTINGS_FILE),
        JSON.stringify({
          ["power_user"]: {
            personas: { "one.png": PERSONA_NAMES[0], "two.png": PERSONA_NAMES[1] },
            ["persona_descriptions"]: {
              "one.png": { description: "The incoming first description." },
              "two.png": { description: "The incoming second description." },
            },
          },
        }),
      );
      await routeImportReads(page, root);
      await using _review = await routeNativeReview(page, root, baseURL);
      await routeTrpc(page, serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me"]));
      await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "backup-import", width: regime.width, appearance: regime.appearance });
      const chooserPromise = page.waitForEvent("filechooser");
      const picker = page.getByRole("button", { name: IMPORT_FOLDER_NAME, exact: true });
      await picker.focus();
      await expect(picker).toBeFocused();
      await picker.click();
      const reviewResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === PORTABILITY_ROUTES.importTreeReview);
      await (await chooserPromise).setFiles(folder);
      // The pick moves focus onto the preflight once the async plan stages it, so the picker only holds focus until then.
      const preflight = page.getByRole("group", { name: importFolderPreflightTitle(2), exact: true });
      await expect(preflight).toBeFocused();
      const reviewResponse = await reviewResponsePromise;
      expect(reviewResponse.status()).toBe(200);
      const reviewed = personaCollisionReviewSchema.parse(await reviewResponse.json());
      expect(reviewed.collisions).toHaveLength(2);
      await testInfo.attach("actual-persona-review", { body: JSON.stringify(reviewed), contentType: "application/json" });
      const review = page.locator('[data-slot="persona-collision-review"]');
      await expect(review.getByRole("radiogroup")).toHaveCount(2);
      const merge = review.getByRole("button", { name: COLLISION_MERGE_ALL_NAME, exact: true });
      const keep = review.getByRole("button", { name: COLLISION_KEEP_ALL_NAME, exact: true });
      await measureActions(merge.locator(".."), [merge, keep], testInfo, "collision-bulk-actions");
      await merge.focus();
      await page.keyboard.press("Tab");
      await expect(keep).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(review.getByRole("radio", { name: new RegExp(`^${RegExp.escape(COLLISION_KEEP_BOTH_TITLE)}`, "u") })).toHaveCount(2);
      for (const radio of await review.getByRole("radio", { name: new RegExp(`^${RegExp.escape(COLLISION_KEEP_BOTH_TITLE)}`, "u") }).all()) {
        await expect(radio).toBeChecked();
      }
      await merge.click();
      for (const radio of await review.getByRole("radio", { name: new RegExp(`^${RegExp.escape(COLLISION_MERGE_TITLE)}`, "u") }).all()) {
        await expect(radio).toBeChecked();
      }
      await preflight.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
      await expect(preflight).toHaveCount(0);
      await expect(picker).toBeFocused();
      for (const persona of personas) {
        expect((await caller.persona.get({ personaId: persona.id })).description).toBe(persona.description);
      }
      expect(await caller.workloads.list({})).toEqual([]);
    });

    test("bulk and singular schedule row controls fit and remain keyboard reachable", async ({ mount, page }, testInfo) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      for (const mode of ["singular", "bulk"] as const) {
        await caller.workloads.createSchedule({
          input: { kind: SINGULAR_AND_BULK_SCHEDULE.kind, params: {} },
          mode,
          cadence: SINGULAR_AND_BULK_SCHEDULE.cadence,
          enabled: false,
        });
      }
      const before = await caller.workloads.listSchedules({});
      await routeTrpc(
        page,
        serveCorpusProcedures(caller, [
          "settings.getUserSettings",
          "sessions.me",
          "workloads.listSchedules",
          "admin.listUsers",
          "connection.listBindings",
          "connection.list",
        ]),
      );
      await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "workloads-schedules", width: regime.width, appearance: regime.appearance });
      expect((await settledBox(page.getByRole("group", { name: "Workload action host", exact: true }))).width).toBe(regime.width);
      const rows = page.locator('[data-slot="list-row-root"]');
      await expect(rows).toHaveCount(2);
      for (const mode of ["singular", "bulk"] as const) {
        const identity: ScheduleIdentity = { ...SINGULAR_AND_BULK_SCHEDULE, mode };
        const edit = page.getByRole("button", { name: scheduleEditName(identity), exact: true });
        const remove = page.getByRole("button", { name: scheduleDeleteName(identity), exact: true });
        const toggle = rows.filter({ has: edit }).getByRole("switch");
        await measureActions(edit.locator(".."), [edit, remove], testInfo, "schedule-row-actions");
        expect(
          (await actionGroupGeometry(page.getByRole("group", { name: "Workload action host", exact: true }), [toggle])).inlineOverflow,
        ).toBeLessThanOrEqual(1);
        await toggle.focus();
        await page.keyboard.press("Tab");
        await expect(edit).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(remove).toBeFocused();
      }
      expect(await caller.workloads.listSchedules({})).toEqual(before);
    });

    test("deferred bulk Cancel and terminal Retry stay separate, the run action stays inside the host, and cancellation is nondestructive", async ({
      mount,
      page,
    }, testInfo) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const backfill = "import-token-usage-backfill";
      const backfillLabel = WORKLOAD_KIND_LABELS[backfill];
      const cancelled = await caller.workloads.start({ input: { kind: backfill, params: {} } });
      await caller.workloads.cancel({ id: cancelled.id });
      const dependency = await caller.workloads.start({ input: { kind: "assets-backfill", params: {} }, mode: "bulk" });
      const active = await caller.workloads.start({
        input: { kind: backfill, params: {} },
        mode: "bulk",
        dependsOn: [dependency.id],
        scheduledAt: root.clock.now() + CADENCE_INTERVAL_MS.daily,
      });
      await routeTrpc(
        page,
        serveCorpusProcedures(caller, [
          "settings.getUserSettings",
          "sessions.me",
          "workloads.list",
          "workloads.get",
          "admin.listUsers",
          "connection.listBindings",
          "connection.list",
          "stream.attach",
          "stream.detach",
        ]),
      );
      await routeOrbSocket(page, { awaitAttaches: 2 });
      await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "workloads-jobs", width: regime.width, appearance: regime.appearance });
      const deferred = page.locator('[data-slot="workload-row"]').filter({ has: page.getByText(WORKLOAD_SCHEDULED_BADGE, { exact: true }) });
      const terminal = page
        .locator('[data-slot="workload-row"]')
        .filter({ has: page.getByRole("button", { name: retryWorkloadName(backfillLabel), exact: true }) });
      const cancel = deferred.getByRole("button", { name: cancelWorkloadName(backfillLabel), exact: true });
      const retry = terminal.getByRole("button", { name: retryWorkloadName(backfillLabel), exact: true });
      await expect(cancel).toBeEnabled();
      await expect(deferred.getByText(WORKLOAD_BULK_BADGE, { exact: true })).toBeVisible();
      await expect(deferred.getByText(WORKLOAD_WAITING_BADGE, { exact: true })).toBeVisible();
      await expect(deferred.getByRole("button", { name: retryWorkloadName(backfillLabel), exact: true })).toHaveCount(0);
      await expect(terminal.getByRole("button", { name: cancelWorkloadName(backfillLabel), exact: true })).toHaveCount(0);
      await measureActions(cancel.locator(".."), [cancel], testInfo, "deferred-job-actions");
      await measureActions(retry.locator(".."), [retry], testInfo, "terminal-job-actions");
      // The header's run-a-job action shares one row with the filter tabs and may not leave the host at any regime.
      const run = page.getByTestId(testId("workloadsRunButton"));
      await expect(run).toBeVisible();
      expect((await actionGroupGeometry(page.getByRole("group", { name: "Workload action host", exact: true }), [run])).inlineOverflow).toBeLessThanOrEqual(1);
      await retry.focus();
      await expect(retry).toBeFocused();
      await cancel.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("alertdialog", { name: WORKLOAD_CANCEL_TITLE, exact: true });
      const keep = dialog.getByRole("button", { name: WORKLOAD_KEEP_RUNNING_NAME, exact: true });
      await keep.focus();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeHidden();
      await expect(cancel).toBeFocused();
      expect((await caller.workloads.get({ id: active.id })).status).toBe("queued");
      expect((await caller.workloads.get({ id: cancelled.id })).status).toBe("cancelled");
    });
  });
}

test.describe("narrow phone at enlarged text", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 320, height: 568 } });

  test("two schedules of one kind read apart: each row's cadence shows whole beside the shared kind", async ({ mount, page }) => {
    await using root = await createServerHarness(ROOT_OPTIONS);
    const caller = await root.internalCallerFor(root.ownerId);
    const cadences = ["daily", "weekly"] as const;
    for (const cadence of cadences) {
      await caller.workloads.createSchedule({ input: { kind: SINGULAR_AND_BULK_SCHEDULE.kind, params: {} }, mode: "singular", cadence, enabled: false });
    }
    await routeTrpc(
      page,
      serveCorpusProcedures(caller, [
        "settings.getUserSettings",
        "sessions.me",
        "workloads.listSchedules",
        "admin.listUsers",
        "connection.listBindings",
        "connection.list",
      ]),
    );
    await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "workloads-schedules", width: 320, appearance: ENLARGED_APPEARANCE_SETTINGS });
    const rows = page.locator('[data-slot="list-row-root"]');
    await expect(rows).toHaveCount(cadences.length);
    const qualifiers = rows.locator('[data-slot="list-row-title-qualifier"]');
    await expect(qualifiers).toHaveCount(cadences.length);
    expect((await qualifiers.allTextContents()).sort()).toEqual(cadences.map((cadence) => SCHEDULE_CADENCE_LABELS[cadence]).sort());
    for (const label of await qualifiers.all()) {
      // Whole: a label cut by an ellipsis has more text than its box shows.
      expect(await label.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      expect(
        await label.evaluate((node) => node.getBoundingClientRect().right - (node.closest('[data-slot="list-row-root"]')?.getBoundingClientRect().right ?? 0)),
      ).toBeLessThanOrEqual(1);
    }
  });
});

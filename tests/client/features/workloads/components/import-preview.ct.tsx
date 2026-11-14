import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RETRY_NAME } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import type { ImportPreview } from "@orb/contracts/import";
import {
  IMPORT_PREVIEW_KINDS,
  importStartedSchema,
  ST_SECRETS_FILE,
  ST_SETTINGS_FILE,
  TREE_DRY_RUN_FIELD,
  TREE_DRY_RUN_VALUE,
  TREE_FILE_FIELD,
} from "@orb/contracts/import";
import { createPersonaSchema } from "@orb/contracts/persona";
import { exportCharacterPath, PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { StreamFrame } from "@orb/contracts/stream";
import type { WorkloadRowAnyKind } from "@orb/contracts/workloads";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { actionGroupGeometry, resolvedLength, watchToastMounts } from "@orb/testkit/browser/spec";
import type { ServedHold } from "@orb/testkit/ct";
import { holdServed, routeAuthConfig, routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS, nonEmpty, present } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, servePhysicalPeer, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page, Request } from "@playwright/test";
import {
  COLLISION_KEEP_BOTH_TITLE,
  COLLISION_MERGE_TITLE,
  IMPORT_FOLDER_NAME,
  IMPORT_LEFT_ON_DISK_PHRASE,
  IMPORT_PREVIEW_FAILURE,
  IMPORT_PREVIEW_HIDE_NAMES,
  IMPORT_PREVIEW_REPORT_NAME,
  IMPORT_PREVIEW_SHOW_NAMES,
  IMPORT_PROGRESS_NAME,
  IMPORT_RESULT_NAME,
  importPreviewProfileLabel,
} from "#client/features/workloads/lib/import-library-names.ts";
import {
  asImportPreview,
  counted,
  IMPORT_CONFIRM_NAMES,
  IMPORT_CONSEQUENCE,
  IMPORT_NOTHING_FOUND_NOTE,
  KIND_NOUNS,
  previewKindLine,
} from "#client/features/workloads/lib/portability-model.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { ImportPreviewStory } from "./_import-preview-stories.tsx";

// The preview over the real composed server: a picked SillyTavern folder really uploads as a dry run, the workload
// really runs, and the terminal frame the page reads is the real row's result.
const STORY = "tests/client/features/workloads/components/_import-preview-stories/ImportPreviewStory";
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const OWNED_PERSONA = "Mara";
// A persona the folder carries exactly as the library holds it: the summary counts it as already there.
const HELD_PERSONA = "Held persona";
const HELD_DESCRIPTION = "Already in your library.";
const WIDTHS = [
  { name: "wide", width: 960, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow enlarged", width: 300, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

/** The whole numbers a summary line prints, in order. */
function numbersIn(text: string): readonly number[] {
  return (text.match(/\d+/gu) ?? []).map(Number);
}

/** The folder must stage both note kinds the summary adds after a count, or a dropped note could not fail a case. */
function expectNoteItemsStaged(preview: ImportPreview): void {
  const items = IMPORT_PREVIEW_KINDS.flatMap((kind) => preview.kinds[kind].items);
  expect(items.filter((item) => item.inLibrary === true).length).toBeGreaterThan(0);
  expect(items.filter((item) => item.withoutArt === true).length).toBeGreaterThan(0);
}

/** A real exported card plus settings: one persona colliding with an owned one, one the library already holds, and a card that cannot be read. */
async function stageFolder(root: ServerTestHarness, folder: string): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "preview-card", name: "Preview card", description: "A real card in the picked folder." }),
  });
  const exported = await root.http.request(exportCharacterPath(card.id));
  expect(exported.status).toBe(200);
  await caller.character.remove({ characterId: card.id });
  await caller.persona.create({ input: createPersonaSchema.parse({ name: OWNED_PERSONA, description: "Your own description." }) });
  await caller.persona.create({ input: createPersonaSchema.parse({ name: HELD_PERSONA, description: HELD_DESCRIPTION }) });
  await mkdir(join(folder, "characters"), { recursive: true });
  await writeFile(join(folder, "characters", "preview-card.png"), Buffer.from(await exported.arrayBuffer()));
  await writeFile(join(folder, "characters", "broken.png"), "not a card");
  await writeFile(
    join(folder, ST_SETTINGS_FILE),
    JSON.stringify({
      ["power_user"]: {
        personas: { "mara.png": OWNED_PERSONA, "held.png": HELD_PERSONA },
        ["persona_descriptions"]: { "mara.png": { description: "A different description." }, "held.png": { description: HELD_DESCRIPTION } },
      },
    }),
  );
}

const HTTP_ACCEPTED = 202;

// A dry run is never listed (it is a transient row), so the run ids are taken off the tree route's own answers.
const ADMITTED = new WeakMap<ServerTestHarness, WorkloadId[]>();

function admittedOf(root: ServerTestHarness): WorkloadId[] {
  const ids = ADMITTED.get(root) ?? [];
  ADMITTED.set(root, ids);
  return ids;
}

/** The dry runs the page started that the server still holds, newest first; a finished one goes when the next one ends. */
async function dryRuns(root: ServerTestHarness): Promise<readonly WorkloadRowAnyKind[]> {
  const caller = await root.principalFor(root.ownerId);
  const rows = await Promise.all(
    admittedOf(root).map((id) =>
      root.services.workloads.get({ caller, id }).catch((error: unknown) => {
        if (error instanceof DomainNotFoundError) {
          return null;
        }
        throw error;
      }),
    ),
  );
  return rows.filter((row) => row !== null).toReversed();
}

async function dryRunPreviews(root: ServerTestHarness): Promise<readonly ImportPreview[]> {
  return (await dryRuns(root)).flatMap((run) => asImportPreview(run.result) ?? []);
}

// WebKit applies CORS after URL rewriting; the adapter preserves native multipart bytes across the gallery/root origins.
async function routeNativeImport(page: Page, root: ServerTestHarness, baseURL: string | undefined, refuseUploads = 0): Promise<AsyncDisposable> {
  let refused = 0;
  if (baseURL === undefined) {
    throw new Error("The native import needs the configured gallery origin");
  }
  const origin = new URL(baseURL).origin;
  await using ownership = new AsyncDisposableStack();
  const peer = ownership.use(
    await servePhysicalPeer(async (request) => {
      const cors = {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": `${CSRF_HEADER}, content-type`,
      };
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }
      if (request.method === "POST" && new URL(request.url).pathname === PORTABILITY_ROUTES.importTree && refused < refuseUploads) {
        refused += 1;
        return new Response('{"error":"the import queue failed"}', { status: 500, statusText: "Internal Server Error", headers: cors });
      }
      const response = await root.http.request(request);
      if (request.method === "POST" && new URL(request.url).pathname === PORTABILITY_ROUTES.importTree && response.status === HTTP_ACCEPTED) {
        admittedOf(root).push(importStartedSchema.parse(await response.clone().json()).workloadId);
      }
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries(cors)) {
        headers.set(name, value);
      }
      return new Response(response.body, { status: response.status, headers });
    }),
  ).origin;
  for (const path of [PORTABILITY_ROUTES.importTree, PORTABILITY_ROUTES.importTreeReview]) {
    await page.route(`**${path}`, (route) => route.continue({ url: `${peer}${path}` }));
  }
  return ownership.move();
}

/** Every connection ends in EOF, so the page's room re-derives the run through `workloads.get` (the tracker's gap
 *  heal): the stub serves whole bodies, so a live terminal frame cannot follow the attach. Each connection runs
 *  whatever dry run has been admitted since the last one, while `running()` holds. */
function dryRunSocket(root: ServerTestHarness, running: () => boolean = () => true): Parameters<typeof routeOrbSocket>[1] {
  return {
    dropConnectionCount: Number.MAX_SAFE_INTEGER,
    frames: async (signal): Promise<readonly StreamFrame[]> => {
      for (const row of running() ? await dryRuns(root) : []) {
        if (row.status === "queued") {
          await root.runAdmittedWorkload?.(row.id, signal);
        }
      }
      return [];
    },
  };
}

for (const { name, width, appearance } of WIDTHS) {
  test(`${name}: a picked folder shows its counts, skips and collision, reveals names on request, and Cancel writes nothing`, async ({
    mount,
    page,
    baseURL,
  }, testInfo) => {
    await using root = await createServerHarness(ROOT_OPTIONS);
    const caller = await root.internalCallerFor(root.ownerId);
    const folder = testInfo.outputPath("profile");
    await stageFolder(root, folder);
    // The folder's first HTTP request seeds the owner's default content in the background.
    await root.settleBackground();
    const characters = (await caller.character.list({})).items.length;
    const personas = (await caller.persona.list()).length;
    const auth = await root.http.request("/api/auth/config");
    await routeAuthConfig(page, await auth.text());
    await using _native = await routeNativeImport(page, root, baseURL);
    await routeTrpc(page, {
      ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "workloads.cancel", "workloads.get"]),
      "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
      "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
    });
    await routeOrbSocket(page, dryRunSocket(root));
    await mount<typeof ImportPreviewStory>(STORY, { width, appearance });

    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: IMPORT_FOLDER_NAME, exact: true }).click();
    await (await chooserPromise).setFiles(folder);

    const preflight = page.getByRole("group", { name: /^Import \d+ files? from the folder you picked\?$/u });
    const confirm = preflight.getByRole("button", { name: IMPORT_CONFIRM_NAMES.folder, exact: true });
    await expect(confirm).toBeDisabled();
    const report = preflight.getByRole("group", { name: IMPORT_PREVIEW_REPORT_NAME, exact: true });
    await expect(report).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
    await expect(report.getByText("Preview card", { exact: false })).toBeHidden();
    await expect(confirm).toBeEnabled();
    await expect(preflight.getByRole("radiogroup")).toHaveCount(1);

    // The summary's lines, read against the dry run's own result: one count line per populated kind, the skip total
    // after them, the colliding persona's note, and every skip reason.
    const [preview] = nonEmpty(await dryRunPreviews(root));
    const populated = IMPORT_PREVIEW_KINDS.filter((kind) => preview.kinds[kind].total > 0);
    expect(preview.skipped.total).toBeGreaterThan(0);
    expectNoteItemsStaged(preview);
    const lines = (await report.locator(":scope > *").allTextContents()).filter((text) => /^\d/u.test(text));
    expect(lines.slice(0, populated.length)).toEqual(populated.map((kind) => previewKindLine(kind, preview.kinds[kind])));
    expect(lines.slice(populated.length).map(numbersIn)).toEqual([[preview.skipped.total]]);
    for (const reason of new Set(preview.skipped.items.map((skip) => skip.reason))) {
      await expect(report).toContainText(reason);
    }

    await report.getByRole("button", { name: IMPORT_PREVIEW_SHOW_NAMES }).click();
    await expect(report.getByRole("button", { name: IMPORT_PREVIEW_HIDE_NAMES })).toBeVisible();
    await expect(report.getByText("Preview card", { exact: false })).toBeVisible();
    expect((await actionGroupGeometry(page.getByRole("group", { name: "Import preview host", exact: true }), [confirm])).inlineOverflow).toBeLessThanOrEqual(1);

    await preflight.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
    await expect(preflight).toHaveCount(0);
    expect((await caller.character.list({})).items).toHaveLength(characters);
    expect(await caller.persona.list()).toHaveLength(personas);
  });
}

test("cancelling while the folder is being read stops the dry run", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const caller = await root.internalCallerFor(root.ownerId);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  const auth = await root.http.request("/api/auth/config");
  await routeAuthConfig(page, await auth.text());
  await using _native = await routeNativeImport(page, root, baseURL);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "workloads.cancel", "workloads.get", "workloads.list"]),
    "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await routeOrbSocket(page);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: IMPORT_FOLDER_NAME, exact: true }).click();
  await (await chooserPromise).setFiles(folder);
  await expect.poll(async () => (await dryRuns(root)).map((row) => row.status)).toEqual(["queued"]);

  const preflight = page.getByRole("group", { name: /^Import \d+ files? from the folder you picked\?$/u });
  await preflight.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();

  await expect(preflight).toHaveCount(0);
  await expect.poll(async () => (await dryRuns(root)).map((row) => row.status)).toEqual(["cancelled"]);
});

const PREFLIGHT = /^Import \d+ files? from the folder you picked\?$/u;

/** The page's side of a pick: the dry run goes through the real tree route into the composed server. */
async function openImport(page: Page, root: ServerTestHarness): Promise<Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>> {
  const caller = await root.internalCallerFor(root.ownerId);
  const auth = await root.http.request("/api/auth/config");
  await routeAuthConfig(page, await auth.text());
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "workloads.cancel", "workloads.get", "workloads.list"]),
    "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await routeOrbSocket(page, dryRunSocket(root));
  return caller;
}

async function pickFolder(page: Page, folder: string): Promise<void> {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: IMPORT_FOLDER_NAME, exact: true }).click();
  await (await chooserPromise).setFiles(folder);
}

test("a re-pick while the last dry run still holds the account's import slot waits for it and shows the preview", async ({
  mount,
  page,
  baseURL,
}, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  const caller = await openImport(page, root);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  // An earlier dry run still occupies the slot, as a cancelled run does until it settles.
  const held = new FormData();
  held.append(TREE_FILE_FIELD, new File(["{}"], `profile/${ST_SETTINGS_FILE}`), `profile/${ST_SETTINGS_FILE}`);
  held.append(TREE_DRY_RUN_FIELD, TREE_DRY_RUN_VALUE);
  const heldStart = await root.http.request(PORTABILITY_ROUTES.importTree, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body: held });
  expect(heldStart.status).toBe(202);
  const { workloadId } = importStartedSchema.parse(await heldStart.json());

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  await expect(preflight).toBeVisible();
  await expect(preflight.getByRole("status")).toHaveCount(0);
  await expect(page.getByText("409")).toHaveCount(0);

  await caller.workloads.cancel({ id: workloadId });
  const report = preflight.getByRole("group", { name: IMPORT_PREVIEW_REPORT_NAME, exact: true });
  await expect(report).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
  await expect(page.getByText("409")).toHaveCount(0);
});

test("a failed dry run says so in plain words and tone, and Try again reads the folder", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL, 1);
  await openImport(page, root);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  const failure = preflight.getByRole("status");
  await expect(failure).toBeVisible();
  await expect(failure).not.toContainText(/\d{3}|importTree|\{|Failed to fetch/u);
  await expect(failure).toHaveAttribute("data-tone", "destructive");
  await expect(preflight.getByRole("button", { name: IMPORT_CONFIRM_NAMES.folder, exact: true })).toBeEnabled();

  await preflight.getByRole("button", { name: RETRY_NAME, exact: true }).click();
  await expect(preflight.getByRole("group", { name: IMPORT_PREVIEW_REPORT_NAME, exact: true })).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
});

test("a pick brings the preflight, with its progress bar, into view and focuses it", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  await page.setViewportSize({ width: 1280, height: 360 });
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  await expect(preflight).toBeFocused();
  await expect(preflight.getByRole("progressbar")).toBeInViewport();
  // The browser only paints a ring on script focus after a key, so a key is pressed and the focus taken again. A Card handed focus
  // draws the house ring (the Card `focusable` variant), and nothing of the browser's own outline.
  await page.keyboard.press("Shift");
  await preflight.blur();
  await preflight.focus();
  await expect(preflight).toBeFocused();
  expect(await preflight.evaluate((node) => node.matches(":focus-visible"))).toBe(true);
  expect(await preflight.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("none");
  expect(await preflight.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe("none");
});

test("a refused persona review says so in plain words, not the raw request error", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST", "access-control-allow-headers": `${CSRF_HEADER}, content-type` };
  await page.route(`**${PORTABILITY_ROUTES.importTreeReview}`, (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"planted failure"}', headers: cors }),
  );
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  await expect(page.getByText(IMPORT_PREVIEW_FAILURE.serverFailed, { exact: true })).toBeVisible();
  await expect(page.getByText(/reviewTreePersonas|planted failure/u)).toHaveCount(0);
});

test("Import and Cancel stay in reach at the foot of a review taller than the viewport", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  await page.setViewportSize({ width: 1280, height: 360 });
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  await expect(preflight.getByRole("group", { name: IMPORT_PREVIEW_REPORT_NAME, exact: true })).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
  await expect(preflight.getByRole("button", { name: IMPORT_CONFIRM_NAMES.folder, exact: true })).toBeInViewport();
  await expect(preflight.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true })).toBeInViewport();
});

test("the preflight reads Cancel then Import, end-aligned, with Cancel quiet", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  await expect(preflight.getByRole("group", { name: IMPORT_PREVIEW_REPORT_NAME, exact: true })).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
  const cancel = preflight.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true });
  const confirm = preflight.getByRole("button", { name: IMPORT_CONFIRM_NAMES.folder, exact: true });
  const [cancelBox, confirmBox, rowBox] = await Promise.all([cancel.boundingBox(), confirm.boundingBox(), confirm.locator("..").boundingBox()]);
  if (cancelBox === null || confirmBox === null || rowBox === null) {
    throw new Error("The preflight's buttons have no box");
  }
  expect(cancelBox.x + cancelBox.width).toBeLessThanOrEqual(confirmBox.x);
  expect(Math.abs(confirmBox.x + confirmBox.width - (rowBox.x + rowBox.width))).toBeLessThanOrEqual(1);
  await expect(cancel).toHaveCSS("border-top-width", "0px");
});

test("Import hands focus to the progress region", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  await expect(preflight.getByRole("group", { name: IMPORT_PREVIEW_REPORT_NAME, exact: true })).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });

  // Confirmed from the keyboard, so the browser treats the script focus that follows as keyboard focus and would paint its own ring.
  const confirm = preflight.getByRole("button", { name: IMPORT_CONFIRM_NAMES.folder, exact: true });
  await confirm.focus();
  await page.keyboard.press("Enter");
  const progress = page.getByRole("group", { name: IMPORT_PROGRESS_NAME, exact: true });
  await expect(progress).toBeFocused();
  expect(await progress.evaluate((node) => node.matches(":focus-visible"))).toBe(true);
  expect(await progress.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("none");
  expect(await progress.evaluate((node) => getComputedStyle(node).boxShadow)).toBe("none");
});

test("a folder the dry run finds nothing in says so and leaves Import off", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await mkdir(join(folder, "characters"), { recursive: true });
  await writeFile(join(folder, "characters", "broken.png"), "not a card");
  await writeFile(join(folder, ST_SETTINGS_FILE), JSON.stringify({ ["power_user"]: {} }));
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  await expect(preflight.getByText(IMPORT_NOTHING_FOUND_NOTE, { exact: true })).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
  const confirm = preflight.getByRole("button", { name: IMPORT_CONFIRM_NAMES.folder, exact: true });
  await expect(confirm).toBeDisabled();
  await expect(confirm).toHaveAccessibleDescription(IMPORT_NOTHING_FOUND_NOTE);
});

test("Cancel while the folder's bytes are still going up ends the upload request", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  const isUpload = (request: Request): boolean => request.method() === "POST" && new URL(request.url()).pathname === PORTABILITY_ROUTES.importTree;
  // Registered after the native route, so it answers first: the upload is held as a slow link holds it, and everything else falls through.
  await page.route(`**${PORTABILITY_ROUTES.importTree}`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
    }
  });
  const sent = page.waitForRequest(isUpload);
  const ended = page.waitForEvent("requestfailed", isUpload);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  await sent;
  await page.getByRole("group", { name: PREFLIGHT }).getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
  expect((await ended).failure()?.errorText).toMatch(/abort/iu);
});

test("a folder's persona the library already holds is counted as already there, beside a persona it lacks", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const caller = await root.internalCallerFor(root.ownerId);
  const folder = testInfo.outputPath("profile");
  // A preset is a unit the planner sends on its own, so the folder has something to read beside the settings.
  await mkdir(join(folder, "OpenAI Settings"), { recursive: true });
  await writeFile(
    join(folder, "OpenAI Settings", "Plain.json"),
    JSON.stringify({
      prompts: [{ identifier: "main", name: "Main", content: "You are plain.", role: "system" }],
      ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
    }),
  );
  await writeFile(
    join(folder, ST_SETTINGS_FILE),
    JSON.stringify({
      ["power_user"]: {
        personas: { "held.png": HELD_PERSONA, "new.png": "New persona" },
        ["persona_descriptions"]: { "held.png": { description: HELD_DESCRIPTION } },
      },
    }),
  );
  await root.settleBackground();
  await caller.persona.create({ input: createPersonaSchema.parse({ name: HELD_PERSONA, description: HELD_DESCRIPTION }) });
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const report = page.getByRole("group", { name: PREFLIGHT }).getByRole("group", { name: IMPORT_PREVIEW_REPORT_NAME, exact: true });
  await expect(report).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });

  // The control: the wire carries the ownership the line reads, for a kind that is not a character.
  const [preview] = nonEmpty(await dryRunPreviews(root));
  expect(preview.kinds.personas.items.filter((item) => item.inLibrary === true)).toHaveLength(1);
  expectNoteItemsStaged(preview);
  const lines = (await report.locator(":scope > *").allTextContents()).filter((text) => /^\d/u.test(text));
  const populated = IMPORT_PREVIEW_KINDS.filter((kind) => preview.kinds[kind].total > 0);
  expect(lines).toEqual(populated.map((kind) => previewKindLine(kind, preview.kinds[kind])));
});

test("keeping both of a colliding persona holds the preview back until it counts the copy, and the run writes what the line says", async ({
  mount,
  page,
  baseURL,
}, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const caller = await root.internalCallerFor(root.ownerId);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await root.settleBackground();
  const personasBefore = (await caller.persona.list()).length;
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  // The folder's own upload goes through at once; the second upload, the one that judges the personas again, is held
  // until the page has been seen waiting for it.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let uploads = 0;
  await page.route(`**${PORTABILITY_ROUTES.importTree}`, async (route) => {
    if (route.request().method() === "POST") {
      uploads += 1;
      if (uploads === 2) {
        await held;
      }
    }
    await route.fallback();
  });
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  const report = preflight.getByRole("group", { name: IMPORT_PREVIEW_REPORT_NAME, exact: true });
  const confirm = preflight.getByRole("button", { name: IMPORT_CONFIRM_NAMES.folder, exact: true });
  await expect(report).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
  const personaLine = report.getByText(counted(2, KIND_NOUNS.personas), { exact: false });
  // The count and the number the library holds; a note for personas without art follows them.
  const read = async (): Promise<readonly number[]> => numbersIn((await personaLine.textContent()) ?? "").slice(0, 2);
  // Both personas are already there as the dry run was first sent: Mara's namesake merges into the owned Mara.
  expect(await read()).toEqual([2, 2]);

  await preflight.getByRole("radio", { name: COLLISION_KEEP_BOTH_TITLE, exact: false }).click();

  // While the answer is being judged the old numbers are gone and Import is off, so a stale line is never read as current.
  await expect(preflight.getByRole("progressbar")).toBeVisible();
  await expect(report).toBeHidden();
  await expect(confirm).toBeDisabled();
  release();
  await expect(report).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
  await expect(confirm).toBeEnabled();
  const judged = await read();
  expect(judged).toEqual([2, 1]);

  await confirm.click();
  await expect(page.getByRole("group", { name: IMPORT_RESULT_NAME, exact: true })).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
  // The line's own numbers, total less the ones the library holds, are what the run wrote.
  expect((await caller.persona.list()).length - personasBefore).toBe(2 - 1);
});

test("the folder's skip reasons and left-out files read at least as large as the standing policy text", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profile");
  await stageFolder(root, folder);
  await writeFile(join(folder, ST_SECRETS_FILE), "{}");
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const preflight = page.getByRole("group", { name: PREFLIGHT });
  const report = preflight.getByRole("group", { name: IMPORT_PREVIEW_REPORT_NAME, exact: true });
  await expect(report).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
  const [preview] = nonEmpty(await dryRunPreviews(root));
  const [skip] = nonEmpty(preview.skipped.items);

  const fontSize = (text: Locator): Promise<number> => text.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  const policy = await fontSize(preflight.getByText(IMPORT_CONSEQUENCE[0], { exact: true }));
  const reason = await fontSize(report.getByText(skip.reason, { exact: false }));
  const leftOnDisk = await fontSize(preflight.getByText(IMPORT_LEFT_ON_DISK_PHRASE));
  const question = await fontSize(preflight.getByText(PREFLIGHT));
  expect(reason).toBeGreaterThanOrEqual(policy);
  expect(leftOnDisk).toBeGreaterThanOrEqual(policy);
  expect(question).toBeGreaterThanOrEqual(policy);

  // The folder's own facts come before the policy that holds for every import, and the disclosed names read at the label step, not the micro gloss.
  const policyBox = await preflight.getByText(IMPORT_CONSEQUENCE[0], { exact: true }).boundingBox();
  const leftOnDiskBox = await preflight.getByText(IMPORT_LEFT_ON_DISK_PHRASE).first().boundingBox();
  expect(leftOnDiskBox?.y).toBeLessThan(policyBox?.y ?? Number.NEGATIVE_INFINITY);
  await report.getByRole("button", { name: IMPORT_PREVIEW_SHOW_NAMES }).click();
  const name = await fontSize(report.getByText("Preview card", { exact: false }));
  expect(name).toBe(await resolvedLength(page, `var(${TOKENS["text.label"].cssVar})`, report));
});

const ALICE = "alice";
const BOB = "bob";

/** Two profile directories of one picked folder, each with a real exported card at the same path, and one unreadable
 *  card in bob's, the profile that sorts second. The cards are each profile's own, or the very same file in both. */
async function stageProfiles(root: ServerTestHarness, folder: string, cards: "own" | "same"): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  const exportedCards = new Map<string, Buffer>();
  for (const [profile, handle] of [
    [ALICE, "alice-card"],
    [BOB, "bob-card"],
  ] as const) {
    const card = await caller.character.create({
      input: createCharacterSchema.parse({ handle, name: `${profile} card`, description: "A real card in the picked folder." }),
    });
    const exported = await root.http.request(exportCharacterPath(card.id));
    expect(exported.status).toBe(200);
    await caller.character.remove({ characterId: card.id });
    exportedCards.set(profile, Buffer.from(await exported.arrayBuffer()));
  }
  for (const profile of [ALICE, BOB]) {
    await mkdir(join(folder, profile, "characters"), { recursive: true });
    await writeFile(join(folder, profile, "characters", "card.png"), present(exportedCards.get(cards === "own" ? profile : ALICE)));
    await writeFile(join(folder, profile, ST_SETTINGS_FILE), JSON.stringify({ ["power_user"]: {} }));
  }
  await writeFile(join(folder, BOB, "characters", "broken.png"), "not a card");
}

test("a folder of two profiles lists both cards under their own profile, and a refusal stays with the profile it came from", async ({
  mount,
  page,
  baseURL,
}, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profiles");
  await stageProfiles(root, folder, "own");
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const report = page.getByRole("group", { name: PREFLIGHT }).getByRole("group", { name: IMPORT_PREVIEW_REPORT_NAME, exact: true });
  await expect(report).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
  await report.getByRole("button", { name: IMPORT_PREVIEW_SHOW_NAMES }).click();

  // The control: the server's own preview holds both cards, each under a profile, and the unreadable one under bob only.
  const [preview] = nonEmpty(await dryRunPreviews(root));
  expect(preview.kinds.characters.items.map(({ source }) => source.profile).toSorted((a, b) => a.localeCompare(b))).toEqual([ALICE, BOB]);
  expect(preview.skipped.items.filter(({ source }) => source.path === "broken.png").map(({ source }) => source.profile)).toEqual([BOB]);

  const alice = report.getByText(importPreviewProfileLabel(ALICE), { exact: true }).locator("..");
  const bob = report.getByText(importPreviewProfileLabel(BOB), { exact: true }).locator("..");
  await expect(alice).toContainText(`${ALICE} card`);
  await expect(alice).not.toContainText("broken.png");
  await expect(bob).toContainText(`${BOB} card`);
  await expect(bob).toContainText("broken.png");
  await expect(bob).not.toContainText(`${ALICE} card`);
});

test("a folder of two profiles that hold the same card says the second one adds nothing", async ({ mount, page, baseURL }, testInfo) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const folder = testInfo.outputPath("profiles");
  await stageProfiles(root, folder, "same");
  await root.settleBackground();
  await using _native = await routeNativeImport(page, root, baseURL);
  await openImport(page, root);
  await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

  await pickFolder(page, folder);
  const report = page.getByRole("group", { name: PREFLIGHT }).getByRole("group", { name: IMPORT_PREVIEW_REPORT_NAME, exact: true });
  await expect(report).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });

  const [preview] = nonEmpty(await dryRunPreviews(root));
  // The control: the server's preview lists the card under both profiles and marks the second as the first's repeat.
  const verdicts = preview.kinds.characters.items.map(({ source, repeat }) => [source.profile, repeat === true] as const);
  expect(verdicts.toSorted(([a], [b]) => a.localeCompare(b))).toEqual([
    [ALICE, false],
    [BOB, true],
  ]);
  await expect(report).toContainText(previewKindLine("characters", preview.kinds.characters));
  // The same line, read apart from the function that builds it: the kind's own count, then a note carrying the number of
  // repeats the verdicts above hold. A line built without its repeat note has no number after the count.
  const repeats = verdicts.filter(([, repeat]) => repeat).length;
  await expect(report).toContainText(`${counted(preview.kinds.characters.total, KIND_NOUNS.characters)}, ${String(repeats)} `);
});

interface Gate {
  open: boolean;
  heldRun: WorkloadId | null;
  readonly read: ServedHold;
  readonly cancel: ServedHold;
}

/** The page's side of a pick whose dry runs run only while `gate.open`, and whose read and cancel of `gate.heldRun`
 *  wait for the test: the server can finish a dry run the page has not yet read, and the page's cancel of it can land
 *  after the next dry run has started. */
async function openGatedImport(page: Page, root: ServerTestHarness, gate: Gate): Promise<Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>> {
  const caller = await root.internalCallerFor(root.ownerId);
  const auth = await root.http.request("/api/auth/config");
  await routeAuthConfig(page, await auth.text());
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "workloads.list"]),
    ...serveCorpusProcedures(caller, ["workloads.get"], (input) => (input.id === gate.heldRun ? gate.read : undefined)),
    ...serveCorpusProcedures(caller, ["workloads.cancel"], (input) => (input.id === gate.heldRun ? gate.cancel : undefined)),
    "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await routeOrbSocket(
    page,
    dryRunSocket(root, () => gate.open),
  );
  return caller;
}

/** The persona dry run the page last started, once the server holds it queued. */
async function queuedRejudge(root: ServerTestHarness, before: number): Promise<WorkloadId> {
  await expect.poll(() => admittedOf(root).length).toBeGreaterThan(before);
  const id = present(admittedOf(root).at(-1));
  const caller = await root.principalFor(root.ownerId);
  await expect.poll(async () => (await root.services.workloads.get({ caller, id })).status).toBe("queued");
  return id;
}

for (const moment of ["while it runs", "right after it succeeds"] as const) {
  test(`an answer changed again ${moment} shows the preview under the last answer, with no toast and no job left in the list`, async ({
    mount,
    page,
    baseURL,
  }, testInfo) => {
    await using root = await createServerHarness(ROOT_OPTIONS);
    const folder = testInfo.outputPath("profile");
    await stageFolder(root, folder);
    await root.settleBackground();
    await using _native = await routeNativeImport(page, root, baseURL);
    const gate: Gate = { open: true, heldRun: null, read: holdServed(), cancel: holdServed() };
    const caller = await openGatedImport(page, root, gate);
    const toastMounts = await watchToastMounts(page);
    await mount<typeof ImportPreviewStory>(STORY, { width: WIDTHS[0].width, appearance: WIDTHS[0].appearance });

    await pickFolder(page, folder);
    const preflight = page.getByRole("group", { name: PREFLIGHT });
    const report = preflight.getByRole("group", { name: IMPORT_PREVIEW_REPORT_NAME, exact: true });
    await expect(report).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
    const personaLine = report.getByText(counted(2, KIND_NOUNS.personas), { exact: false });
    const read = async (): Promise<readonly number[]> => numbersIn((await personaLine.textContent()) ?? "").slice(0, 2);
    const merged = await read();

    gate.open = false;
    const before = admittedOf(root).length;
    await preflight.getByRole("radio", { name: COLLISION_KEEP_BOTH_TITLE, exact: false }).click();
    const superseded = await queuedRejudge(root, before);
    const afterSuccess = moment === "right after it succeeds";
    if (afterSuccess) {
      // The server finishes the run, and the page's read of it waits: the reader answers again before it lands.
      gate.heldRun = superseded;
      await root.runAdmittedWorkload?.(superseded, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
    }
    await preflight.getByRole("radio", { name: COLLISION_MERGE_TITLE, exact: false }).click();
    // The slot may still be held by the run just cancelled, so the new upload can be refused and retried first.
    await expect.poll(() => admittedOf(root).length, { timeout: WORKLOAD_DEADLINE_MS }).toBeGreaterThan(before + 1);
    if (afterSuccess) {
      // The finished run's cancel reaches the server only now, after the next run has started; the page has its
      // answer, and so any toast it raises, before the report below can show.
      await gate.cancel.requested;
      const answered = page.waitForResponse((response) => response.url().includes("workloads.cancel"));
      gate.cancel.release();
      await answered;
    }
    gate.open = true;

    await expect(report).toBeVisible({ timeout: WORKLOAD_DEADLINE_MS });
    expect(await read()).toEqual(merged);
    gate.read.release();
    expect(await toastMounts()).toBe(0);
    await expect(preflight.getByRole("status")).toHaveCount(0);
    expect(await caller.workloads.list({ kind: "import-st" })).toEqual([]);
  });
}

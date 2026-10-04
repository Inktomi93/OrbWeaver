// CT: the chats-band transcript import dialog (chat-import-dialog.tsx) — the ONE home for getting a chat
// `.jsonl` into the library. Drives the PRODUCTION path: the dropzone's real <input type=file> → the raw
// multipart POST to `/api/import/chat` (page.route-d, since it is not tRPC) → the toast derived from the
// REAL per-file body → the close-vs-stay-open decision.
//
// The pin that matters: the route answers 200 even when every transcript inside failed (per-file
// isolation), so an all-failed batch must NOT read as success — it surfaces the server's own reason and
// the dialog STAYS OPEN so the owner can try another file.
//
// An import enqueues no paid model run. With Memory on, a batch that wrote real conversations keeps the dialog
// on the memory-build offer, scoped to that import's span and passed through the paid-run confirm; with Memory
// off the dialog closes as it always did. The dropzone stays live, so a second drop either widens an unstarted
// offer or starts a fresh one after a build began.

import type { ImportWindow } from "@orb/contracts/chat";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRoutes } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { userSettingsView } from "../../../../support/node/user-settings-view.ts";
import { PAID_RUN_ROUTES } from "../../../../support/node/utility-role.ts";
import { ChatImportDialogStory } from "../_ct-stories.tsx";

const DROPZONE_INPUT = '[data-slot="file-dropzone-input"]';
const TRANSCRIPT = '{"user_name":"Alex","character_name":"Aria"}\n{"name":"Aria","is_user":false,"mes":"Hello."}\n';

/** The open dialog reads Memory's switch; off is the shipped default. */
const MEMORY_OFF_ROUTES: TrpcRoutes<"settings.getUserSettings"> = { "settings.getUserSettings": userSettingsView() };

/** Two drops' spans, in drop order (the server's clock; the second import ran later). */
const FIRST_SPAN: ImportWindow = { from: 1_750_000_000_000, to: 1_750_000_001_000 };
const SECOND_SPAN: ImportWindow = { from: 1_750_000_050_000, to: 1_750_000_051_000 };

/** Memory on, a running Utility model, and a run that costs something, so every yes passes through the confirm. */
const MEMORY_ON_ROUTES: TrpcRoutes<"settings.getUserSettings" | "connection.list" | "connection.listBindings" | "workloads.estimateModelCalls"> = {
  ...PAID_RUN_ROUTES,
  "settings.getUserSettings": userSettingsView({ memory: { enabled: true } }),
  "workloads.estimateModelCalls": { calls: 9 },
};

interface ImportPost {
  readonly method: string;
  readonly csrf: string | null;
  readonly contentType: string | null;
}

/** Stub `POST /api/import/chat` with `body` (or one body per request), recording the request the helper actually sent. */
async function routeImport(page: Page, body: unknown): Promise<{ readonly seen: () => ImportPost | undefined }> {
  const bodyOf = typeof body === "function" ? (body as () => unknown) : (): unknown => body;
  let seen: ImportPost | undefined;
  await page.route("**/api/import/chat", async (route) => {
    const request = route.request();
    seen = {
      method: request.method(),
      csrf: await request.headerValue("x-orb-csrf"),
      contentType: await request.headerValue("content-type"),
    };
    await route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(bodyOf()) });
  });
  return { seen: () => seen };
}

test("a dropped transcript POSTs multipart with the CSRF header and closes on success", async ({ mount, page }) => {
  await routeTrpc(page, MEMORY_OFF_ROUTES);
  const post = await routeImport(page, { imported: [{ filename: "aria.jsonl", created: true }], failed: [], memoryScope: FIRST_SPAN });

  const component = await mount(<ChatImportDialogStory />);
  await page.locator(DROPZONE_INPUT).setInputFiles({ name: "aria.jsonl", mimeType: "application/x-ndjson", buffer: Buffer.from(TRANSCRIPT) });

  await expect.poll(() => post.seen()?.method, { intervals: [20, 50, 100] }).toBe("POST");
  expect(post.seen()?.csrf).toBe("1");
  expect(post.seen()?.contentType ?? "").toContain("multipart/form-data");
  await expect(component.getByTestId("import-notice")).toHaveText("success: Chat imported.");
  // Something landed ⇒ the dialog asked to close.
  await expect(component.getByTestId("import-closes")).toHaveText("1");
});

// The add/import dialogs share one frame: a close glyph in the corner and a Cancel in the footer, each a way out.
test("the dialog offers both a Close glyph and a Cancel, and either one dismisses it", async ({ mount, page }) => {
  await routeTrpc(page, MEMORY_OFF_ROUTES);
  const component = await mount(<ChatImportDialogStory />);

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(component.getByTestId("import-closes")).toHaveText("1");
});

test("an all-failed batch is NOT success: it names the server's reason and the dialog stays open", async ({ mount, page }) => {
  await routeTrpc(page, MEMORY_OFF_ROUTES);
  await routeImport(page, {
    imported: [],
    failed: [{ filename: "ghost.jsonl", error: 'no character named "Ghost" on this account' }],
    memoryScope: null,
  });

  const component = await mount(<ChatImportDialogStory />);
  await page.locator(DROPZONE_INPUT).setInputFiles({ name: "ghost.jsonl", mimeType: "application/x-ndjson", buffer: Buffer.from(TRANSCRIPT) });

  await expect(component.getByTestId("import-notice")).toHaveText('error: ghost.jsonl: no character named "Ghost" on this account');
  await expect(component.getByTestId("import-closes")).toHaveText("0");
});

test("a partial batch reports how many of how many, and still closes", async ({ mount, page }) => {
  await routeTrpc(page, MEMORY_OFF_ROUTES);
  await routeImport(page, {
    imported: [{ filename: "aria.jsonl", created: true }],
    failed: [{ filename: "junk.jsonl", error: "not a valid chat .jsonl file" }],
    memoryScope: null,
  });

  const component = await mount(<ChatImportDialogStory />);
  await page.locator(DROPZONE_INPUT).setInputFiles([
    { name: "aria.jsonl", mimeType: "application/x-ndjson", buffer: Buffer.from(TRANSCRIPT) },
    { name: "junk.jsonl", mimeType: "application/x-ndjson", buffer: Buffer.from("junk") },
  ]);

  await expect(component.getByTestId("import-notice")).toHaveText("info: 1 of 2 imported — junk.jsonl: not a valid chat .jsonl file");
  await expect(component.getByTestId("import-closes")).toHaveText("1");
});

/** One drop's batch: two transcripts that wrote real conversations in `span`. */
function writtenBatch(span: ImportWindow): unknown {
  return {
    imported: [
      { filename: "aria.jsonl", created: true },
      { filename: "bee.jsonl", created: true },
    ],
    failed: [],
    memoryScope: span,
  };
}

const BUILD_LABEL = "Build memory";

function buildOver(span: ImportWindow): unknown {
  return { input: { kind: "memory-backfill", params: { importWindow: span } }, mode: "singular" };
}

async function dropBatch(page: Page): Promise<void> {
  await page.locator(DROPZONE_INPUT).setInputFiles([
    { name: "aria.jsonl", mimeType: "application/x-ndjson", buffer: Buffer.from(TRANSCRIPT) },
    { name: "bee.jsonl", mimeType: "application/x-ndjson", buffer: Buffer.from(TRANSCRIPT) },
  ]);
}

test("with Memory on, a batch that wrote real conversations stays open on a memory build over that import's span", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...MEMORY_ON_ROUTES, "workloads.start": { id: "workload_ct_imported_memory" } });
  await routeImport(page, writtenBatch(FIRST_SPAN));

  const component = await mount(<ChatImportDialogStory />);
  await dropBatch(page);

  const offer = page.getByTestId("imported-chats-memory-offer");
  await expect(offer).toBeVisible();
  await expect(component.getByTestId("import-closes")).toHaveText("0");
  await offer.getByRole("button").click();

  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await expect.poll(() => trpc.lastInput("workloads.estimateModelCalls")).toEqual(buildOver(FIRST_SPAN));
  // @orb-waive ct-no-oneshot-live-read-assert(expect): a zero count after a settled barrier (the confirm painted from the landed count); its yes is the only start path and is not yet pressed, so a poll would pass at t=0 and prove less.
  expect(trpc.count("workloads.start")).toBe(0);
  await confirm.getByRole("button", { name: BUILD_LABEL, exact: true }).click();
  await expect.poll(() => trpc.lastInput("workloads.start")).toEqual(buildOver(FIRST_SPAN));
  await expect(offer.getByRole("button")).toHaveCount(0);
});

// Repro A: a build already started, then a new drop. The new batch is a new offer over ITS span alone — the
// started status must not carry over to chats nobody built, and the started span must not be built twice.
test("a drop after a started build offers afresh, over the new batch's span alone", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...MEMORY_ON_ROUTES, "workloads.start": { id: "workload_ct_imported_memory" } });
  let drops = 0;
  await routeImport(page, () => {
    drops += 1;
    return writtenBatch(drops === 1 ? FIRST_SPAN : SECOND_SPAN);
  });

  await mount(<ChatImportDialogStory />);
  const offer = page.getByTestId("imported-chats-memory-offer");
  await dropBatch(page);
  await offer.getByRole("button").click();
  await page.getByRole("alertdialog").getByRole("button", { name: BUILD_LABEL, exact: true }).click();
  await expect.poll(() => trpc.lastInput("workloads.start")).toEqual(buildOver(FIRST_SPAN));
  await expect(offer.getByRole("button")).toHaveCount(0);

  await dropBatch(page);
  await expect(offer.getByRole("button")).toHaveCount(1);
  await offer.getByRole("button").click();
  await expect.poll(() => trpc.lastInput("workloads.estimateModelCalls")).toEqual(buildOver(SECOND_SPAN));
});

// Repro B: an unstarted offer, then a new drop. Nothing was built yet, so the offer grows to cover both batches.
test("a drop before any build widens the offer to cover both batches", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...MEMORY_ON_ROUTES, "workloads.start": { id: "workload_ct_imported_memory" } });
  let drops = 0;
  await routeImport(page, () => {
    drops += 1;
    return writtenBatch(drops === 1 ? FIRST_SPAN : SECOND_SPAN);
  });

  await mount(<ChatImportDialogStory />);
  const offer = page.getByTestId("imported-chats-memory-offer");
  await dropBatch(page);
  await expect(offer).toBeVisible();
  await dropBatch(page);
  await expect.poll(() => drops).toBe(2);
  await expect(offer.getByRole("button")).toHaveCount(1);
  await offer.getByRole("button").click();

  await expect.poll(() => trpc.lastInput("workloads.estimateModelCalls")).toEqual(buildOver({ from: FIRST_SPAN.from, to: SECOND_SPAN.to }));
});

// The single-active lock already holds this span's build (a second tab, or a retried yes): the offer says it is
// already building instead of failing with a toast.
test("a build already running for the span is explained, not reported as a failure", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...MEMORY_ON_ROUTES, "workloads.start": () => trpcError({ code: "CONFLICT", message: "already in progress" }) });
  await routeImport(page, writtenBatch(FIRST_SPAN));

  const component = await mount(<ChatImportDialogStory />);
  await dropBatch(page);
  const offer = page.getByTestId("imported-chats-memory-offer");
  await offer.getByRole("button").click();
  await page.getByRole("alertdialog").getByRole("button", { name: BUILD_LABEL, exact: true }).click();

  await expect.poll(() => trpc.count("workloads.start")).toBe(1);
  await expect(offer.getByRole("button")).toHaveCount(0);
  await expect(offer).toBeVisible();
  await expect(component.getByTestId("import-notice")).toHaveText("success: 2 chats imported.");
});

// An unstarted offer is waiting on a yes. A later drop that writes no new real conversation leaves the scope as it
// is and keeps the dialog open: closing would throw the pending offer away.
for (const [label, quiet] of [
  ["a duplicate (created:false, no scope)", { imported: [{ filename: "aria.jsonl", created: false }], failed: [], memoryScope: null }],
  ["a greeting-only transcript (imported, no scope)", { imported: [{ filename: "hello.jsonl", created: true }], failed: [], memoryScope: null }],
] as const) {
  test(`an unstarted offer survives a later drop of ${label}`, async ({ mount, page }) => {
    const trpc = await routeTrpc(page, { ...MEMORY_ON_ROUTES, "workloads.start": { id: "workload_ct_imported_memory" } });
    let drops = 0;
    await routeImport(page, () => {
      drops += 1;
      return drops === 1 ? writtenBatch(FIRST_SPAN) : quiet;
    });

    const component = await mount(<ChatImportDialogStory />);
    const offer = page.getByTestId("imported-chats-memory-offer");
    await dropBatch(page);
    await expect(offer.getByRole("button")).toHaveCount(1);
    await dropBatch(page);
    await expect.poll(() => drops).toBe(2);
    // SETTLED: the second drop's own notice landed, so its close-or-stay decision has run.
    await expect(component.getByTestId("import-notice")).toHaveText("success: Chat imported.");

    await expect(component.getByTestId("import-closes")).toHaveText("0");
    await offer.getByRole("button").click();
    await expect.poll(() => trpc.lastInput("workloads.estimateModelCalls")).toEqual(buildOver(FIRST_SPAN));
  });
}

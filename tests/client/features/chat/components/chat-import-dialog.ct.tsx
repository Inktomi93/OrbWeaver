// CT: the chats-band transcript import dialog (chat-import-dialog.tsx) — the ONE home for getting a chat
// `.jsonl` into the library. Drives the PRODUCTION path: the dropzone's real <input type=file> → the raw
// multipart POST to `/api/import/chat` (page.route-d, since it is not tRPC) → the toast derived from the
// REAL per-file body → the close-vs-stay-open decision.
//
// The pin that matters: the route answers 200 even when every transcript inside failed (per-file
// isolation), so an all-failed batch must NOT read as success — it surfaces the server's own reason and
// the dialog STAYS OPEN so the owner can try another file.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatImportDialogStory } from "../_ct-stories";

const DROPZONE_INPUT = '[data-slot="file-dropzone-input"]';
const TRANSCRIPT = '{"user_name":"Alex","character_name":"Aria"}\n{"name":"Aria","is_user":false,"mes":"Hello."}\n';

interface ImportPost {
  readonly method: string;
  readonly csrf: string | null;
  readonly contentType: string | null;
}

/** Stub `POST /api/import/chat` with `body`, recording the request the helper actually sent. */
async function routeImport(page: Page, body: unknown): Promise<{ readonly seen: () => ImportPost | undefined }> {
  let seen: ImportPost | undefined;
  await page.route("**/api/import/chat", async (route) => {
    const request = route.request();
    seen = {
      method: request.method(),
      csrf: await request.headerValue("x-orb-csrf"),
      contentType: await request.headerValue("content-type"),
    };
    await route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  });
  return { seen: () => seen };
}

test("a dropped transcript POSTs multipart with the CSRF header and closes on success", async ({ mount, page }) => {
  await routeTrpc(page, {});
  const post = await routeImport(page, { imported: [{ filename: "aria.jsonl", created: true }], failed: [] });

  const component = await mount(<ChatImportDialogStory />);
  await page.locator(DROPZONE_INPUT).setInputFiles({ name: "aria.jsonl", mimeType: "application/x-ndjson", buffer: Buffer.from(TRANSCRIPT) });

  await expect.poll(() => post.seen()?.method, { intervals: [20, 50, 100] }).toBe("POST");
  expect(post.seen()?.csrf).toBe("1");
  expect(post.seen()?.contentType ?? "").toContain("multipart/form-data");
  await expect(component.getByTestId("import-notice")).toHaveText("success: Chat imported.");
  // Something landed ⇒ the dialog asked to close.
  await expect(component.getByTestId("import-closes")).toHaveText("1");
});

test("an all-failed batch is NOT success: it names the server's reason and the dialog stays open", async ({ mount, page }) => {
  await routeTrpc(page, {});
  await routeImport(page, {
    imported: [],
    failed: [{ filename: "ghost.jsonl", error: 'no character with handle "ghost" on this account' }],
  });

  const component = await mount(<ChatImportDialogStory />);
  await page.locator(DROPZONE_INPUT).setInputFiles({ name: "ghost.jsonl", mimeType: "application/x-ndjson", buffer: Buffer.from(TRANSCRIPT) });

  await expect(component.getByTestId("import-notice")).toHaveText('error: ghost.jsonl: no character with handle "ghost" on this account');
  await expect(component.getByTestId("import-closes")).toHaveText("0");
});

test("a partial batch reports how many of how many, and still closes", async ({ mount, page }) => {
  await routeTrpc(page, {});
  await routeImport(page, {
    imported: [{ filename: "aria.jsonl", created: true }],
    failed: [{ filename: "junk.jsonl", error: "not a valid chat .jsonl file" }],
  });

  const component = await mount(<ChatImportDialogStory />);
  await page.locator(DROPZONE_INPUT).setInputFiles([
    { name: "aria.jsonl", mimeType: "application/x-ndjson", buffer: Buffer.from(TRANSCRIPT) },
    { name: "junk.jsonl", mimeType: "application/x-ndjson", buffer: Buffer.from("junk") },
  ]);

  await expect(component.getByTestId("import-notice")).toHaveText("info: 1 of 2 imported — junk.jsonl: not a valid chat .jsonl file");
  await expect(component.getByTestId("import-closes")).toHaveText("1");
});

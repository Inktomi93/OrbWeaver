// The shared avatar control's cases, run once per surface that mounts it: the persona editor's identity row and the character
// editor's hero band. A click opens the picker and a dropped image takes the same path; the upload shows progress on the
// avatar; an oversize file, a refused upload and a refused write each say so on a line linked to the control, with no toast, and
// a refused write keeps the picture the row already had. The writes reach a real server, and only the upload route is the test's:
// it answers with a picture the server really holds, so a held, failed or superseded upload is the test's to script.
//
// A surface's CT file owns its mount (a feature suite runs only its own feature's door) and registers each case as a `test`;
// the browser-world helpers and the client door arrive as arguments because this Node-rooted module reaches no DOM declaration.
// @subject packages/client/src/components/avatar-upload.tsx

import type { StoredAsset } from "@orb/contracts/assets";
import { blobUrl, storedAssetSchema } from "@orb/contracts/assets";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { ID_PREFIX } from "@orb/kit/ids";

import { absenceWindow, routeAuthConfig } from "@orb/testkit/ct";
import { expect } from "@orb/testkit/ct-corpus";
import { createServerHarness, makeAssetBytes } from "@orb/testkit/node/composed";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import { AVATAR_UPLOAD_FAILED, AVATAR_UPLOADING_NAME, AVATAR_WRITE_REFUSED } from "#client/lib/avatar-upload-copy.ts";

const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const UPLOAD_ROUTE = "/api/assets/upload";
const BLOB_ROUTES = "**/api/blob/**";
const TOAST_WINDOW_MS = 300;
// A cap under any real picture, so a tiny file is "oversize" without a huge buffer.
const TINY_CAP_BYTES = 8;
const OVERSIZE_FILE = { name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(TINY_CAP_BYTES * 4) } as const;
const PICKED_FILE = { name: "new.png", mimeType: "image/png", buffer: Buffer.from("picked-bytes") } as const;

type Root = Awaited<ReturnType<typeof createServerHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
type Mount = PlaywrightTestArgs["mount"];

/** What one surface gives a case: the control to drive, the write count, and the hash the server holds for the row. */
interface Staged {
  readonly control: Locator;
  readonly writes: () => number;
  readonly storedHash: () => Promise<string | null>;
}

interface StageArgs {
  readonly page: Page;
  readonly mount: Mount;
  readonly caller: Caller;
  /** The picture the row already has. */
  readonly current: StoredAsset;
  /** Script the surface's write to fail. */
  readonly refuseWrite: boolean;
}

export interface AvatarSurface {
  readonly name: string;
  /** The avatar control's accessible name. */
  readonly controlName: string;
  /** Seeds a row wearing `current`, routes its reads and write, mounts the production surface and returns the avatar control. */
  readonly stage: (args: StageArgs) => Promise<Staged>;
}

/** Stores one real, distinct picture through the upload route the page uses. */
async function storePicture(root: Root): Promise<StoredAsset> {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)))], "stored.png", { type: "image/png" }));
  form.set("kind", "avatar");
  const response = await root.http.request(UPLOAD_ROUTE, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body: form });
  expect(response.status).toBe(200);
  return storedAssetSchema.parse(await response.json());
}

/** Sends picture reads to the real server, so the avatar's image can load. */
async function routeBlobs(page: Page, root: Root): Promise<void> {
  await page.route(BLOB_ROUTES, async (route) => {
    const url = new URL(route.request().url());
    const answer = await root.http.request(`${url.pathname}${url.search}`);
    await route.fulfill({ status: answer.status, headers: Object.fromEntries(answer.headers), body: Buffer.from(await answer.arrayBuffer()) });
  });
}

interface UploadAnswer {
  readonly status: number;
  readonly body: unknown;
}

/** Answers each upload with `answer(n)` for the n-th request, and counts them. */
async function routeUploads(page: Page, answer: (nth: number) => Promise<UploadAnswer>): Promise<() => number> {
  let sent = 0;
  await page.route(`**${UPLOAD_ROUTE}`, async (route) => {
    sent += 1;
    const { status, body } = await answer(sent);
    await route.fulfill({ status, json: body });
  });
  return (): number => sent;
}

const served = (asset: StoredAsset): Promise<UploadAnswer> => Promise.resolve({ status: 200, body: asset });

async function pick(page: Page, control: Locator, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await control.click();
  await (await chooser).setFiles(file);
}

async function expectPicture(control: Locator, asset: StoredAsset | { readonly hash: string }): Promise<void> {
  await expect(control.locator("img")).toHaveAttribute("src", blobUrl(asset.hash));
}

/** The control's own line says `line`, and the control is described by it. */
async function expectLine(page: Page, control: Locator, line: string): Promise<void> {
  await expect(page.getByText(line, { exact: true })).toBeVisible();
  await expect(control).toHaveAccessibleDescription(line);
}

/** What the CT file passes in: this module is Node-rooted and reaches no DOM declaration, and the client door carries the DOM. */
interface ClientSide {
  /** Drops one file on `target`; whether the drop was claimed (its default cancelled). */
  readonly dropOn: (target: Locator, transfer: { readonly file: string; readonly type: string }) => Promise<boolean>;
  /** The production size pre-check the control runs, which words the oversize line. */
  readonly oversizeUploadMessage: (file: File, maxBytes: number) => string | undefined;
  /** Counts every toast the page mounts; call before `mount()`. */
  readonly watchToastMounts: (page: Page) => Promise<() => Promise<number>>;
}

/** What one case runs against: the fixtures of the CT file that registered it, and its surface. */
interface AvatarCaseContext {
  readonly surface: AvatarSurface;
  readonly client: ClientSide;
  readonly signedInConfig: SignedInConfig;
  readonly page: Page;
  readonly mount: Mount;
}

type SignedInConfig = Exclude<Parameters<typeof routeAuthConfig>[1], string>;

interface AvatarCase {
  readonly title: string;
  readonly run: (context: AvatarCaseContext) => Promise<void>;
}

/** The cases every surface that mounts the avatar control runs. The CT file registers each as its own `test`, because
 *  Playwright discovers a test only where the file itself calls `test`. */
export const AVATAR_CASES: readonly AvatarCase[] = [
  {
    title: "a picked picture uploads, then replaces the old one once the write commits",
    run: async ({ surface, signedInConfig, page, mount }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const [current, next] = [await storePicture(root), await storePicture(root)];
      await routeAuthConfig(page, signedInConfig);
      await routeBlobs(page, root);
      const uploads = await routeUploads(page, () => served(next));
      const { control, writes, storedHash } = await surface.stage({ page, mount, caller, current, refuseWrite: false });
      await expectPicture(control, current);

      await pick(page, control, PICKED_FILE);

      await expectPicture(control, next);
      expect(uploads()).toBe(1);
      expect(writes()).toBe(1);
      expect(await storedHash()).toBe(next.hash);
      await expect(control).not.toHaveCSS("box-shadow", "none");
    },
  },
  {
    title: "a dropped image takes the same path, and the drop is claimed so the tab does not navigate to it",
    run: async ({ surface, client, signedInConfig, page, mount }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const [current, next] = [await storePicture(root), await storePicture(root)];
      await routeAuthConfig(page, signedInConfig);
      await routeBlobs(page, root);
      const uploads = await routeUploads(page, () => served(next));
      const { control, writes, storedHash } = await surface.stage({ page, mount, caller, current, refuseWrite: false });
      await expectPicture(control, current);

      expect(await client.dropOn(control, { file: PICKED_FILE.name, type: PICKED_FILE.mimeType })).toBe(true);

      await expectPicture(control, next);
      expect(uploads()).toBe(1);
      expect(writes()).toBe(1);
      expect(await storedHash()).toBe(next.hash);
    },
  },
  {
    title: "a held upload shows progress on the avatar and leaves the old picture until the write commits",
    run: async ({ surface, signedInConfig, page, mount }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const [current, next] = [await storePicture(root), await storePicture(root)];
      await routeAuthConfig(page, signedInConfig);
      await routeBlobs(page, root);
      const gate = Promise.withResolvers<void>();
      await routeUploads(page, async () => {
        await gate.promise;
        return served(next);
      });
      const { control, writes } = await surface.stage({ page, mount, caller, current, refuseWrite: false });
      await expectPicture(control, current);

      await pick(page, control, PICKED_FILE);

      await expect(page.getByRole("status").filter({ hasText: AVATAR_UPLOADING_NAME })).toBeVisible();
      await expect(control).toHaveAttribute("aria-busy", "true");
      await expectPicture(control, current);
      await expect(control).toHaveCSS("box-shadow", "none");
      expect(writes()).toBe(0);

      gate.resolve();
      await expectPicture(control, next);
      await expect(page.getByRole("status").filter({ hasText: AVATAR_UPLOADING_NAME })).toHaveCount(0);
      expect(writes()).toBe(1);
    },
  },
  {
    title: "a newer pick supersedes an upload still in flight, so the slow one never lands over it",
    run: async ({ surface, signedInConfig, page, mount }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const [current, slow, quick] = [await storePicture(root), await storePicture(root), await storePicture(root)];
      await routeAuthConfig(page, signedInConfig);
      await routeBlobs(page, root);
      const gate = Promise.withResolvers<void>();
      const uploads = await routeUploads(page, async (nth) => {
        if (nth === 1) {
          await gate.promise;
          return served(slow);
        }
        return served(quick);
      });
      const { control, writes, storedHash } = await surface.stage({ page, mount, caller, current, refuseWrite: false });

      await pick(page, control, PICKED_FILE);
      await expect(control).toHaveAttribute("aria-busy", "true");
      await pick(page, control, PICKED_FILE);
      await expectPicture(control, quick);
      expect(writes()).toBe(1);

      gate.resolve();
      await absenceWindow(page, TOAST_WINDOW_MS);
      expect(uploads()).toBe(2);
      expect(writes()).toBe(1);
      await expectPicture(control, quick);
      expect(await storedHash()).toBe(quick.hash);
    },
  },
  {
    title: "an oversize file is refused on the control's own line before any upload, and raises no toast",
    run: async ({ surface, client, signedInConfig, page, mount }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const current = await storePicture(root);
      await routeAuthConfig(page, { ...signedInConfig, uploads: { ...DEFAULT_UPLOAD_CAPS, ...signedInConfig.uploads, assetUpload: TINY_CAP_BYTES } });
      await routeBlobs(page, root);
      const uploads = await routeUploads(page, () => served(current));
      const toasts = await client.watchToastMounts(page);
      const { control, writes } = await surface.stage({ page, mount, caller, current, refuseWrite: false });
      await expectPicture(control, current);

      await pick(page, control, OVERSIZE_FILE);

      const line = client.oversizeUploadMessage(new File([OVERSIZE_FILE.buffer], OVERSIZE_FILE.name), TINY_CAP_BYTES);
      expect(line).toBeDefined();
      await expectLine(page, control, line ?? "");
      await absenceWindow(page, TOAST_WINDOW_MS);
      expect(await toasts()).toBe(0);
      expect(uploads()).toBe(0);
      expect(writes()).toBe(0);
      await expectPicture(control, current);
    },
  },
  {
    title: "a failed upload says so on the control's own line, keeps the old picture and raises no toast",
    run: async ({ surface, client, signedInConfig, page, mount }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const current = await storePicture(root);
      await routeAuthConfig(page, signedInConfig);
      await routeBlobs(page, root);
      const uploads = await routeUploads(page, () => Promise.resolve({ status: 500, body: { error: "scripted upload failure" } }));
      const toasts = await client.watchToastMounts(page);
      const { control, writes } = await surface.stage({ page, mount, caller, current, refuseWrite: false });
      await expectPicture(control, current);

      await pick(page, control, PICKED_FILE);

      await expectLine(page, control, AVATAR_UPLOAD_FAILED);
      await absenceWindow(page, TOAST_WINDOW_MS);
      expect(await toasts()).toBe(0);
      expect(uploads()).toBe(1);
      expect(writes()).toBe(0);
      await expectPicture(control, current);
    },
  },
  {
    title: "a refused write keeps the old picture and says so on the control's own line, with no toast",
    run: async ({ surface, client, signedInConfig, page, mount }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const [current, next] = [await storePicture(root), await storePicture(root)];
      await routeAuthConfig(page, signedInConfig);
      await routeBlobs(page, root);
      const uploads = await routeUploads(page, () => served(next));
      const toasts = await client.watchToastMounts(page);
      const { control, writes, storedHash } = await surface.stage({ page, mount, caller, current, refuseWrite: true });
      await expectPicture(control, current);

      await pick(page, control, PICKED_FILE);

      await expectLine(page, control, AVATAR_WRITE_REFUSED);
      await absenceWindow(page, TOAST_WINDOW_MS);
      expect(await toasts()).toBe(0);
      expect(uploads()).toBe(1);
      expect(writes()).toBe(1);
      await expectPicture(control, current);
      await expect(control).toHaveCSS("box-shadow", "none");
      expect(await storedHash()).toBe(current.hash);
    },
  },
];

// The shared avatar control's cases, run once per surface that mounts it: the persona editor's identity row and the character
// editor's hero band. A click opens the picker and a dropped image takes the same path; the upload shows progress on the
// avatar; an oversize file, a file that is not an image, several files, a drag with no file, a refused upload and a refused write
// each say so on a line linked to the control, with no toast, and a refused write keeps the picture the row already had. Writes
// run in pick order, so the newest pick is the picture the row ends on; a failure after the control is gone raises a toast. The writes reach a real server, and only the upload route is the test's:
// it answers with a picture the server really holds, so a held, failed or superseded upload is the test's to script.
//
// A surface's CT file owns its mount (a feature suite runs only its own feature's door) and registers each case as a `test`;
// the browser-world helpers and the client door arrive as arguments because this Node-rooted module reaches no DOM declaration.
// @subject packages/client/src/components/avatar-upload.tsx

import type { StoredAsset } from "@orb/contracts/assets";
import { assetUploadRefusalSchema, blobUrl, storedAssetSchema } from "@orb/contracts/assets";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { ID_PREFIX } from "@orb/kit/ids";

import type { ServedHold } from "@orb/testkit/ct";
import { absenceWindow, holdServed, routeAuthConfig } from "@orb/testkit/ct";
import { expect } from "@orb/testkit/ct-corpus";
import { createServerHarness, makeAssetBytes } from "@orb/testkit/node/composed";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import {
  AVATAR_DROP_A_FILE,
  AVATAR_NOT_A_PICTURE,
  AVATAR_ONE_AT_A_TIME,
  AVATAR_REPLACE_HINT,
  AVATAR_UPLOAD_FAILED,
  AVATAR_UPLOADING_NAME,
  AVATAR_WRITE_REFUSED,
} from "#client/lib/avatar-upload-copy.ts";

const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const UPLOAD_ROUTE = "/api/assets/upload";
const BLOB_ROUTES = "**/api/blob/**";
const TOAST_WINDOW_MS = 300;
// By slot, because the toaster announces each toast again in a live region that shares its text.
const TOAST_TITLE = '[data-slot="toast-title"]';
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
  /** Takes the control off the screen the way the surface does it: collapsing the persona row, closing the character editor. */
  readonly unmount: () => Promise<void>;
  /** Brings the control back, so a case can read what the row holds afterwards. */
  readonly remount: () => Promise<void>;
  /** The surface's identity row: the box that holds the control and the fields beside it, whose parts must not move when the failure line comes. */
  readonly identity: Locator;
}

interface StageArgs {
  readonly page: Page;
  readonly mount: Mount;
  readonly caller: Caller;
  /** The picture the row already has. */
  readonly current: StoredAsset;
  /** Script the surface's write to fail. */
  readonly refuseWrite: boolean;
  /** Holds the first write until the case releases or fails it; the server answers every later write. */
  readonly writeHold?: ServedHold;
  /** The window width the case runs at, for a surface that takes its width from its mount. */
  readonly width?: number;
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

/** The control's description is its hint, then the line that refuses it: the refusal glyph's own label sits between them. */
function describedEndingWith(line: string): RegExp {
  return new RegExp(`^${AVATAR_REPLACE_HINT.replaceAll(".", String.raw`\.`)} .*${line.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`)}$`, "u");
}

/** The failure line says `line`, and the control is described by it. */
async function expectLine(page: Page, control: Locator, line: string): Promise<void> {
  await expect(page.getByText(line, { exact: true })).toBeVisible();
  await expect(control).toHaveAccessibleDescription(describedEndingWith(line));
}

/** What the CT file passes in: this module is Node-rooted and reaches no DOM declaration, and the client door carries the DOM. */
interface ClientSide {
  /** Drops `transfer` on `target`; whether the drop was claimed (its default cancelled). */
  readonly dropOn: (
    target: Locator,
    transfer:
      | { readonly file: string; readonly type: string }
      | { readonly files: readonly { readonly file: string; readonly type: string }[] }
      | { readonly text: string },
  ) => Promise<boolean>;
  /** Holds `file` over `target`, entered and over with no drop; resolves to the gesture that takes it away again. */
  readonly dragFileOver: (target: Locator, file: { readonly file: string; readonly type: string }) => Promise<() => Promise<void>>;
  /** The refusal line as the browser laid it out and painted it. */
  readonly readRefusalLine: (line: Locator) => Promise<{
    readonly ink: string;
    readonly destructiveInk: string;
    readonly left: number;
    readonly width: number;
    readonly lines: number;
  }>;
  /** Whether the page's primary pointer can hover. */
  readonly pageCanHover: (page: Page) => Promise<boolean>;
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

/**
 * A refused entry says why on the control's own line with no toast and sends nothing: no upload, no write, and the picture and
 * the stored row stay as they were. `enter` is the gesture that hands the control its file; a `cap` serves a tiny upload limit.
 */
async function expectRefusedEntry(
  { surface, client, signedInConfig, page, mount }: AvatarCaseContext,
  enter: (control: Locator) => Promise<void>,
  line: string,
  cap?: number,
): Promise<void> {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const caller = await root.internalCallerFor(root.ownerId);
  const current = await storePicture(root);
  const uploadCaps =
    cap === undefined ? signedInConfig : { ...signedInConfig, uploads: { ...DEFAULT_UPLOAD_CAPS, ...signedInConfig.uploads, assetUpload: cap } };
  await routeAuthConfig(page, uploadCaps);
  await routeBlobs(page, root);
  const uploads = await routeUploads(page, () => served(current));
  const toasts = await client.watchToastMounts(page);
  const { control, writes, storedHash } = await surface.stage({ page, mount, caller, current, refuseWrite: false });
  await expectPicture(control, current);

  await enter(control);

  await expectLine(page, control, line);
  await absenceWindow(page, TOAST_WINDOW_MS);
  expect(await toasts()).toBe(0);
  expect(uploads()).toBe(0);
  expect(writes()).toBe(0);
  await expectPicture(control, current);
  expect(await storedHash()).toBe(current.hash);
}

/** Reads one toast, and no second one, from the toast-mount count. */
async function expectOneToast(page: Page, toasts: () => Promise<number>): Promise<void> {
  await expect.poll(toasts).toBe(1);
  await absenceWindow(page, TOAST_WINDOW_MS);
  expect(await toasts()).toBe(1);
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
  {
    title: "a write still in flight is followed by the newer pick's write, never overtaken, so the newer picture is the one the row ends on",
    run: async ({ surface, signedInConfig, page, mount }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const [current, slow, quick] = [await storePicture(root), await storePicture(root), await storePicture(root)];
      await routeAuthConfig(page, signedInConfig);
      await routeBlobs(page, root);
      const uploads = await routeUploads(page, (nth) => served(nth === 1 ? slow : quick));
      const writeHold = holdServed();
      const { control, writes, storedHash } = await surface.stage({ page, mount, caller, current, refuseWrite: false, writeHold });

      await pick(page, control, PICKED_FILE);
      await writeHold.requested;
      await pick(page, control, PICKED_FILE);
      await expect.poll(uploads).toBe(2);
      await absenceWindow(page, TOAST_WINDOW_MS);
      expect(writes()).toBe(1);

      writeHold.release();

      await expect.poll(storedHash).toBe(quick.hash);
      await expectPicture(control, quick);
      await absenceWindow(page, TOAST_WINDOW_MS);
      expect(writes()).toBe(2);
      expect(await storedHash()).toBe(quick.hash);
      await expectPicture(control, quick);
    },
  },
  {
    title: "a write released before the newer pick's upload finishes is followed by that pick's write, so the newer picture is the one the row ends on",
    run: async ({ surface, signedInConfig, page, mount }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const [current, slow, quick] = [await storePicture(root), await storePicture(root), await storePicture(root)];
      await routeAuthConfig(page, signedInConfig);
      await routeBlobs(page, root);
      const gate = Promise.withResolvers<void>();
      const uploads = await routeUploads(page, async (nth) => {
        if (nth === 1) {
          return served(slow);
        }
        await gate.promise;
        return served(quick);
      });
      const writeHold = holdServed();
      const { control, writes, storedHash } = await surface.stage({ page, mount, caller, current, refuseWrite: false, writeHold });

      await pick(page, control, PICKED_FILE);
      await writeHold.requested;
      await pick(page, control, PICKED_FILE);
      await expect.poll(uploads).toBe(2);
      writeHold.release();
      await expect.poll(storedHash).toBe(slow.hash);
      expect(writes()).toBe(1);

      gate.resolve();

      await expect.poll(storedHash).toBe(quick.hash);
      await expectPicture(control, quick);
      await absenceWindow(page, TOAST_WINDOW_MS);
      expect(writes()).toBe(2);
      expect(await storedHash()).toBe(quick.hash);
      await expectPicture(control, quick);
    },
  },
  {
    title: "an older write that is refused is still followed by the newer pick's write, and the control says nothing of the superseded one",
    run: async ({ surface, client, signedInConfig, page, mount }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const [current, slow, quick] = [await storePicture(root), await storePicture(root), await storePicture(root)];
      await routeAuthConfig(page, signedInConfig);
      await routeBlobs(page, root);
      const uploads = await routeUploads(page, (nth) => served(nth === 1 ? slow : quick));
      const toasts = await client.watchToastMounts(page);
      const writeHold = holdServed();
      const { control, writes, storedHash } = await surface.stage({ page, mount, caller, current, refuseWrite: false, writeHold });

      await pick(page, control, PICKED_FILE);
      await writeHold.requested;
      await pick(page, control, PICKED_FILE);
      await expect.poll(uploads).toBe(2);
      writeHold.fail();

      await expect.poll(storedHash).toBe(quick.hash);
      await expectPicture(control, quick);
      await absenceWindow(page, TOAST_WINDOW_MS);
      expect(writes()).toBe(2);
      expect(await toasts()).toBe(0);
      await expect(page.getByText(AVATAR_WRITE_REFUSED, { exact: true })).toHaveCount(0);
    },
  },
  {
    title: "an upload that fails after the control is gone raises one toast, because its own line has no place left",
    run: async ({ surface, client, signedInConfig, page, mount }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const current = await storePicture(root);
      await routeAuthConfig(page, signedInConfig);
      await routeBlobs(page, root);
      const gate = Promise.withResolvers<void>();
      await routeUploads(page, async () => {
        await gate.promise;
        return { status: 500, body: { error: "scripted upload failure" } };
      });
      const toasts = await client.watchToastMounts(page);
      const { control, writes, storedHash, unmount, remount } = await surface.stage({ page, mount, caller, current, refuseWrite: false });
      await pick(page, control, PICKED_FILE);
      await expect(control).toHaveAttribute("aria-busy", "true");
      await unmount();
      await expect(control).toHaveCount(0);

      gate.resolve();

      await expectOneToast(page, toasts);
      await expect(page.locator(TOAST_TITLE, { hasText: AVATAR_UPLOAD_FAILED })).toBeVisible();
      expect(writes()).toBe(0);
      expect(await storedHash()).toBe(current.hash);
      await remount();
      await expectPicture(control, current);
    },
  },
  {
    title: "a write that is refused after the control is gone raises one toast, because its own line has no place left",
    run: async ({ surface, client, signedInConfig, page, mount }) => {
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
      const toasts = await client.watchToastMounts(page);
      const { control, writes, storedHash, unmount, remount } = await surface.stage({ page, mount, caller, current, refuseWrite: true });
      await pick(page, control, PICKED_FILE);
      await expect(control).toHaveAttribute("aria-busy", "true");
      await unmount();
      await expect(control).toHaveCount(0);

      gate.resolve();

      await expectOneToast(page, toasts);
      expect(writes()).toBe(1);
      expect(await storedHash()).toBe(current.hash);
      await remount();
      await expectPicture(control, current);
    },
  },
  {
    title: "a dropped file that is not an image is refused on the control's own line before any upload",
    run: async (context) => {
      const enter = async (control: Locator): Promise<void> => {
        expect(await context.client.dropOn(control, { file: "notes.txt", type: "text/plain" })).toBe(true);
      };
      await expectRefusedEntry(context, enter, AVATAR_NOT_A_PICTURE);
    },
  },
  {
    title: "a picked file that is not an image is refused by the same rule, because the picker's filter is only a hint",
    run: async (context) => {
      const enter = (control: Locator): Promise<void> =>
        pick(context.page, control, { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("notes") });
      await expectRefusedEntry(context, enter, AVATAR_NOT_A_PICTURE);
    },
  },
  {
    title: "a dropped image over the size cap is refused on the control's own line before any upload",
    run: async (context) => {
      const dropped = { file: "wide.png", type: "image/png" } as const;
      const line = context.client.oversizeUploadMessage(new File([OVERSIZE_FILE.buffer], dropped.file), TINY_CAP_BYTES);
      expect(line).toBeDefined();
      const enter = async (control: Locator): Promise<void> => {
        expect(await context.client.dropOn(control, dropped)).toBe(true);
      };
      await expectRefusedEntry(context, enter, line ?? "", TINY_CAP_BYTES);
    },
  },
  {
    title: "a drop of several files is refused on the control's own line, which says one picture at a time",
    run: async (context) => {
      const files = [
        { file: "a.png", type: "image/png" },
        { file: "b.png", type: "image/png" },
      ];
      const enter = async (control: Locator): Promise<void> => {
        expect(await context.client.dropOn(control, { files })).toBe(true);
      };
      await expectRefusedEntry(context, enter, AVATAR_ONE_AT_A_TIME);
    },
  },
  {
    title: "a drag that carries no file is claimed and answered on the control's own line, which asks for a picture file",
    run: async (context) => {
      const enter = async (control: Locator): Promise<void> => {
        expect(await context.client.dropOn(control, { text: "some dragged prose" })).toBe(true);
      };
      await expectRefusedEntry(context, enter, AVATAR_DROP_A_FILE);
    },
  },
  {
    title: "a file the server refuses shows its reason as one sentence on the control's own line",
    run: async ({ surface, client, signedInConfig, page, mount }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const current = await storePicture(root);
      await routeAuthConfig(page, signedInConfig);
      await routeBlobs(page, root);
      let reason = "";
      // The picked bytes are not a PNG, so the real upload route refuses them with its own reason.
      await page.route(`**${UPLOAD_ROUTE}`, async (route) => {
        const request = route.request();
        const upload = request.postDataBuffer();
        const answer = await root.http.request(UPLOAD_ROUTE, {
          method: "POST",
          headers: { ...(await request.allHeaders()), [CSRF_HEADER]: "1" },
          body: upload === null ? null : new Uint8Array(upload),
        });
        const body = Buffer.from(await answer.arrayBuffer());
        reason = assetUploadRefusalSchema.parse(JSON.parse(body.toString("utf8"))).error;
        await route.fulfill({ status: answer.status, headers: Object.fromEntries(answer.headers), body });
      });
      const toasts = await client.watchToastMounts(page);
      const { control, writes } = await surface.stage({ page, mount, caller, current, refuseWrite: false });

      await pick(page, control, PICKED_FILE);

      await expect.poll(() => reason).not.toBe("");
      await expect(page.getByRole("alert")).toBeVisible();
      const line = (await page.getByRole("alert").locator("span").textContent()) ?? "";
      // The server's reason is a clause, so the line carries it inside one sentence rather than starting a lowercase one after a period.
      expect(line).toContain(reason);
      expect(line).not.toMatch(/\. \p{Ll}/u);
      await expect(control).toHaveAccessibleDescription(describedEndingWith(line));
      await absenceWindow(page, TOAST_WINDOW_MS);
      expect(await toasts()).toBe(0);
      expect(writes()).toBe(0);
      await expectPicture(control, current);
    },
  },
];

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const SUBPIXEL_PX = 1;
const MOST_LINES = 2;
const LAYOUT_HEIGHT_PX = 900;
const PHONE_WIDTH_PX = 390;
const DESKTOP_WIDTH_PX = 1440;
const NOT_AN_IMAGE = { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("notes") } as const;
const ERROR_GLYPH_NAME = "Error";

function boxesOf(locator: Locator): Promise<readonly Box[]> {
  return locator.evaluateAll((nodes) =>
    nodes.map((node) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
}

function expectSameBoxes(before: readonly Box[], after: readonly Box[]): void {
  expect(after).toHaveLength(before.length);
  for (const [at, box] of before.entries()) {
    const now = after[at];
    for (const edge of ["x", "y", "width", "height"] as const) {
      expect(Math.abs((now?.[edge] ?? Number.NaN) - box[edge])).toBeLessThanOrEqual(SUBPIXEL_PX);
    }
  }
}

/**
 * The failure line, at one window width: in the dropzone's refusal voice (destructive ink and its glyph), on a row that spans the
 * host's identity row, at most two lines, and no box of that row moves as the line comes and as it clears.
 */
function layoutCase(width: number): AvatarCase {
  return {
    title: `a refusal's line is in the dropzone's refusal voice on a row spanning the host, at most two lines at ${String(width)}px, and no identity box moves as it comes and goes`,
    run: async ({ surface, client, signedInConfig, page, mount }): Promise<void> => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const [current, next] = [await storePicture(root), await storePicture(root)];
      await routeAuthConfig(page, signedInConfig);
      await routeBlobs(page, root);
      await routeUploads(page, () => served(next));
      await page.setViewportSize({ width, height: LAYOUT_HEIGHT_PX });
      const { control, identity } = await surface.stage({ page, mount, caller, current, refuseWrite: false, width });
      await expectPicture(control, current);
      const before = await boxesOf(identity.locator("*"));
      const host = await identity.boundingBox();
      expect(host).not.toBeNull();

      await pick(page, control, NOT_AN_IMAGE);

      const line = page.locator('[data-slot="file-dropzone-error"]');
      await expect(line).toHaveText(AVATAR_NOT_A_PICTURE);
      await expect(line.getByRole("img", { name: ERROR_GLYPH_NAME })).toBeVisible();
      const shown = await client.readRefusalLine(line);
      expect(shown.ink).toBe(shown.destructiveInk);
      expect(shown.lines).toBeLessThanOrEqual(MOST_LINES);
      expect(Math.abs(shown.left - (host?.x ?? Number.NaN))).toBeLessThanOrEqual(SUBPIXEL_PX);
      expect(shown.width).toBeGreaterThanOrEqual((host?.width ?? Number.NaN) - SUBPIXEL_PX);
      expectSameBoxes(before, await boxesOf(identity.locator("*")));

      await pick(page, control, PICKED_FILE);

      await expectPicture(control, next);
      await expect(line).toHaveCount(0);
      expectSameBoxes(before, await boxesOf(identity.locator("*")));
    },
  };
}

/** The refusal-line geometry on a phone and on a desktop window. */
export const AVATAR_LAYOUT_CASES: readonly AvatarCase[] = [layoutCase(PHONE_WIDTH_PX), layoutCase(DESKTOP_WIDTH_PX)];

const DRAG_IMAGE = { file: "held.png", type: "image/png" } as const;

/** The affordance cases for a pointer that hovers. */
export const AVATAR_AFFORDANCE_CASES: readonly AvatarCase[] = [
  {
    title: "the replace mark is hidden at rest, shown by hover and by focus, and the control keeps the one name",
    run: async ({ surface, signedInConfig, page, mount }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const current = await storePicture(root);
      await routeAuthConfig(page, signedInConfig);
      await routeBlobs(page, root);
      const { control } = await surface.stage({ page, mount, caller, current, refuseWrite: false });
      await expectPicture(control, current);
      const mark = control.locator('[data-slot="picture-cue-mark"]');
      await expect(control.getByRole("img", { name: /replace|drop|upload/iu })).toHaveCount(0);
      await expect(page.getByRole("button", { name: surface.controlName, exact: true })).toHaveCount(1);
      await expect(control).toHaveAccessibleName(surface.controlName);

      await page.mouse.move(0, 0);
      await expect(mark).toHaveCSS("opacity", "0");
      await control.hover();
      await expect(mark).toHaveCSS("opacity", "1");
      await page.mouse.move(0, 0);
      await expect(mark).toHaveCSS("opacity", "0");
      await control.focus();
      await expect(mark).toHaveCSS("opacity", "1");
    },
  },
  {
    title: "a file held over the picture shows a drop layer that the focus ring never draws, and the layer clears when it leaves",
    run: async ({ surface, client, signedInConfig, page, mount }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const current = await storePicture(root);
      await routeAuthConfig(page, signedInConfig);
      await routeBlobs(page, root);
      const { control } = await surface.stage({ page, mount, caller, current, refuseWrite: false });
      await expectPicture(control, current);
      const drop = control.locator('[data-slot="picture-cue-drop"]');
      await expect(drop).toHaveCSS("opacity", "0");

      const leave = await client.dragFileOver(control, DRAG_IMAGE);

      await expect(drop).toHaveCSS("opacity", "1");
      await expect(drop).toHaveCSS("border-top-style", "dashed");
      // The ring a focused control wears is a shadow; held over, with no focus, the control draws none.
      await expect(control).toHaveCSS("box-shadow", "none");

      await leave();
      await expect(drop).toHaveCSS("opacity", "0");
      await page.keyboard.press("Shift");
      await control.focus();
      await expect(control).not.toHaveCSS("box-shadow", "none");
      await expect(drop).toHaveCSS("opacity", "0");
    },
  },
];

/** The affordance case for a pointer that cannot hover: the mark is there at rest, because a touch reader has no hover to find it by. */
export const AVATAR_TOUCH_CASES: readonly AvatarCase[] = [
  {
    title: "the replace mark shows at rest where the pointer cannot hover",
    run: async ({ surface, client, signedInConfig, page, mount }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      const current = await storePicture(root);
      await routeAuthConfig(page, signedInConfig);
      await routeBlobs(page, root);
      const { control } = await surface.stage({ page, mount, caller, current, refuseWrite: false });
      await expectPicture(control, current);
      // The positive control: this page really is one that cannot hover.
      expect(await client.pageCanHover(page)).toBe(false);
      await expect(control.locator('[data-slot="picture-cue-mark"]')).toHaveCSS("opacity", "1");
    },
  },
];

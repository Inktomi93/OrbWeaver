// A chat file the library already holds says so by the room's current title and adds nothing, instead of reporting an import. The
// room is the owner's own, exported and dropped back on the chats band's import dialog; the file goes to a real server's chat import
// route, so the answer is the one the server gives a room it already holds (D290). Only the transport between them is the test's.
// @subject packages/client/src/features/chat/components/chat-import-dialog.tsx

import { createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { chatImportResultSchema, clipImportText, IMPORT_PREVIEW_TEXT_MAX } from "@orb/contracts/import";
import type { PortableFile } from "@orb/contracts/portability";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { UPLOAD_FILE_FIELD } from "@orb/contracts/uploads";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { noticeToast, routeAuthConfig, routeToServer, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHAT_IMPORT_NAME, CHAT_IMPORT_TITLE } from "#client/features/chat/lib/chat-surface-names.ts";
import { chatInLibraryNotice, importedOfLead } from "#client/lib/in-library-copy.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const FILE_INPUT = 'input[type="file"]';
const REFUSED_FILE = "broken.jsonl";
const ROOM_TITLE = "Harbor watch";
const HTTP_OK = 200;

test.use({ viewport: { width: 1440, height: 1000 } });

type Root = ServerTestHarness;
type Principal = Awaited<ReturnType<Root["principalFor"]>>;
type ChatId = Parameters<Root["services"]["chat"]["updateTitle"]>[0]["chatId"];

/** The owner's own room under `title`, and its export. */
async function ownRoom(root: Root, title: string): Promise<{ readonly principal: Principal; readonly chatId: ChatId; readonly file: PortableFile }> {
  const principal = await root.principalFor(root.ownerId);
  const character = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "harbor-keeper", name: "Harbor Keeper", description: "Keeps the light." }),
  });
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [character.id], opening: "none" });
  await root.services.chat.updateTitle({ principal, chatId: chat.id, title });
  const file = await root.app.exportService.exportChatBundle({ principal, chatId: chat.id });
  if (file === null) {
    throw new Error("the owner's own room did not export");
  }
  return { principal, chatId: chat.id, file };
}

interface ChatImportDialog {
  readonly sent: () => number;
  readonly drop: (files: readonly PortableFile[]) => Promise<void>;
}

/** Mounts the chats band and opens its import dialog; the chat import route goes to `root`. */
async function openChatImport(args: {
  readonly page: Page;
  readonly root: Root;
  readonly signedInConfig: Parameters<typeof routeAuthConfig>[1];
  readonly mountShell: () => Promise<unknown>;
}): Promise<ChatImportDialog> {
  const { page, root } = args;
  await routeAuthConfig(page, args.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]));
  const sent = await routeToServer(page, root, PORTABILITY_ROUTES.importChat);
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "collapsed" } } });
  await args.mountShell();
  await page.getByRole("button", { name: CHAT_IMPORT_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: CHAT_IMPORT_TITLE, exact: true });
  return {
    sent,
    drop: async (files): Promise<void> => {
      const chooser = page.waitForEvent("filechooser");
      await dialog.locator(FILE_INPUT).click();
      await (await chooser).setFiles(files.map((file) => ({ name: file.filename, mimeType: "application/json", buffer: Buffer.from(file.bytes) })));
    },
  };
}

test("a room's own unchanged export dropped back on the chat import says it is already in the library, by the room's title", async ({
  corpus,
  mount,
  page,
}) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const { file } = await ownRoom(root, ROOM_TITLE);
  const dialog = await openChatImport({ page, root, signedInConfig: corpus.auth.signedInConfig, mountShell: () => mount<typeof ShellAmbientStory>(STORY, {}) });

  await dialog.drop([file]);

  await expect(noticeToast(page, { title: chatInLibraryNotice(ROOM_TITLE) })).toHaveCount(1);
  expect(dialog.sent()).toBe(1);
});

test("a held room renamed since it was imported is named by its new title when the same file is dropped again", async ({ corpus, mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const { principal, chatId, file } = await ownRoom(root, ROOM_TITLE);
  // The source room changes, so the file lands as a room of its own with the file's key; that room is the held one.
  await root.services.chat.updateTitle({ principal, chatId, title: "Changed since the export" });
  const form = new FormData();
  form.append(UPLOAD_FILE_FIELD, new File([Buffer.from(file.bytes)], file.filename));
  const response = await root.http.request(PORTABILITY_ROUTES.importChat, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body: form });
  expect(response.status).toBe(HTTP_OK);
  expect(chatImportResultSchema.parse(await response.json()).imported).toMatchObject([{ created: true, title: ROOM_TITLE }]);
  const landed = (await root.services.chat.listChats({ principal })).items.find((item) => item.id !== chatId);
  if (landed === undefined) {
    throw new Error("the import landed no room beside the source room");
  }
  await root.services.chat.updateTitle({ principal, chatId: landed.id, title: "Lantern watch" });
  const dialog = await openChatImport({ page, root, signedInConfig: corpus.auth.signedInConfig, mountShell: () => mount<typeof ShellAmbientStory>(STORY, {}) });

  await dialog.drop([file]);

  await expect(noticeToast(page, { title: chatInLibraryNotice("Lantern watch") })).toHaveCount(1);
  expect(dialog.sent()).toBe(1);
});

test("a held room's over-long, markup-bearing title arrives clipped and renders as text", async ({ corpus, mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const hostile = `<b>Harbor</b> ${"x".repeat(IMPORT_PREVIEW_TEXT_MAX)}`;
  const { file } = await ownRoom(root, hostile);
  const dialog = await openChatImport({ page, root, signedInConfig: corpus.auth.signedInConfig, mountShell: () => mount<typeof ShellAmbientStory>(STORY, {}) });

  await dialog.drop([file]);

  const clipped = clipImportText(hostile);
  expect(clipped.length).toBeLessThan(hostile.length);
  const notice = noticeToast(page, { title: chatInLibraryNotice(clipped) });
  await expect(notice).toHaveCount(1);
  await expect(notice.locator("b")).toHaveCount(0);
});

test("a batch of a held room and a refused file counts the held room as held, not imported", async ({ corpus, mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const { file } = await ownRoom(root, ROOM_TITLE);
  const dialog = await openChatImport({ page, root, signedInConfig: corpus.auth.signedInConfig, mountShell: () => mount<typeof ShellAmbientStory>(STORY, {}) });

  await dialog.drop([file, { filename: REFUSED_FILE, bytes: new TextEncoder().encode("not a transcript") }]);

  // One file is held and one refused: nothing wrote a row, so no file counts as imported. The line ends in the server's reason.
  const lead = new RegExp(`^${RegExp.escape(importedOfLead(0, 1, 2))}: ${RegExp.escape(REFUSED_FILE)}: `, "u");
  await expect(page.locator('[data-slot="toast-title"]').filter({ hasText: lead })).toHaveCount(1);
  expect(dialog.sent()).toBe(1);
});

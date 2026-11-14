// A chat file the library already holds says so by its file name and adds nothing, instead of reporting an import. The room is the
// owner's own, exported unchanged and dropped back on the chats band's import dialog; the file goes to a real server's chat import
// route, so the answer is the one the server gives a room it already holds (D290). Only the transport between them is the test's.
// @subject packages/client/src/features/chat/components/chat-import-dialog.tsx
import { createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { noticeToast, routeAuthConfig, routeToServer, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { CHAT_IMPORT_NAME, CHAT_IMPORT_TITLE } from "#client/features/chat/lib/chat-surface-names.ts";
import { chatInLibraryNotice } from "#client/lib/in-library-copy.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const FILE_INPUT = 'input[type="file"]';

test.use({ viewport: { width: 1440, height: 1000 } });

test("a room's own unchanged export dropped back on the chat import says it is already in the library, by its file name", async ({ corpus, mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const principal = await root.principalFor(root.ownerId);
  const character = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "harbor-keeper", name: "Harbor Keeper", description: "Keeps the light." }),
  });
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [character.id], opening: "none" });
  const file = await root.app.exportService.exportChatBundle({ principal, chatId: chat.id });
  if (file === null) {
    throw new Error("the owner's own room did not export");
  }
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]));
  const sent = await routeToServer(page, root, PORTABILITY_ROUTES.importChat);
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "collapsed" } } });
  await mount<typeof ShellAmbientStory>(STORY, {});

  await page.getByRole("button", { name: CHAT_IMPORT_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: CHAT_IMPORT_TITLE, exact: true });
  const chooser = page.waitForEvent("filechooser");
  await dialog.locator(FILE_INPUT).click();
  await (await chooser).setFiles([{ name: file.filename, mimeType: "application/json", buffer: Buffer.from(file.bytes) }]);

  await expect(noticeToast(page, { title: chatInLibraryNotice(file.filename) })).toHaveCount(1);
  expect(sent()).toBe(1);
});

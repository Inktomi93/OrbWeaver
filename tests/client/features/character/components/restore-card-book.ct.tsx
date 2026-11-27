// Restoring a card's embedded world book from its own file says how many entries the restored book holds and opens that book. The
// character is imported through a real server's card import route, and the restore POST goes to the real restore route, so the
// count is the one the server wrote. Only the transport between the page and the server is the test's.
// @subject packages/client/src/features/character/components/character-restore-book-action.tsx

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { cardImportResultSchema } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { UPLOAD_FILE_FIELD } from "@orb/contracts/uploads";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { noticeToast, routeAuthConfig, routeToServer, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import {
  CHARACTER_FACET_LABELS,
  CHARACTER_OPEN_RESTORED_BOOK_NAME,
  CHARACTER_RESTORE_BOOK_NAME,
  characterBookRestoredEntries,
  characterBookRestoredTitle,
} from "#client/features/character/lib/character-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const HTTP_OK = 200;
const CARD_NAME = "Lamp Keeper";
const BOOK_NAME = "Lamp Archive";
const BOOK_ENTRIES = 2;
const CARD = Buffer.from(
  JSON.stringify({
    spec: "chara_card_v3",
    ["spec_version"]: "3.0",
    data: {
      name: CARD_NAME,
      description: "Keeps the lamp.",
      ["first_mes"]: "The lamp is lit.",
      ["character_book"]: {
        name: BOOK_NAME,
        entries: [
          { keys: ["lantern"], content: "A brass lantern.", comment: "Lantern", constant: true, ["insertion_order"]: 10 },
          { keys: ["harbor"], content: "A grey harbor.", comment: "Harbor", constant: true, ["insertion_order"]: 20 },
        ],
      },
    },
  }),
);

test.use({ viewport: { width: 1440, height: 1000 } });

test("restoring a card's book from its own file names how many entries it holds and opens the restored book", async ({ corpus, mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const form = new FormData();
  form.append(UPLOAD_FILE_FIELD, new File([new Uint8Array(CARD)], "lamp-keeper.json"));
  const imported = await root.http.request(PORTABILITY_ROUTES.importCards, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body: form });
  expect(imported.status).toBe(HTTP_OK);
  expect(cardImportResultSchema.parse(await imported.json()).imported).toHaveLength(1);

  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(
    page,
    serveCorpusProcedures(await root.internalCallerFor(root.ownerId), [
      ...SECTION_PROCEDURES,
      ...SHELL_MOUNT_PROCEDURES,
      "worldInfo.getBook",
      "worldInfo.listEntries",
      "worldInfo.listBooksWithUsage",
      "worldInfo.listAttachmentsForBook",
    ]),
  );
  const restore = await routeToServer(page, root, PORTABILITY_ROUTES.restoreCardLorebook);
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
  await mount<typeof ShellAmbientStory>(STORY, {});

  await page.getByText(CARD_NAME, { exact: true }).first().click();
  await page.getByRole("button", { name: CHARACTER_FACET_LABELS.provenance }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: CHARACTER_RESTORE_BOOK_NAME, exact: true }).click();
  await (await chooser).setFiles([{ name: "lamp-keeper.json", mimeType: "application/json", buffer: CARD }]);
  const answered = restore.answered(WORKLOAD_DEADLINE_MS);
  await page.getByRole("alertdialog").getByRole("button", { name: DIALOG_VERBS.restore, exact: true }).click();
  await answered;

  const toast = noticeToast(page, { title: characterBookRestoredTitle(true), description: characterBookRestoredEntries(BOOK_ENTRIES) });
  await expect(toast).toHaveCount(1);
  expect(restore.sent()).toBe(1);

  await toast.getByRole("button", { name: CHARACTER_OPEN_RESTORED_BOOK_NAME, exact: true }).click();
  await expect(page.getByText(BOOK_NAME).first()).toBeVisible();
});

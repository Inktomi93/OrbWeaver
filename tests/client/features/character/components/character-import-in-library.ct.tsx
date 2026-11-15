// A card the library already holds says so by the character's current name and adds nothing, instead of reporting an import. The
// card is the owner's own, exported and dropped back on the characters band's import dialog; the file goes to a real server's card
// import route, so the answer is the one the server gives a card it already holds (D290). Only the transport between them is the test's.
// @subject packages/client/src/features/character/components/character-import-dialog.tsx

import { createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { CARD_REFUSAL_CODES, cardImportResultSchema } from "@orb/contracts/import";
import { exportCharacterPath, PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { UPLOAD_FILE_FIELD } from "@orb/contracts/uploads";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { noticeToast, routeAuthConfig, routeToServer, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHARACTER_IMPORT_NAME } from "#client/features/character/lib/character-names.ts";
import { cardImportPartialLine } from "#client/lib/card-import-copy.ts";
import { cardInLibraryNotice } from "#client/lib/in-library-copy.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const FILE_INPUT = 'input[type="file"]';
const CARD_FILE = "harbor-keeper.png";
const CARD_NAME = "Harbor Keeper";
const REFUSED_FILE = "broken.png";
const HTTP_OK = 200;

test.use({ viewport: { width: 1440, height: 1000 } });

type Root = ServerTestHarness;
type Principal = Awaited<ReturnType<Root["principalFor"]>>;
type CharacterId = Parameters<Root["services"]["character"]["update"]>[0]["characterId"];

interface DroppedFile {
  readonly name: string;
  readonly buffer: Buffer;
}

/** The owner's own character and its card export. */
async function ownCard(root: Root): Promise<{ readonly principal: Principal; readonly characterId: CharacterId; readonly bytes: Buffer }> {
  const principal = await root.principalFor(root.ownerId);
  const character = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "harbor-keeper", name: CARD_NAME, description: "Keeps the light." }),
  });
  const card = await root.http.request(exportCharacterPath(character.id));
  expect(card.status).toBe(HTTP_OK);
  return { principal, characterId: character.id, bytes: Buffer.from(await card.arrayBuffer()) };
}

interface CardImportDialog {
  readonly sent: () => number;
  readonly drop: (files: readonly DroppedFile[]) => Promise<void>;
}

/** Mounts the characters band and opens its import dialog; the card import route goes to `root`. */
async function openCardImport(args: {
  readonly page: Page;
  readonly root: Root;
  readonly signedInConfig: Parameters<typeof routeAuthConfig>[1];
  readonly mountShell: () => Promise<unknown>;
}): Promise<CardImportDialog> {
  const { page, root } = args;
  await routeAuthConfig(page, args.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]));
  const route = await routeToServer(page, root, PORTABILITY_ROUTES.importCards);
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
  await args.mountShell();
  await page.getByRole("button", { name: CHARACTER_IMPORT_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: CHARACTER_IMPORT_NAME, exact: true });
  return {
    sent: route.sent,
    // Resolves once the server has answered the drop, so the toast is asserted from that answer and not from the drop.
    drop: async (files): Promise<void> => {
      const chooser = page.waitForEvent("filechooser");
      await dialog.locator(FILE_INPUT).click();
      const answered = route.answered(WORKLOAD_DEADLINE_MS);
      await (await chooser).setFiles(files.map((file) => ({ ...file, mimeType: "image/png" })));
      await answered;
    },
  };
}

test("a card's own unchanged export dropped back on the card import says it is already in the library, by the character's name", async ({
  corpus,
  mount,
  page,
}) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const { bytes } = await ownCard(root);
  const dialog = await openCardImport({ page, root, signedInConfig: corpus.auth.signedInConfig, mountShell: () => mount<typeof ShellAmbientStory>(STORY, {}) });

  await dialog.drop([{ name: CARD_FILE, buffer: bytes }]);

  await expect(noticeToast(page, { title: cardInLibraryNotice(CARD_NAME) })).toHaveCount(1);
  expect(dialog.sent()).toBe(1);
});

test("a held card renamed since it was imported is named by its new name when the same file is dropped again", async ({ corpus, mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const { principal, characterId, bytes } = await ownCard(root);
  // The source card changes, so the file lands as a character of its own with the file's key; that character is the held one.
  await root.services.character.update({ principal, characterId, input: { description: "Changed since the export." }, signal: new AbortController().signal });
  const form = new FormData();
  form.append(UPLOAD_FILE_FIELD, new File([new Uint8Array(bytes)], CARD_FILE));
  const response = await root.http.request(PORTABILITY_ROUTES.importCards, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body: form });
  expect(response.status).toBe(HTTP_OK);
  const [landed] = cardImportResultSchema.parse(await response.json()).imported;
  if (landed?.created !== true) {
    throw new Error("the export did not land as a character of its own");
  }
  await root.services.character.update({ principal, characterId: landed.characterId, input: { name: "Lantern Keeper" }, signal: new AbortController().signal });
  const dialog = await openCardImport({ page, root, signedInConfig: corpus.auth.signedInConfig, mountShell: () => mount<typeof ShellAmbientStory>(STORY, {}) });

  await dialog.drop([{ name: CARD_FILE, buffer: bytes }]);

  await expect(noticeToast(page, { title: cardInLibraryNotice("Lantern Keeper") })).toHaveCount(1);
  expect(dialog.sent()).toBe(1);
});

test("a batch of a held card and a refused file counts the held card as held, not imported", async ({ corpus, mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const { bytes } = await ownCard(root);
  const dialog = await openCardImport({ page, root, signedInConfig: corpus.auth.signedInConfig, mountShell: () => mount<typeof ShellAmbientStory>(STORY, {}) });

  await dialog.drop([
    { name: CARD_FILE, buffer: bytes },
    { name: REFUSED_FILE, buffer: Buffer.from("not a card") },
  ]);

  const [unreadable] = CARD_REFUSAL_CODES;
  // One file is held and one refused: nothing wrote a row, so no file counts as imported.
  const line = cardImportPartialLine(0, 1, [{ filename: REFUSED_FILE, reason: unreadable }]);
  await expect(noticeToast(page, { title: line })).toHaveCount(1);
  expect(dialog.sent()).toBe(1);
});

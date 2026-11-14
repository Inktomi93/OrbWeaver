// A card the library already holds says so by its file name and adds nothing, instead of reporting an import. The card is the
// owner's own, exported unchanged and dropped back on the characters band's import dialog; the file goes to a real server's card
// import route, so the answer is the one the server gives a card it already holds (D290). Only the transport between them is the test's.
// @subject packages/client/src/features/character/components/character-import-dialog.tsx
import { createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { exportCharacterPath, PORTABILITY_ROUTES } from "@orb/contracts/portability";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { noticeToast, routeAuthConfig, routeToServer, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { CHARACTER_IMPORT_NAME } from "#client/features/character/lib/character-names.ts";
import { cardInLibraryNotice } from "#client/lib/in-library-copy.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const FILE_INPUT = 'input[type="file"]';
const CARD_FILE = "harbor-keeper.png";
const HTTP_OK = 200;

test.use({ viewport: { width: 1440, height: 1000 } });

test("a card's own unchanged export dropped back on the card import says it is already in the library, by its file name", async ({ corpus, mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const principal = await root.principalFor(root.ownerId);
  const character = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "harbor-keeper", name: "Harbor Keeper", description: "Keeps the light." }),
  });
  const card = await root.http.request(exportCharacterPath(character.id));
  expect(card.status).toBe(HTTP_OK);
  const bytes = Buffer.from(await card.arrayBuffer());
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]));
  const sent = await routeToServer(page, root, PORTABILITY_ROUTES.importCards);
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
  await mount<typeof ShellAmbientStory>(STORY, {});

  await page.getByRole("button", { name: CHARACTER_IMPORT_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: CHARACTER_IMPORT_NAME, exact: true });
  const chooser = page.waitForEvent("filechooser");
  await dialog.locator(FILE_INPUT).click();
  await (await chooser).setFiles([{ name: CARD_FILE, mimeType: "image/png", buffer: bytes }]);

  await expect(noticeToast(page, { title: cardInLibraryNotice(CARD_FILE) })).toHaveCount(1);
  expect(sent()).toBe(1);
});

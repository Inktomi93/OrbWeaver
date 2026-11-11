// A character deleted from its row's actions by keyboard hands focus to the row beside it, open or not, and never leaves it on the
// page body: the row and its confirm unmount together, so Base UI has nothing to return focus to. The shell, the library list and
// the rows are the production ones over a first-boot root; the characters are made through the production create verb.
// @subject packages/client/src/features/character/surfaces/character-library-surface.tsx
import { rowActionSubject, rowActionsName } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createFirstBootHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHARACTER_ACTIONS } from "#client/features/character/lib/character-actions.ts";
import { CHARACTER_LIBRARY_NAME } from "#client/features/character/lib/character-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const NAMES = ["Anselm of the Vale", "Branwen the Quiet", "Corvin Ashdown"] as const;
const ACTIONS_BUTTON = /^Actions for /u;

type Root = Awaited<ReturnType<typeof createFirstBootHarness>>;

/** Seeds the characters through the production verb and routes the shell's reads and the delete to the same root. */
async function prepareLibrary(page: Page, root: Root): Promise<TrpcRecorder> {
  const caller = await root.internalCallerFor(root.ownerId);
  for (const name of NAMES) {
    await caller.character.create({
      input: createCharacterSchema.parse({ handle: name.toLowerCase().replaceAll(" ", "-"), name, description: "A neighbour in the list." }),
    });
  }
  const rpc = await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, "character.remove"]));
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
  return rpc;
}

/** The library list once every seeded row is on the page. */
async function libraryOf(page: Page): Promise<Locator> {
  const library = page.getByRole("list", { name: CHARACTER_LIBRARY_NAME, exact: true });
  await expect(library.getByRole("button", { name: ACTIONS_BUTTON })).toHaveCount(NAMES.length);
  return library;
}

/** The subjects the rows' actions buttons carry, in the order the list shows them. */
function rowSubjects(library: Locator): Promise<readonly string[]> {
  return library.getByRole("button", { name: ACTIONS_BUTTON }).evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label") ?? ""));
}

function rowBody(library: Locator, name: string): Locator {
  return library.getByRole("button", { name: new RegExp(`^${RegExp.escape(name)}`, "u") }).first();
}

/** Deletes through the row's actions menu and its confirm with the keyboard alone. */
async function deleteByKeyboard(page: Page, library: Locator, subject: string): Promise<void> {
  const actions = library.getByRole("button", { name: rowActionsName(subject), exact: true });
  await actions.focus();
  await page.keyboard.press("Enter");
  const remove = page.getByRole("menuitem", { name: CHARACTER_ACTIONS.delete.label, exact: true });
  await remove.focus();
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("alertdialog").getByRole("button", { name: CHARACTER_ACTIONS.delete.label, exact: true });
  await confirm.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
}

test.use({ viewport: { width: 1440, height: 1000 } });

for (const open of [false, true]) {
  test(`deleting ${open ? "the open character" : "a listed character"} by keyboard moves focus to the next row`, async ({ page, corpus, mount }) => {
    await using root = await createFirstBootHarness();
    await routeAuthConfig(page, corpus.auth.signedInConfig);
    const rpc = await prepareLibrary(page, root);
    await mount<typeof ShellAmbientStory>(STORY, {});
    const library = await libraryOf(page);

    const subjects = await rowSubjects(library);
    const doomed = subjects[1]?.replace(ACTIONS_BUTTON, "");
    const neighbour = subjects[2]?.replace(ACTIONS_BUTTON, "");
    if (doomed === undefined || neighbour === undefined) {
      throw new Error("The library shows fewer rows than the case seeded");
    }
    if (open) {
      await rowBody(library, doomed).focus();
      await page.keyboard.press("Enter");
    }

    await deleteByKeyboard(page, library, rowActionSubject(doomed, undefined));

    // The server's bus is what removes the row from the list, and this mount has no socket: the hand-off at the confirm's close is what is under test.
    await expect.poll(() => rpc.count("character.remove")).toBe(1);
    await expect(rowBody(library, neighbour)).toBeFocused();
  });
}

test("deleting the last listed character by keyboard moves focus to the row before it", async ({ page, corpus, mount }) => {
  await using root = await createFirstBootHarness();
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  const rpc = await prepareLibrary(page, root);
  await mount<typeof ShellAmbientStory>(STORY, {});
  const library = await libraryOf(page);

  const subjects = await rowSubjects(library);
  const last = subjects.at(-1)?.replace(ACTIONS_BUTTON, "");
  const before = subjects.at(-2)?.replace(ACTIONS_BUTTON, "");
  if (last === undefined || before === undefined) {
    throw new Error("The library shows fewer rows than the case seeded");
  }

  await deleteByKeyboard(page, library, rowActionSubject(last, undefined));

  await expect.poll(() => rpc.count("character.remove")).toBe(1);
  await expect(rowBody(library, before)).toBeFocused();
});

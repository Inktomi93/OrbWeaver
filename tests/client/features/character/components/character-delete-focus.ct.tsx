// A character deleted from its row's actions by keyboard hands focus to the row beside it, open or not, and focus is still there once the
// row has left the list and the open character's editor has gone: the row and its confirm unmount together, so Base UI has nothing to
// return focus to, and an editor whose read lands after the confirm must not take the focus the delete just placed. The shell, the
// library list and the rows are the production ones over a first-boot root; the characters are made through the production create verb,
// and the real server's own `charactersChanged` event is what removes the row.
// @subject packages/client/src/features/character/surfaces/character-library-surface.tsx
import { rowActionSubject, rowActionsName } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import type { ShellBusStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import type { ServedHold } from "@orb/testkit/ct";
import {
  absenceWindow,
  holdServed,
  routeAuthConfig,
  routeTrpc,
  SECTION_PROCEDURES,
  SHELL_MOUNT_PROCEDURES,
  serveCorpusProcedures,
  trpcError,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { nameShape } from "@orb/testkit/iso";
import { createFirstBootHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHARACTER_ACTIONS } from "#client/features/character/lib/character-actions.ts";
import { CHARACTER_EDITOR_NAME, CHARACTER_LIBRARY_NAME } from "#client/features/character/lib/character-names.ts";
import { forwardUserEvent } from "../../../components/_forward-user-event.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellBusStory";
const NAMES = ["Anselm of the Vale", "Branwen the Quiet", "Corvin Ashdown"] as const;
const ACTIONS_BUTTON = nameShape(rowActionsName);
// What a row's actions name says before its subject.
const ACTIONS_LEAD = rowActionsName("");

type Root = Awaited<ReturnType<typeof createFirstBootHarness>>;

interface Holds {
  /** The open character's read, when the case needs it in flight past the confirm. */
  readonly read?: ServedHold;
  /** The delete itself, when the case needs the confirm answered after the read. */
  readonly remove?: ServedHold;
}

/**
 * Seeds the characters through the production verb, serves the shell's reads and the delete from the same root, and forwards the
 * real server's `charactersChanged` event to the page, which is what removes the deleted row from the list.
 */
async function prepareLibrary(page: Page, root: Root, holds: Holds, cleanup: AsyncDisposableStack): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  for (const name of NAMES) {
    await caller.character.create({
      input: createCharacterSchema.parse({ handle: name.toLowerCase().replaceAll(" ", "-"), name, description: "A neighbour in the list." }),
    });
  }
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]),
    ...serveCorpusProcedures(caller, ["character.get"], () => holds.read),
    ...serveCorpusProcedures(caller, ["character.remove"], () => holds.remove),
    "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await forwardUserEvent(page, root, "charactersChanged", cleanup);
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
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

function rowActions(library: Locator, name: string): Locator {
  return library.getByRole("button", { name: rowActionsName(rowActionSubject(name, undefined)), exact: true });
}

/** Deletes through the row's actions menu and its confirm with the keyboard alone. */
async function deleteByKeyboard(page: Page, library: Locator, name: string): Promise<void> {
  await rowActions(library, name).focus();
  await page.keyboard.press("Enter");
  const remove = page.getByRole("menuitem", { name: CHARACTER_ACTIONS.delete.label, exact: true });
  await remove.focus();
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("alertdialog").getByRole("button", { name: CHARACTER_ACTIONS.delete.label, exact: true });
  await confirm.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
}

/** The doomed row and the one beside it, read from what the list shows. */
async function middleAndNext(library: Locator): Promise<{ readonly doomed: string; readonly neighbour: string }> {
  const subjects = await rowSubjects(library);
  const doomed = subjects[1]?.slice(ACTIONS_LEAD.length);
  const neighbour = subjects[2]?.slice(ACTIONS_LEAD.length);
  if (doomed === undefined || neighbour === undefined) {
    throw new Error("The library shows fewer rows than the case seeded");
  }
  return { doomed, neighbour };
}

test.use({ viewport: { width: 1440, height: 1000 } });

test("deleting a listed character by keyboard moves focus to the next row once the row has left the list", async ({ page, corpus, mount }) => {
  await using root = await createFirstBootHarness();
  await using cleanup = new AsyncDisposableStack();
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await prepareLibrary(page, root, {}, cleanup);
  await mount<typeof ShellBusStory>(STORY, {});
  const library = await libraryOf(page);
  const { doomed, neighbour } = await middleAndNext(library);

  await deleteByKeyboard(page, library, doomed);

  await expect(rowActions(library, doomed)).toHaveCount(0);
  await expect(rowBody(library, neighbour)).toBeFocused();
});

test("deleting the open character after its editor has loaded leaves focus on the next row once the editor has gone", async ({ page, corpus, mount }) => {
  await using root = await createFirstBootHarness();
  await using cleanup = new AsyncDisposableStack();
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await prepareLibrary(page, root, {}, cleanup);
  await mount<typeof ShellBusStory>(STORY, {});
  const library = await libraryOf(page);
  const { doomed, neighbour } = await middleAndNext(library);
  const editor = page.getByRole("form", { name: CHARACTER_EDITOR_NAME, exact: true });
  await rowBody(library, doomed).focus();
  await page.keyboard.press("Enter");
  await expect(editor).toBeVisible();

  await deleteByKeyboard(page, library, doomed);

  await expect(rowActions(library, doomed)).toHaveCount(0);
  await expect(editor).toHaveCount(0);
  await expect(rowBody(library, neighbour)).toBeFocused();
});

test("deleting the open character before its editor has loaded leaves focus on the next row when the read lands and once the editor has gone", async ({
  page,
  corpus,
  mount,
}) => {
  await using root = await createFirstBootHarness();
  await using cleanup = new AsyncDisposableStack();
  const holds = { read: holdServed(), remove: holdServed() } satisfies Holds;
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await prepareLibrary(page, root, holds, cleanup);
  await mount<typeof ShellBusStory>(STORY, {});
  const library = await libraryOf(page);
  const { doomed, neighbour } = await middleAndNext(library);
  const editor = page.getByRole("form", { name: CHARACTER_EDITOR_NAME, exact: true });
  await rowBody(library, doomed).focus();
  await page.keyboard.press("Enter");
  await holds.read.requested;

  await deleteByKeyboard(page, library, doomed);
  await holds.remove.requested;
  holds.read.release();
  await expect(editor).toBeVisible();
  // The editor's arrival runs in an effect after it shows, so a stolen focus is only seen once that window has passed.
  await absenceWindow(page, 300);
  await expect(rowBody(library, neighbour)).toBeFocused();
  holds.remove.release();

  await expect(rowActions(library, doomed)).toHaveCount(0);
  await expect(editor).toHaveCount(0);
  await expect(rowBody(library, neighbour)).toBeFocused();
});

test("deleting the last listed character by keyboard moves focus to the row before it once the row has left the list", async ({ page, corpus, mount }) => {
  await using root = await createFirstBootHarness();
  await using cleanup = new AsyncDisposableStack();
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await prepareLibrary(page, root, {}, cleanup);
  await mount<typeof ShellBusStory>(STORY, {});
  const library = await libraryOf(page);

  const subjects = await rowSubjects(library);
  const last = subjects.at(-1)?.slice(ACTIONS_LEAD.length);
  const before = subjects.at(-2)?.slice(ACTIONS_LEAD.length);
  if (last === undefined || before === undefined) {
    throw new Error("The library shows fewer rows than the case seeded");
  }

  await deleteByKeyboard(page, library, last);

  await expect(rowActions(library, last)).toHaveCount(0);
  await expect(rowBody(library, before)).toBeFocused();
});

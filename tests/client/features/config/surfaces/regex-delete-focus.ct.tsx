// A regex script deleted from its row's actions by keyboard hands focus to the row beside it, never the page body, once the row has left
// the list: the row and its confirm unmount together, so Base UI has nothing to return focus to. That holds when the delete takes the
// library across the size where the list stops being virtualized, because the rows then mount again in a new container, and when the
// delete leaves a filter of a large library with no row. The settings list and its content are the production ones over a corpus root,
// whose own scripts sit beside the ones made here through the production create verb, and the real server's own `regexChanged` event is
// what removes the row.
// @subject packages/client/src/features/regex/components/regex-collection-rows.tsx
import { COLLECTION_LARGE_GROUP, ROW_DELETE_NAME } from "@orb/client/lib";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { routeTrpc, serveCorpusProcedures, trpcError, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { collectionFilterName } from "#client/features/config/lib/config-control-names.ts";
import { REGEX_GROUP_LABEL } from "#client/features/regex/lib/regex-names.ts";
import { forwardUserEvent } from "../../../components/_forward-user-event.ts";
import type { ConfigPanesBusStory } from "./_list-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_list-stories/ConfigPanesBusStory";
const SCRIPTS = ["Alpha script", "Bravo script", "Charlie script"] as const;
const ROW = '[data-slot="list-row-root"]';
const ROW_BODY = '[data-slot="list-row-body"]';
const LANDING = '[data-slot="config-collection-landing"]';

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

type Viewer = Parameters<typeof createCorpusReadResponder>[1];

/** Seeds the named scripts, and filler scripts until the library holds `total`, through the production verb. */
async function seedScripts(root: Root, total: number | null): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  const create = (name: string): Promise<unknown> =>
    caller.regex.createScript({
      input: createRegexScriptSchema.parse({ name, findRegex: "witness", replaceString: "", placement: ["AI_OUTPUT"], enabled: false }),
    });
  for (const name of SCRIPTS) {
    await create(name);
  }
  const have = (await caller.regex.listScripts()).length;
  for (let n = 0; total !== null && have + n < total; n += 1) {
    await create(`Filler script ${String(n + 1)}`);
  }
}

/** Routes the shell's reads, the list and the delete to the same root, and forwards the server's own regex event to the page. */
async function prepare(
  page: Page,
  root: Root,
  reads: { readonly corpus: CorpusPlayback; readonly viewer: Viewer },
  cleanup: AsyncDisposableStack,
): Promise<void> {
  const { corpus, viewer } = reads;
  const caller = await root.internalCallerFor(root.ownerId);
  const overridesHold = trpcHold<"settings.getAppSettingsWithOverrides">();
  await routeTrpc(page, {
    "settings.getAppSettingsWithOverrides": () => overridesHold,
    "sessions.me": createCorpusReadResponder("sessions.me", viewer, corpus.reads["sessions.me"]),
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", viewer, corpus.reads["settings.getUserSettings"]),
    "settings.listThemes": createCorpusReadResponder("settings.listThemes", viewer, corpus.reads["settings.listThemes"]),
    ...serveCorpusProcedures(caller, [
      "persona.list",
      "regex.countScripts",
      "regex.listScripts",
      "regex.removeScript",
      "worldInfo.countBooks",
      "worldInfo.listBooksWithUsage",
      "rosterPreset.count",
      "rosterPreset.list",
      "plugin.list",
    ]),
    "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await forwardUserEvent(page, root, "regexChanged", cleanup);
}

/** Every row's actions button, in the order the list shows them. */
function actionButtons(page: Page): Locator {
  return page.getByRole("button", { name: /^Actions for / });
}

/** The accessible names of the rows' actions buttons, in the order the list shows them. */
function listedActions(page: Page): Promise<readonly string[]> {
  return actionButtons(page).evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label") ?? ""));
}

/** The body of the row whose actions button is named `actions`. */
function bodyOfRowWith(page: Page, actions: string): Locator {
  return page
    .locator(ROW)
    .filter({ has: page.getByRole("button", { name: actions, exact: true }) })
    .locator(ROW_BODY);
}

async function deleteByKeyboard(page: Page, actions: string): Promise<void> {
  await page.getByRole("button", { name: actions, exact: true }).focus();
  await page.keyboard.press("Enter");
  const remove = page.getByRole("menuitem", { name: ROW_DELETE_NAME, exact: true });
  await remove.focus();
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("alertdialog").getByRole("button", { name: ROW_DELETE_NAME, exact: true });
  await confirm.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
}

/** The second listed row, to delete, and the one after it, which takes the focus. */
async function secondAndThird(page: Page): Promise<{ readonly doomed: string; readonly neighbour: string }> {
  await expect(actionButtons(page).nth(2)).toBeVisible();
  const [, doomed, neighbour] = await listedActions(page);
  if (doomed === undefined || neighbour === undefined) {
    throw new Error("The list shows fewer than three rows");
  }
  return { doomed, neighbour };
}

test("deleting a script by keyboard moves focus to the next row once the row has left the list", async ({ corpus, corpusViewer, mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  await seedScripts(root, null);
  await prepare(page, root, { corpus, viewer: corpusViewer.userId }, cleanup);
  await mount<typeof ConfigPanesBusStory>(STORY, { showList: true, initialGroup: "regex" });
  const { doomed, neighbour } = await secondAndThird(page);

  await deleteByKeyboard(page, doomed);

  await expect(page.getByRole("button", { name: doomed, exact: true })).toHaveCount(0);
  await expect(bodyOfRowWith(page, neighbour)).toBeFocused();
});

test("deleting the last script by keyboard moves focus to the row before it once the row has left the list", async ({ corpus, corpusViewer, mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  await seedScripts(root, null);
  await prepare(page, root, { corpus, viewer: corpusViewer.userId }, cleanup);
  await mount<typeof ConfigPanesBusStory>(STORY, { showList: true, initialGroup: "regex" });
  await expect(actionButtons(page).nth(2)).toBeVisible();
  const actions = await listedActions(page);
  const last = actions.at(-1);
  const before = actions.at(-2);
  if (last === undefined || before === undefined) {
    throw new Error("The list shows fewer than two rows");
  }

  await deleteByKeyboard(page, last);

  await expect(page.getByRole("button", { name: last, exact: true })).toHaveCount(0);
  await expect(bodyOfRowWith(page, before)).toBeFocused();
});

test("deleting a script that takes the library below the virtualized size leaves focus on the next row", async ({ corpus, corpusViewer, mount, page }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  await seedScripts(root, COLLECTION_LARGE_GROUP + 1);
  await prepare(page, root, { corpus, viewer: corpusViewer.userId }, cleanup);
  await mount<typeof ConfigPanesBusStory>(STORY, { showList: true, initialGroup: "regex" });
  const { doomed, neighbour } = await secondAndThird(page);

  await deleteByKeyboard(page, doomed);

  await expect(page.getByRole("button", { name: doomed, exact: true })).toHaveCount(0);
  await expect(bodyOfRowWith(page, neighbour)).toBeFocused();
});

test("deleting the one script a filter leaves in a large library by keyboard leaves focus in the pane, not the page body", async ({
  corpus,
  corpusViewer,
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  await seedScripts(root, COLLECTION_LARGE_GROUP + 5);
  await prepare(page, root, { corpus, viewer: corpusViewer.userId }, cleanup);
  await mount<typeof ConfigPanesBusStory>(STORY, { showList: true, initialGroup: "regex" });
  await expect(actionButtons(page).nth(2)).toBeVisible();
  await page.getByRole("textbox", { name: collectionFilterName(REGEX_GROUP_LABEL), exact: true }).fill(SCRIPTS[0]);
  await expect(actionButtons(page)).toHaveCount(1);
  const [only] = await listedActions(page);
  if (only === undefined) {
    throw new Error("The filter left no row");
  }

  await deleteByKeyboard(page, only);

  await expect(actionButtons(page)).toHaveCount(0);
  await expect(page.locator(LANDING).locator(":focus")).toHaveCount(1);
});

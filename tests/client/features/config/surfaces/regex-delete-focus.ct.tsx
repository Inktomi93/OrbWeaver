// A regex script deleted from its row's actions by keyboard hands focus to the row beside it, never the page body: the row and its
// confirm unmount together, so Base UI has nothing to return focus to. The settings list and its content are the production ones
// over a corpus root, whose own scripts sit beside the ones made here through the production create verb.
// @subject packages/client/src/features/regex/components/regex-collection-rows.tsx
import { ROW_DELETE_NAME } from "@orb/client/lib";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { routeTrpc, serveCorpusProcedures, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { ConfigPanesStory } from "./_list-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_list-stories/ConfigPanesStory";
const SCRIPTS = ["Alpha script", "Bravo script", "Charlie script"] as const;
const ROW = '[data-slot="list-row-root"]';
const ROW_BODY = '[data-slot="list-row-body"]';

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

type Viewer = Parameters<typeof createCorpusReadResponder>[1];

/** Seeds the scripts through the production verb and routes the shell's reads, the list and the delete to the same root. */
async function prepare(page: Page, root: Root, corpus: CorpusPlayback, viewer: Viewer): Promise<TrpcRecorder> {
  const caller = await root.internalCallerFor(root.ownerId);
  for (const name of SCRIPTS) {
    await caller.regex.createScript({
      input: createRegexScriptSchema.parse({ name, findRegex: "witness", replaceString: "", placement: ["AI_OUTPUT"], enabled: false }),
    });
  }
  const overridesHold = trpcHold<"settings.getAppSettingsWithOverrides">();
  return routeTrpc(page, {
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
  });
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

test("deleting a script by keyboard moves focus to the next row", async ({ corpus, corpusViewer, mount, page }) => {
  await using root = await createCorpusHarness();
  const rpc = await prepare(page, root, corpus, corpusViewer.userId);
  await mount<typeof ConfigPanesStory>(STORY, { showList: true, initialGroup: "regex" });
  await expect(actionButtons(page).nth(2)).toBeVisible();
  const [, second, third] = await listedActions(page);

  await deleteByKeyboard(page, second ?? "");

  // The server's bus is what removes the row from the list, and this mount has no socket: the hand-off at the confirm's close is what is under test.
  await expect.poll(() => rpc.count("regex.removeScript")).toBe(1);
  await expect(bodyOfRowWith(page, third ?? "")).toBeFocused();
});

test("deleting the last script by keyboard moves focus to the row before it", async ({ corpus, corpusViewer, mount, page }) => {
  await using root = await createCorpusHarness();
  const rpc = await prepare(page, root, corpus, corpusViewer.userId);
  await mount<typeof ConfigPanesStory>(STORY, { showList: true, initialGroup: "regex" });
  await expect(actionButtons(page).nth(2)).toBeVisible();
  const actions = await listedActions(page);

  await deleteByKeyboard(page, actions.at(-1) ?? "");

  await expect.poll(() => rpc.count("regex.removeScript")).toBe(1);
  await expect(bodyOfRowWith(page, actions.at(-2) ?? "")).toBeFocused();
});

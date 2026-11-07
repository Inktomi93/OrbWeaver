import { holdServed, routeTrpc, serveCorpusProcedures, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { ConfigPanesStory } from "./_list-stories.tsx";

const PANES_STORY = "tests/client/features/config/surfaces/_list-stories/ConfigPanesStory";

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

type Corpus = Parameters<Parameters<typeof test>[2]>[0]["corpus"];
type CorpusViewer = Parameters<Parameters<typeof test>[2]>[0]["corpusViewer"];
type BookReadIntercept = Parameters<typeof serveCorpusProcedures<"worldInfo.getBook">>[2];

async function routeConfig(page: Page, corpus: Corpus, corpusViewer: CorpusViewer, bookRead?: BookReadIntercept): Promise<void> {
  const overridesHold = trpcHold<"settings.getAppSettingsWithOverrides">();
  const caller = await root.internalCallerFor(root.ownerId);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, {
    "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
    "settings.listThemes": createCorpusReadResponder("settings.listThemes", corpusViewer.userId, corpus.reads["settings.listThemes"]),
    "settings.getAppSettingsWithOverrides": () => overridesHold,
    ...serveCorpusProcedures(caller, [
      "persona.list",
      "regex.countScripts",
      "regex.listScripts",
      "worldInfo.countBooks",
      "worldInfo.listBooksWithUsage",
      "worldInfo.listEntries",
      "rosterPreset.count",
      "rosterPreset.list",
      "plugin.list",
    ]),
    ...serveCorpusProcedures(caller, ["worldInfo.getBook"], bookRead),
  });
}

const MEMBER_QUERY = "luck ledg";

test("Enter on a member hit lands in its editor, because the search field started the arrival", async ({ corpus, corpusViewer, mount, page }) => {
  await routeConfig(page, corpus, corpusViewer);
  await mount<typeof ConfigPanesStory>(PANES_STORY, { showList: true });
  const search = page.getByRole("combobox", { name: "Search settings" });
  await search.fill(MEMBER_QUERY);
  await expect(page.getByRole("option", { name: /luck ledger/u }).first()).toBeVisible();
  await search.press("Enter");
  await expect(page.locator('[data-slot="world-info-member-editor"]')).toBeFocused();
});

test("a member hit whose read is held leaves a reader who went back to typing in the search field", async ({ corpus, corpusViewer, mount, page }) => {
  const book = holdServed();
  await using held = new AsyncDisposableStack();
  held.defer(book.release);
  await routeConfig(page, corpus, corpusViewer, () => book);
  await mount<typeof ConfigPanesStory>(PANES_STORY, { showList: true });
  const search = page.getByRole("combobox", { name: "Search settings" });
  await search.fill(MEMBER_QUERY);
  await expect(page.getByRole("option", { name: /luck ledger/u }).first()).toBeVisible();
  await search.press("Enter");
  await book.requested;
  await search.focus();
  await search.pressSequentially("e");
  book.release();
  await expect(page.locator('[data-slot="world-info-member-editor"]')).toBeVisible();
  await expect(search).toBeFocused();
});

test("a search hit on a section inside a closed fold opens the fold", async ({ corpus, corpusViewer, mount, page }) => {
  await routeConfig(page, corpus, corpusViewer);
  await mount<typeof ConfigPanesStory>(PANES_STORY, { showList: true, initialGroup: "appearance" });
  const fold = page.getByRole("button", { name: /Customize this look/u });
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("combobox", { name: "Search settings" }).fill("effects");
  await page
    .getByRole("option", { name: /Effects/u })
    .first()
    .click();
  await expect(fold).toHaveAttribute("aria-expanded", "true");
});

// The list band inside the production shell: a section's name stays whole and the band's actions fold into their menu first,
// with the context pane docked beside the content. The shell's own stylesheet decides this, so the case mounts the shell.
import { seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_LABELS, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const BAND = '.shell-panel[data-panel-side="list"] .shell-panel-header';

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test.use({ viewport: { width: 1280, height: 900 } });

test("the Characters band keeps its whole name while its actions fold into the menu, with Context docked", async ({ corpus, mount, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "docked" } } });
  await mount<typeof AppShellStory>(STORY, {});
  const band = page.locator(BAND);
  const name = band.getByRole("heading", { level: 2 }).locator("> span").first();
  await expect(name).toHaveText(SECTION_LABELS.characters);
  await expect.poll(() => name.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  // The positive control: the band really was short of room, so the actions moved into the menu.
  await expect(band.locator('[data-slot="overflow-actions-trigger"]')).toBeVisible();
});

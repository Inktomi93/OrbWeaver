// A Corpus drill opened from its finder row by keyboard takes focus into the surface that replaces the overview: the Insights
// character drill and the Labels tag editor. The finder row is not removed, so the surface's own arrival is all that moves the reader
// off it. The shell, the Corpus section and its surfaces are the production ones over a corpus root.
// @subject packages/client/src/features/stats/surfaces/analytics-character-surface.tsx
import { CORPUS_MODE_LABELS, sectionBackName, testId } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CORPUS_GEM_TILES_NAME, CORPUS_MODE_NAME, CORPUS_MODEL_ROUTES_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";
import { LEADERBOARD_ROW_ATTR } from "#client/features/stats/lib/leaderboard-row-attr.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const CORPUS_READS = [
  ...SECTION_PROCEDURES,
  ...SHELL_MOUNT_PROCEDURES,
  "stats.leaderboard",
  "stats.character",
  "stats.latency",
  "character.get",
  "tag.listTagsWithUsage",
  "discovery.characterDossier",
  "discovery.characterKeywords",
  "search.similarArt",
] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

test.use({ viewport: { width: 1280, height: 900 } });

async function prepareCorpus(page: Page, root: Root, corpus: Parameters<typeof createShellAmbientReads>[0]): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, CORPUS_READS) });
  await seedShellState(page, { activeSection: "corpus" });
}

/** Switches the Corpus mode by keyboard, the way the mode radios are used. */
async function switchMode(page: Page, mode: string): Promise<void> {
  const radio = page.getByRole("radiogroup", { name: CORPUS_MODE_NAME, exact: true }).getByRole("radio", { name: mode, exact: true });
  await radio.focus();
  await page.keyboard.press("Enter");
}

test("opening an Insights character from its row by keyboard lands focus on the character drill", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  await prepareCorpus(page, root, corpus);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await switchMode(page, CORPUS_MODE_LABELS.insights);
  const row = page.locator(`[${LEADERBOARD_ROW_ATTR}]`).first().getByRole("button");
  await row.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByTestId(testId("analyticsCharacterSurface"))).toBeFocused();
});

test("opening a label from the Labels finder by keyboard lands focus on its editor", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [tag] = await caller.tag.listTagsWithUsage();
  if (tag === undefined) {
    throw new Error("The corpus has no tag");
  }
  await prepareCorpus(page, root, corpus);
  await mount<typeof ShellAmbientStory>(STORY, {});
  await switchMode(page, CORPUS_MODE_LABELS.labels);
  const row = page.getByRole("button", { name: tag.name, exact: true });
  await row.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator('[data-slot="tag-member-editor"]')).toBeFocused();
});

test("opening a forgotten-gem character by keyboard lands focus on the dossier's Back", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  await prepareCorpus(page, root, corpus);
  await mount<typeof ShellAmbientStory>(STORY, {});
  const tile = page.getByRole("list", { name: CORPUS_GEM_TILES_NAME, exact: true }).getByRole("button").first();
  await tile.focus();
  await page.keyboard.press("Enter");

  await expect(
    page.getByTestId(testId("corpusDossierSurface")).getByRole("button", { name: sectionBackName(CORPUS_MODE_LABELS.explore), exact: true }),
  ).toBeFocused();
});

test("opening a model route by keyboard lands focus on the artifact's Back", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  await prepareCorpus(page, root, corpus);
  await mount<typeof ShellAmbientStory>(STORY, {});
  const route = page.getByRole("list", { name: CORPUS_MODEL_ROUTES_NAME, exact: true }).getByRole("button").first();
  await route.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: sectionBackName(CORPUS_MODE_LABELS.explore), exact: true })).toBeFocused();
});

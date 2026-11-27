// @subject packages/client/src/features/discovery/components/corpus-computed-stamp.tsx
// Each Corpus result list says when its pass last recorded it, and the duplicate-character list names the embedding space
// it was compared in: the Similarity tab's two pair lists, the overview's keyword and story-theme lists, the cooccurrence
// list under a picked keyword, and a dossier's keyword profile. The data is the corpus root's own passes, read through its
// production reads.

import { contextToggleLabel } from "@orb/client/lib";
import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { createTimeLib, MS_PER_DAY, UTC_TIME_ZONE } from "@orb/kit/time";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CORPUS_COMPUTED_LEAD, CORPUS_EMBEDDING_SPACE_LEAD } from "#client/features/discovery/lib/corpus-computed-copy.ts";
import { CORPUS_CONTEXT_TAB_LABELS, CORPUS_PARAM_NAMES } from "#client/features/discovery/lib/corpus-control-names.ts";
import type { CorpusDestinationStory } from "../surfaces/_corpus-destination-stories.tsx";

const SHELL_STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const DESTINATION_STORY = "tests/client/features/discovery/surfaces/_corpus-destination-stories/CorpusDestinationStory";
const SERVED = [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES];
const SIMILARITY_READS = [
  "discovery.duplicateCharacters",
  "discovery.duplicateChats",
  "discovery.imageDuplicates",
  "discovery.catalog",
  "discovery.visualArchetypes",
  "discovery.similarityGraph",
] as const;
const COMPUTED = new RegExp(`^${RegExp.escape(CORPUS_COMPUTED_LEAD)} `, "u");
// The client timeLib reads browser storage this Node side lacks; the kit formatter it wraps renders in the CT's UTC zone.
const VIEWER_TIME = createTimeLib({ timeZone: UTC_TIME_ZONE });

function newest(rows: readonly { readonly computedAt: number }[]): number {
  return Math.max(...rows.map((row) => row.computedAt));
}

/** The corpus passes ran under the root's own frozen clock. A stamp outside the day before it is not a pass's time, so a read that
 *  projects the wrong column fails here instead of agreeing with the page that shows it. */
function expectCorpusPassTime(at: number, now: number): void {
  expect(at).toBeGreaterThan(now - MS_PER_DAY);
  expect(at).toBeLessThanOrEqual(now);
}

/** Each list's stamp prints its own time: the stamps on the page match the expected times one for one. */
async function expectStampTimes(scope: Pick<Page, "getByText">, times: readonly number[]): Promise<void> {
  const stamps = scope.getByText(COMPUTED);
  await expect(stamps).toHaveCount(times.length);
  const printed = times.map((at) => VIEWER_TIME.formatRelative(at));
  for (const text of new Set(printed)) {
    await expect(stamps.filter({ hasText: text })).toHaveCount(printed.filter((each) => each === text).length);
  }
}

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

test("the duplicate-character list says when it was computed and in which embedding space, and the duplicate-chat list when", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const chats = await caller.discovery.duplicateChats();
  const [first, second] = (await caller.discovery.browseCharacters({ limit: 2 })).items;
  if (first === undefined || second === undefined || chats.length === 0) {
    throw new Error("The corpus must hold two characters and a duplicate chat pair");
  }
  // The corpus's near-duplicate pass finds no character pair, so the pair is built from two real cards.
  const model = "corpus-embedding-space";
  const pair = {
    id: root.idSource.typeId(ID_PREFIX.duplicateCharacterPair),
    characterIdA: first.characterId,
    characterIdB: second.characterId,
    nameA: first.name,
    nameB: second.name,
    similarity: 0.97,
    model,
    computedAt: root.clock.now(),
  };
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [...SERVED, ...SIMILARITY_READS]),
    "discovery.duplicateCharacters": (input) => (input === undefined ? [pair] : trpcError()),
  });
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(SHELL_STORY, {});
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  const context = page.locator('.shell-panel[data-panel-side="context"]');
  await context.getByRole("tab", { name: CORPUS_CONTEXT_TAB_LABELS.similarity, exact: true }).click();
  await expect(context.getByRole("combobox", { name: CORPUS_PARAM_NAMES.minSimilarity })).toBeVisible();

  const section = (heading: string): ReturnType<typeof context.locator> =>
    context.locator("section").filter({ has: page.getByRole("heading", { name: heading }) });
  // The corpus finds no character pair, so this pair's model and time are the inputs the line must print.
  await expectStampTimes(section("Duplicate characters"), [pair.computedAt]);
  await expect(section("Duplicate characters").getByText(COMPUTED)).toContainText(`${CORPUS_EMBEDDING_SPACE_LEAD} ${model}`);
  // The chat pair is the corpus pass's own row, read through production.
  expectCorpusPassTime(newest(chats), root.clock.now());
  await expectStampTimes(section("Duplicate chats"), [newest(chats)]);
  await expect(section("Duplicate chats").getByText(COMPUTED)).not.toContainText(CORPUS_EMBEDDING_SPACE_LEAD);
});

test("the keyword list, the story-theme list and a picked keyword's cooccurrence list each say when they were computed", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  // The corpus's keyword counts sit under the default floor, so the list is read at the floor they do clear.
  const top = await caller.discovery.topKeywords({ minCount: 1 });
  const drift = await caller.discovery.themeDrift({ level: "scene" });
  let picked: string | undefined;
  let cooccurring: Awaited<ReturnType<typeof caller.discovery.cooccurringKeywords>> = [];
  for (const row of top) {
    cooccurring = await caller.discovery.cooccurringKeywords({ keyword: row.keyword });
    if (cooccurring.length > 0) {
      picked = row.keyword;
      break;
    }
  }
  if (picked === undefined || drift.length === 0) {
    throw new Error("The corpus must hold keyword profiles with a cooccurring keyword and story-theme assignments");
  }
  const themes = drift.flatMap((bucket) => bucket.themes);
  for (const rows of [top, themes, cooccurring]) {
    expectCorpusPassTime(newest(rows), root.clock.now());
  }
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [...SERVED, "discovery.cooccurringKeywords"]),
    "discovery.topKeywords": (input) => (input === undefined ? top : trpcError()),
  });
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(SHELL_STORY, {});

  // The keyword list and the theme list; no keyword is picked yet, so no cooccurrence list is on screen.
  await expectStampTimes(page, [newest(top), newest(themes)]);
  await page.getByRole("combobox", { name: CORPUS_PARAM_NAMES.cooccursWith }).click();
  await page.getByRole("option", { name: new RegExp(`^${RegExp.escape(picked)} \\(`, "u") }).click();
  await expectStampTimes(page, [newest(top), newest(themes), newest(cooccurring)]);
  await expect(page.getByText(COMPUTED)).toHaveCount(3);
});

test("a dossier's keyword profile says when it was computed", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  let withKeywords: CharacterId | undefined;
  let profile: Awaited<ReturnType<typeof caller.discovery.characterKeywords>> = [];
  for (const candidate of (await caller.discovery.browseCharacters({ limit: 200 })).items) {
    const dossier = await caller.discovery.characterDossier({ characterId: candidate.characterId });
    profile = await caller.discovery.characterKeywords({ characterId: candidate.characterId });
    if (dossier !== null && profile.length > 0) {
      withKeywords = candidate.characterId;
      break;
    }
  }
  if (withKeywords === undefined) {
    throw new Error("The corpus must hold a character with a dossier and a keyword profile");
  }
  expectCorpusPassTime(newest(profile), root.clock.now());
  await routeTrpc(page, serveCorpusProcedures(caller, [...SERVED, "discovery.characterDossier", "discovery.characterKeywords", "search.similarArt"]));
  await mount<typeof CorpusDestinationStory>(DESTINATION_STORY, { open: "character", characterId: withKeywords });
  await expectStampTimes(page, [newest(profile)]);
  await expect(page.getByText(COMPUTED)).toHaveCount(1);
});

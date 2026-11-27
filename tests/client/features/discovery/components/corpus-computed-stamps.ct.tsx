// @subject packages/client/src/features/discovery/components/corpus-computed-stamp.tsx
// Each Corpus result list says when its pass last recorded it, and the duplicate-character list names the embedding space
// it was compared in: the Similarity tab's two pair lists, the overview's keyword and story-theme lists, the cooccurrence
// list under a picked keyword, and a dossier's keyword profile. The data is the corpus root's own passes, read through its
// production reads.

import { contextToggleLabel } from "@orb/client/lib";
import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
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
  const characterStamp = section("Duplicate characters").getByText(COMPUTED);
  await expect(characterStamp).toHaveCount(1);
  await expect(characterStamp).toContainText(`${CORPUS_EMBEDDING_SPACE_LEAD} ${model}`);
  const chatStamp = section("Duplicate chats").getByText(COMPUTED);
  await expect(chatStamp).toHaveCount(1);
  await expect(chatStamp).not.toContainText(CORPUS_EMBEDDING_SPACE_LEAD);
});

test("the keyword list, the story-theme list and a picked keyword's cooccurrence list each say when they were computed", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  // The corpus's keyword counts sit under the default floor, so the list is read at the floor they do clear.
  const top = await caller.discovery.topKeywords({ minCount: 1 });
  const drift = await caller.discovery.themeDrift({ level: "scene" });
  let picked: string | undefined;
  for (const row of top) {
    if ((await caller.discovery.cooccurringKeywords({ keyword: row.keyword })).length > 0) {
      picked = row.keyword;
      break;
    }
  }
  if (picked === undefined || drift.length === 0) {
    throw new Error("The corpus must hold keyword profiles with a cooccurring keyword and story-theme assignments");
  }
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [...SERVED, "discovery.cooccurringKeywords"]),
    "discovery.topKeywords": (input) => (input === undefined ? top : trpcError()),
  });
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(SHELL_STORY, {});

  // The keyword list and the theme list; no keyword is picked yet, so no cooccurrence list is on screen.
  await expect(page.getByText(COMPUTED)).toHaveCount(2);
  await page.getByRole("combobox", { name: CORPUS_PARAM_NAMES.cooccursWith }).click();
  await page.getByRole("option", { name: new RegExp(`^${RegExp.escape(picked)} \\(`, "u") }).click();
  await expect(page.getByText(COMPUTED)).toHaveCount(3);
});

test("a dossier's keyword profile says when it was computed", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  let withKeywords: CharacterId | undefined;
  for (const candidate of (await caller.discovery.browseCharacters({ limit: 200 })).items) {
    const dossier = await caller.discovery.characterDossier({ characterId: candidate.characterId });
    if (dossier !== null && (await caller.discovery.characterKeywords({ characterId: candidate.characterId })).length > 0) {
      withKeywords = candidate.characterId;
      break;
    }
  }
  if (withKeywords === undefined) {
    throw new Error("The corpus must hold a character with a dossier and a keyword profile");
  }
  await routeTrpc(page, serveCorpusProcedures(caller, [...SERVED, "discovery.characterDossier", "discovery.characterKeywords", "search.similarArt"]));
  await mount<typeof CorpusDestinationStory>(DESTINATION_STORY, { open: "character", characterId: withKeywords });
  await expect(page.getByText(COMPUTED)).toHaveCount(1);
});

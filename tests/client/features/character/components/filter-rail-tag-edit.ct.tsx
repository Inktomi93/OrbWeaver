// A tag chip's edit action is reachable by tap: iOS WebKit fires no contextmenu on long-press.
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { CharacterLibraryStory } from "./_filter-rail-stories.tsx";

const STORY = "tests/client/features/character/components/_filter-rail-stories/CharacterLibraryStory";

test.use({ hasTouch: true, isMobile: true });

test("a tag chip opens its editor from a tap on a visible control, with no context menu", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const library = corpus.reads["character.list"][0]?.output;
  if (library === undefined) {
    throw new Error("Committed corpus must include a character library read");
  }
  const vocabulary = await caller.tag.listTagFilterVocabulary();
  const tags = await caller.tag.listTagsWithUsage();
  const tag = vocabulary[0];
  if (tag === undefined) {
    throw new Error("Committed corpus must include a tag");
  }
  const viewer = await caller.sessions.me();
  const settings = await caller.settings.getUserSettings();
  await routeTrpc(page, {
    "sessions.me": () => viewer,
    "settings.getUserSettings": () => settings,
    "character.list": () => library,
    "tag.listTagFilterVocabulary": () => vocabulary,
    "tag.listTagsWithUsage": () => tags,
  });
  await mount<typeof CharacterLibraryStory>(STORY, {});
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  await page.getByRole("button", { name: /show more filters/ }).tap();
  await expect(page.getByRole("button", { name: new RegExp(`^Filter by ${tag.name}:`) }).first()).toBeVisible();

  await page
    .getByRole("button", { name: `Edit tag ${tag.name}`, exact: true })
    .first()
    .tap();
  await expect(page.getByRole("dialog", { name: `Edit tag ${tag.name}`, exact: true })).toBeVisible();
});

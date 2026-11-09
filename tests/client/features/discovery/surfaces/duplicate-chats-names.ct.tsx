// Two near-duplicate chat pairs that read alike keep their names when an unrelated pair comes or goes.
import { ID_PREFIX } from "@orb/kit/ids";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { expect, test } from "@playwright/test";
import type { DuplicateChatsStory } from "./_duplicate-chats-stories.tsx";

const STORY = "tests/client/features/discovery/surfaces/_duplicate-chats-stories/DuplicateChatsStory";
const TWIN_TITLE = "Harbor night";
const SIMILARITY = 0.9;
const REMOVE_UNRELATED_PAIR = "Remove the unrelated pair";

test("a pair that reads like another keeps its name when an unrelated pair is deleted above it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const pair = (titleA: string, titleB: string): Parameters<typeof DuplicateChatsStory>[0]["pairs"][number] => ({
    id: root.idSource.typeId(ID_PREFIX.duplicateChatPair),
    chatIdA: root.idSource.typeId(ID_PREFIX.chat),
    chatIdB: root.idSource.typeId(ID_PREFIX.chat),
    titleA,
    titleB,
    similarity: SIMILARITY,
    relation: "duplicate",
  });
  await mount<typeof DuplicateChatsStory>(STORY, {
    pairs: [pair("Lantern", "Ferry"), pair(TWIN_TITLE, TWIN_TITLE), pair(TWIN_TITLE, TWIN_TITLE)],
    unrelatedIndex: 0,
    removeLabel: REMOVE_UNRELATED_PAIR,
  });
  const twins = page.getByRole("button", { name: new RegExp(`^${TWIN_TITLE} ↔ ${TWIN_TITLE}`, "u") });
  const names = (): Promise<(string | null)[]> => twins.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  await expect(twins).toHaveCount(2);
  const before = await names();
  expect(new Set(before).size).toBe(2);
  await page.getByRole("button", { name: REMOVE_UNRELATED_PAIR, exact: true }).click();
  await expect(page.getByRole("button", { name: /^Lantern ↔ Ferry/u })).toHaveCount(0);
  expect(await names()).toEqual(before);
});

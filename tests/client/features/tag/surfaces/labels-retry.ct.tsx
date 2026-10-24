// A Retry on the Labels finder's windowed list: the rows mount after the settled commit, so focus must wait for them.
import { COLLECTION_LARGE_GROUP } from "@orb/client/lib";
import { routeTrpc, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { LabelsListStory } from "./_labels-list-stories.tsx";

const STORY = "tests/client/features/tag/surfaces/_labels-list-stories/LabelsListStory";
const WINDOWED_TAGS = COLLECTION_LARGE_GROUP + 10;

test("Retry on a windowed tag list hands keyboard focus to a row once the rows mount", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  for (let index = 0; index < WINDOWED_TAGS; index += 1) {
    await caller.tag.createTag({ input: { name: `Retry label ${String(index + 1)}` } });
  }
  const tags = await caller.tag.listTagsWithUsage();
  expect(tags.length).toBeGreaterThan(COLLECTION_LARGE_GROUP);
  const viewer = await caller.sessions.me();
  const settings = await caller.settings.getUserSettings();
  let failing = true;
  await routeTrpc(page, {
    "sessions.me": () => viewer,
    "settings.getUserSettings": () => settings,
    "tag.listTagsWithUsage": () => (failing ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : tags),
  });
  await mount<typeof LabelsListStory>(STORY, {});
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();

  failing = false;
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("list", { name: "Tags", exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="virtual-list-row"] :focus')).toBeVisible();
});

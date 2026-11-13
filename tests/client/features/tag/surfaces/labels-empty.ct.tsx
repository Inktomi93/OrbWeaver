// @subject packages/client/src/features/tag/components/tag-collection-rows.tsx
// @subject packages/client/src/features/tag/surfaces/labels-landing-surface.tsx
// An empty tag library draws its designed empty state in the Labels rows and on the landing, and a filter that matches no
// tag draws the no-match state with its way back (client-architecture-state-and-gates.md §11, the three states).
import { CORPUS_MODE_LABELS, LABELS_EMPTY, LABELS_NONE, NO_MATCHES_TITLE } from "@orb/client/lib";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { createFirstBootHarness } from "@orb/testkit/node/composed";
import { expect, test } from "@playwright/test";
import { TAG_FILTER_NAME } from "#client/features/tag/lib/tag-list-name.ts";
import { CLEAR_FILTER_NAME } from "#client/lib/search-empty-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const LIST = '.shell-panel[data-panel-side="list"]';
const EMPTY_STATE = '[data-slot="empty-state-root"]';

test.use({ viewport: { width: 1280, height: 900 } });

test("an empty tag library draws the empty state in the rows and on the landing, and a missed filter draws the no-match state that clears it", async ({
  mount,
  page,
}) => {
  await using root = await createFirstBootHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  // The subject's own claim, read through the production verb: the owner holds no tag.
  expect(await caller.tag.listTagsWithUsage()).toEqual([]);
  await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]));
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await page.getByRole("radio", { name: CORPUS_MODE_LABELS.labels, exact: true }).click();
  const list = page.locator(LIST);
  const filter = list.getByLabel(TAG_FILTER_NAME, { exact: true });
  await expect(filter).toBeVisible();

  await expect(list.locator(EMPTY_STATE).getByText(LABELS_NONE, { exact: true })).toBeVisible();
  const landing = page.getByRole("main").locator(EMPTY_STATE);
  await expect(landing.getByText(LABELS_NONE, { exact: true })).toBeVisible();
  await expect(landing.getByText(LABELS_EMPTY, { exact: true })).toBeVisible();

  await filter.fill("zz-no-such-tag");
  const noMatch = list.locator(EMPTY_STATE);
  await expect(noMatch.getByText(NO_MATCHES_TITLE, { exact: true })).toBeVisible();
  await noMatch.getByRole("button", { name: CLEAR_FILTER_NAME, exact: true }).click();
  await expect(filter).toHaveValue("");
  await expect(list.locator(EMPTY_STATE).getByText(LABELS_NONE, { exact: true })).toBeVisible();
});

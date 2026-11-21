// The entry editor's Placement choice offers every seat, says what a missing seat does, and saves the one picked.
import { worldEntryIdInputSchema } from "@orb/contracts/world-info";
import { ENTRY_POSITIONS } from "@orb/kit/world-info";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { WORLD_INFO_ENTRY_PLACEMENT_NAME, WORLD_INFO_PLACEMENT_HINT, WORLD_INFO_POSITION_LABELS } from "#client/features/world-info/lib/world-info-names.ts";
import type { WorldInfoMemberStory } from "./_member-stories.tsx";

const STORY = "tests/client/features/world-info/surfaces/_member-stories/WorldInfoMemberStory";
const PROCEDURES = [
  "worldInfo.listBooksWithUsage",
  "worldInfo.listAttachmentsForBook",
  "worldInfo.listGlobal",
  "persona.list",
  "worldInfo.getBook",
  "worldInfo.listEntries",
  "worldInfo.updateEntry",
  "settings.getUserSettings",
] as const;
const PICKED = "authors_note_bottom";

let root: Awaited<ReturnType<typeof createCorpusHarness>>;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test("the Placement choice offers every seat by its name, explains a missing seat, and saves the pick", async ({ corpus, mount, page }) => {
  const world = corpus.worldInfoLibrary;
  if (world === undefined) {
    throw new Error("World Info cases require the corpus library");
  }
  const caller = await root.internalCallerFor(root.ownerId);
  const entryId = worldEntryIdInputSchema.parse(world.reads.entry.input).entryId;
  const stored = async (): Promise<unknown> => (await caller.worldInfo.getEntry({ entryId })).metadata?.["position"];
  // Positive control: the entry is not at the seat the case picks before the pick.
  expect(await stored()).not.toBe(PICKED);

  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  const component = await mount<typeof WorldInfoMemberStory>(STORY, { bookId: world.reads.entry.output.worldBookId, entryId, context: false });
  await expect(component.getByText(WORLD_INFO_PLACEMENT_HINT, { exact: true })).toBeVisible();
  await component.getByRole("combobox", { name: WORLD_INFO_ENTRY_PLACEMENT_NAME, exact: true }).click();
  for (const position of ENTRY_POSITIONS) {
    await expect(page.getByRole("option", { name: WORLD_INFO_POSITION_LABELS[position], exact: true })).toBeVisible();
  }
  await page.getByRole("option", { name: WORLD_INFO_POSITION_LABELS[PICKED], exact: true }).click();
  await expect.poll(stored).toBe(PICKED);
});

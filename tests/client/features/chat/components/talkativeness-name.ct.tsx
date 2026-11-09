// @subject packages/client/src/features/chat/components/talkativeness-popover.tsx
// The chip reads "Talks 50%" and its name contains that text; the popover it opens is a named dialog.
import { talkativenessAccessibleName, talkativenessControlName } from "@orb/client/lib";
import { ID_PREFIX } from "@orb/kit/ids";
import { accessibilityScan, readSurfaceDesignAudit } from "@orb/testkit/browser/spec";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { expect, test } from "@playwright/test";
import type { TalkativenessNameStory } from "./_talkativeness-name-stories.tsx";

const STORY = "tests/client/features/chat/components/_talkativeness-name-stories/TalkativenessNameStory";
const NAME = "Aria";
const WEIGHT = 0.5;

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
test.beforeAll(async () => {
  root = await createCorpusHarness();
});
test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

function seat(): Parameters<typeof TalkativenessNameStory>[0]["row"] {
  return {
    kind: "character",
    key: "talkativeness-name",
    characterId: root.idSource.typeId(ID_PREFIX.character),
    displayName: NAME,
    disabled: false,
    talkativeness: WEIGHT,
    avatarHash: null,
    responding: false,
  };
}

test("the chip's name contains its visible words", async ({ mount, page }) => {
  await mount<typeof TalkativenessNameStory>(STORY, { row: seat(), open: false });
  const chip = page.getByRole("button", { name: talkativenessAccessibleName(NAME, WEIGHT), exact: true });
  await expect(chip).toBeVisible();
  const result = await accessibilityScan(page);
  expect(result.violations.find(({ id }) => id === "label-content-name-mismatch")?.nodes).toBeUndefined();
  await expect(chip).toHaveText("Talks 50%");
});

test("the popover the chip opens is a dialog with a name", async ({ mount, page }) => {
  await mount<typeof TalkativenessNameStory>(STORY, { row: seat(), open: true });
  const result = await accessibilityScan(page);
  expect(result.violations.find(({ id }) => id === "aria-dialog-name")?.nodes).toBeUndefined();
  await expect(page.getByRole("dialog", { name: talkativenessControlName(NAME), exact: true })).toBeVisible();
  const audited = await readSurfaceDesignAudit(page);
  expect(audited.audit.findings.filter(({ rule }) => rule === "aria-name")).toEqual([]);
});

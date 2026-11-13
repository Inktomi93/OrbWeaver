// A tag pill holds its label button and its Remove button at one control step, so the pill is one chip tall at either pointer.

import { createTagSchema } from "@orb/contracts/tag";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { settledBox } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import { removeActionName } from "@orb/ui/lib";
import { editTagName } from "#client/components/shared-control-names.ts";
import type { CharacterTagsRowStory } from "./_tag-row-stories.tsx";

const STORY = "tests/client/features/character/components/_tag-row-stories/CharacterTagsRowStory";
const POINTERS = [
  { name: "fine", viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false },
  { name: "coarse", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
] as const;

for (const pointer of POINTERS) {
  test.describe(`${pointer.name} pointer`, () => {
    test.use({ viewport: pointer.viewport, isMobile: pointer.isMobile, hasTouch: pointer.hasTouch });
    test("the label and Remove buttons of a tag pill are one height, and so are the pill's rows", async ({ mount, page }) => {
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const tags = await Promise.all(["I", "OC"].map((name) => caller.tag.createTag({ input: createTagSchema.parse({ name }) })));
      await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "tag.listTagsWithUsage"]));
      await mount<typeof CharacterTagsRowStory>(STORY, { characterId: mintTypeId(ID_PREFIX.character, createSeededIds().next), tags });
      for (const tag of tags) {
        const label = await settledBox(page.getByRole("button", { name: editTagName(tag.name), exact: true }));
        const remove = await settledBox(page.getByRole("button", { name: removeActionName(tag.name), exact: true }));
        expect(remove.height, `${tag.name}: Remove is the label's height`).toBeCloseTo(label.height, 1);
        const pill = page.locator('[data-slot="badge"]', { has: page.getByRole("button", { name: editTagName(tag.name), exact: true }) });
        const chrome = await pill.evaluate((element) => {
          const style = getComputedStyle(element);
          return ["padding-top", "padding-bottom", "border-top-width", "border-bottom-width"].reduce(
            (sum, property) => sum + Number.parseFloat(style.getPropertyValue(property)),
            0,
          );
        });
        expect((await settledBox(pill)).height, `${tag.name}: the pill is its buttons plus its own padding and edge`).toBeCloseTo(label.height + chrome, 1);
      }
    });
  });
}

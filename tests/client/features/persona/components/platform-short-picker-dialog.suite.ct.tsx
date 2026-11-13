// A box 24rem tall or less has one scroller: the picker that creates a persona from a character takes what its dialog's chrome leaves.
// Layer: CT. Production entry: the Personas section's own "New persona from a character" door over the corpus root's reads.
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { LAYOUT_SUBPIXEL_PX } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { PERSONA_FROM_CHARACTER_NAME } from "#client/features/persona/lib/persona-copy.ts";
import type { PersonaActionGroupsStory } from "./_persona-action-groups-stories.tsx";

const STORY = "tests/client/features/persona/components/_persona-action-groups-stories/PersonaActionGroupsStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "persona.list",
  "persona.get",
  "worldInfo.listBooks",
  "worldInfo.listForPersona",
  "persona.listConnectedCharacters",
  "character.list",
  "preset.get",
  "plugin.listMacros",
] as const;
const ROW = "[cmdk-item]";

for (const regime of [
  { name: "coarse landscape", viewport: { width: 844, height: 390 } },
  { name: "coarse small landscape", viewport: { width: 568, height: 320 } },
] as const) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, hasTouch: true, isMobile: true });

    test("the new-persona-from-a-character picker is one scroller", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await routeTrpc(page, serveCorpusProcedures(caller, READS));
      await mount<typeof PersonaActionGroupsStory>(STORY, { width: regime.viewport.width, appearance: appearanceSettingsSchema.parse({}) });
      await page.getByRole("button", { name: PERSONA_FROM_CHARACTER_NAME, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: PERSONA_FROM_CHARACTER_NAME, exact: true });
      await expect(dialog.locator(ROW).first()).toBeVisible();
      // Exactly one: none would mean the rows cannot be reached by scrolling, two means one nests inside the other.
      const scrollers = await dialog.evaluate(
        (popup, epsilon) =>
          [popup, ...popup.querySelectorAll("*")]
            .filter((element) => /auto|scroll/u.test(getComputedStyle(element).overflowY) && element.scrollHeight - element.clientHeight > epsilon)
            .map((element) => element.getAttribute("data-slot") ?? element.tagName.toLowerCase()),
        LAYOUT_SUBPIXEL_PX,
      );
      expect(scrollers).toHaveLength(1);
    });
  });
}

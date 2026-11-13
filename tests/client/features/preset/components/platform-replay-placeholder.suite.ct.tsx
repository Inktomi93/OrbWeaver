// The replay lifetime field shows its whole placeholder: a numeric field is narrow, so its empty hint must fit the box.
import { presetDetailSchema } from "@orb/contracts/preset";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { PRESET_EDITOR_VIEW_LABELS, PRESET_REPLAY_LIFETIME_NAME } from "#client/features/preset/lib/preset-names.ts";
import type { PresetListLifetimeStory } from "./_list-lifetime-stories.tsx";

const STORY = "tests/client/features/preset/components/_list-lifetime-stories/PresetListLifetimeStory";

for (const coarse of [false, true]) {
  test.describe(coarse ? "coarse pointer" : "fine pointer", () => {
    test.use({ hasTouch: coarse, isMobile: coarse, viewport: { width: 1280, height: 900 } });

    test("the replay lifetime placeholder fits inside its number field", async ({ corpus, mount, page }) => {
      const library = corpus.libraryRelations;
      if (library === undefined) {
        throw new Error("The committed corpus omitted the preset library");
      }
      await using root = await createCorpusHarness();
      const presetId = presetDetailSchema.shape.id.parse(library.reads.presetDetail.output.id);
      await routeTrpc(
        page,
        serveCorpusProcedures(await root.internalCallerFor(root.ownerId), [
          "settings.getUserSettings",
          "sessions.me",
          "preset.get",
          "preset.list",
          "preset.resolveEffective",
          "connection.resolveChatCapability",
          "connection.providersAvailable",
          "connection.list",
        ]),
      );
      await mount<typeof PresetListLifetimeStory>(STORY, { presetId });
      await page.getByRole("tab", { name: PRESET_EDITOR_VIEW_LABELS.params, exact: true }).click();
      const field = page.getByRole("textbox", { name: PRESET_REPLAY_LIFETIME_NAME, exact: true });
      await field.scrollIntoViewIfNeeded();
      await expect(field).toBeVisible();
      // The placeholder paints in the input's own font; measure it against the content box the input leaves for text.
      const fit = await field.evaluate((input) => {
        if (!(input instanceof HTMLInputElement)) {
          throw new Error("the field is not an input");
        }
        const style = getComputedStyle(input);
        const context = document.createElement("canvas").getContext("2d");
        if (context === null) {
          throw new Error("no 2d canvas to measure the placeholder");
        }
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const room = input.clientWidth - Number.parseFloat(style.paddingInlineStart) - Number.parseFloat(style.paddingInlineEnd);
        return { placeholder: input.placeholder, text: context.measureText(input.placeholder).width, room };
      });
      expect(fit.placeholder.length).toBeGreaterThan(0);
      expect(fit.text, `"${fit.placeholder}" in ${fit.room}px`).toBeLessThanOrEqual(fit.room);
    });
  });
}

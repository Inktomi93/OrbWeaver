// A preset knob (PRESET_NUMBER_FORMAT) keeps the whole number when grouped digits are typed, and a decimal alone.
import { presetDetailSchema } from "@orb/contracts/preset";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { PresetListLifetimeStory } from "./_list-lifetime-stories.tsx";

const STORY = "tests/client/features/preset/components/_list-lifetime-stories/PresetListLifetimeStory";
const LOCALES = [
  { locale: "en-US", grouped: "8,192", decimal: "0.7", point: "0.7", shown: "0.7" },
  { locale: "de-DE", grouped: "8.192", decimal: "0,7", point: "0.7", shown: "0,7" },
] as const;

for (const { locale, grouped, decimal, point, shown } of LOCALES) {
  test.describe(`preset knobs in ${locale}`, () => {
    test.use({ locale, viewport: { width: 1280, height: 900 } });

    test("take grouped digits whole and leave a decimal alone", async ({ corpus, mount, page }) => {
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
          "preset.update",
          "preset.list",
          "preset.resolveEffective",
          "connection.resolveChatCapability",
          "connection.providersAvailable",
          "connection.list",
        ]),
      );
      await mount<typeof PresetListLifetimeStory>(STORY, { presetId });
      await page.getByRole("tab", { name: "Params", exact: true }).click();
      const tokens = page.getByRole("textbox", { name: "Max context tokens value", exact: true });
      await tokens.scrollIntoViewIfNeeded();
      await tokens.fill(grouped);
      await tokens.press("Tab");
      await expect(tokens).toHaveValue("8192");
      const temperature = page.getByRole("textbox", { name: "Temperature value", exact: true });
      await temperature.scrollIntoViewIfNeeded();
      await temperature.fill(decimal);
      await temperature.press("Tab");
      await expect(temperature).toHaveValue(decimal);
      // A lone point is not a group, in a locale that groups with it or not: 0.7 reads 0.7, never 7.
      await temperature.fill(point);
      await temperature.press("Tab");
      await expect(temperature).toHaveValue(shown);
      // A field that takes no input takes no paste either.
      const lifetime = page.getByRole("textbox", { name: "Response replay lifetime (seconds)", exact: true });
      await expect(lifetime).toBeDisabled();
      await lifetime.evaluate((input, text) => {
        const data = new DataTransfer();
        data.setData("text/plain", text);
        input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      }, grouped);
      await expect(lifetime).toHaveValue("");
    });
  });
}

// @subject packages/client/src/features/preset/lib/assembly-model.ts
// @subject packages/client/src/features/preset/components/prompt-assembly/section-drill-in.tsx
import { presetDetailSchema } from "@orb/contracts/preset";
import { routeTrpc, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import type { PresetListLifetimeStory } from "./_list-lifetime-stories.tsx";

test("an added section and its duplicate take their ids from the runtime's source", async ({ corpus, mount, page }) => {
  const library = corpus.libraryRelations;
  const settings = corpus.reads["settings.getUserSettings"][0]?.output;
  const viewer = corpus.reads["sessions.me"][0]?.output;
  if (library === undefined || settings === undefined || viewer === undefined) {
    throw new Error("The committed corpus omitted the preset owner/library");
  }
  let preset = presetDetailSchema.parse(library.reads.presetDetail.output);
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": () => settings,
    "sessions.me": () => viewer,
    "preset.get": () => preset,
    "preset.list": () => library.reads.presetList.output,
    "preset.resolveEffective": () => library.reads.presetEffective.output,
    "connection.resolveChatCapability": () => trpcError({ code: "BAD_REQUEST" }),
    "connection.providersAvailable": () => [],
    "connection.list": () => [],
    "preset.update": (input) => {
      preset = presetDetailSchema.parse({ ...preset, config: input.config ?? preset.config });
      return preset;
    },
  });
  await mount<typeof PresetListLifetimeStory>("tests/client/features/preset/components/_list-lifetime-stories/PresetListLifetimeStory", {
    presetId: preset.id,
  });
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Prompt", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: "Literal text", exact: true }).click();
  await page.getByRole("button", { name: "Section actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();

  const seeded = createSeededIds(FIXTURE_ID_CURSOR);
  const [added, duplicate] = [seeded.uuid(), seeded.uuid()];
  await expect
    .poll(() =>
      trpc
        .lastInput("preset.update")
        ?.config?.sections.map((section) => section.id)
        .filter((id) => id === added || id === duplicate),
    )
    .toEqual([added, duplicate]);
});

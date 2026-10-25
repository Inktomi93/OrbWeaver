// @subject packages/client/src/features/preset/lib/assembly-model.ts
// @subject packages/client/src/features/preset/components/prompt-assembly/section-drill-in.tsx
import { presetDetailSchema } from "@orb/contracts/preset";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { PresetListLifetimeStory } from "./_list-lifetime-stories.tsx";

test("an added section and its duplicate take their ids from the runtime's source", async ({ corpus, mount, page }) => {
  const library = corpus.libraryRelations;
  if (library === undefined) {
    throw new Error("The committed corpus omitted the preset library");
  }
  await using root = await createCorpusHarness();
  const presetId = presetDetailSchema.shape.id.parse(library.reads.presetDetail.output.id);
  const trpc = await routeTrpc(
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
      "preset.update",
    ]),
  );
  await mount<typeof PresetListLifetimeStory>("tests/client/features/preset/components/_list-lifetime-stories/PresetListLifetimeStory", {
    presetId,
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

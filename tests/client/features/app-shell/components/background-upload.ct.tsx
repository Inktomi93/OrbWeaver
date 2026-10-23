// @subject packages/client/src/features/app-shell/components/background-upload-field.tsx
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import type { BackgroundSectionStory } from "./_background-upload-stories.tsx";

const UPLOAD_ROUTE = "**/api/assets/upload";
const HASH = "ab".repeat(32);

test("an uploaded background is saved under the id the runtime's source minted", async ({ corpus, mount, page }) => {
  const settings = corpus.reads["settings.getUserSettings"][0]?.output;
  if (settings === undefined) {
    throw new Error("The committed corpus omitted the user settings read");
  }
  const assetId = mintTypeId(ID_PREFIX.asset, createSeededIds().next);
  await page.route(UPLOAD_ROUTE, (route) => route.fulfill({ json: { assetId, hash: HASH, size: 4, created: true } }));
  const saved: unknown[] = [];
  await routeTrpc(page, {
    "settings.getUserSettings": () => settings,
    "settings.updateUserSettingsSection": (input) => {
      saved.push(input);
      return settings;
    },
  });
  await mount<typeof BackgroundSectionStory>("tests/client/features/app-shell/components/_background-upload-stories/BackgroundSectionStory", {});

  await page.getByRole("button", { name: "Add background", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "dusk.png", mimeType: "image/png", buffer: Buffer.from("png!") });

  const expectedEntryId = createSeededIds(FIXTURE_ID_CURSOR).uuid();
  await expect
    .poll(() => saved.at(-1))
    .toMatchObject({
      section: "appearance",
      patch: { backgroundLibrary: expect.arrayContaining([expect.objectContaining({ entryId: expectedEntryId, assetId, assetHash: HASH, name: "dusk" })]) },
    });
});

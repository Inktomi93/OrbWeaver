// @subject packages/client/src/features/databank/components/home-documents-tile-body.tsx
// Home's Documents tile sits on the shelf, so a bank with no documents states its emptiness at shelf weight: a label line, its
// two doors and the teaching gloss, and no centred empty-state island (UI-Density-Law §3.3).

import { DATABANK_DOCUMENTS_TILE_ID } from "@orb/client/state";
import { HOME_RECENT_DOCUMENTS_LIMIT } from "@orb/contracts/databank";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { DATABANK_INGEST_GLOSS } from "#client/features/databank/lib/databank-copy.ts";
import { DATABANK_ADD_FIRST_DOCUMENT_NAME, DATABANK_EMPTY_TITLE, databankOpenSectionName } from "#client/features/databank/lib/databank-names.ts";
import { DATABANK_SECTION_LABEL } from "#client/features/databank/lib/databank-section-label.ts";
import type { HomeTilesStory } from "./_documents-tile-stories.tsx";

test("an empty bank states its emptiness at shelf weight: label, both doors and the gloss, with no empty-state island", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const bank = await caller.databank.list({ limit: HOME_RECENT_DOCUMENTS_LIMIT });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "chat.getChat"]),
    "databank.list": (input) => {
      expect(input).toEqual({ limit: HOME_RECENT_DOCUMENTS_LIMIT });
      return { ...bank, items: [] };
    },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mount<typeof HomeTilesStory>("tests/client/features/databank/components/_documents-tile-stories/HomeTilesStory", { width: 1440 });
  const tile = page.locator(`[data-home-tile="${DATABANK_DOCUMENTS_TILE_ID}"]`);
  await expect(tile.getByText(DATABANK_EMPTY_TITLE, { exact: true })).toBeVisible();
  await expect(tile.locator('[data-slot="empty-state-root"]')).toHaveCount(0);
  await expect(tile.getByRole("button", { name: DATABANK_ADD_FIRST_DOCUMENT_NAME, exact: true })).toBeVisible();
  await expect(tile.getByRole("button", { name: databankOpenSectionName(DATABANK_SECTION_LABEL), exact: true })).toBeVisible();
  await expect(tile.getByText(DATABANK_INGEST_GLOSS, { exact: true })).toBeVisible();
});

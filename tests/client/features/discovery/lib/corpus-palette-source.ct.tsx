// CT: the ⌘K rows for the Corpus modes (D271). The palette reaches Insights and Labels directly, through
// the same `setCorpusMode` the switch writes — the keyboard route to the homes Analytics and Tags moved to.
// Asserted at the store, through the state probe mounted beside the palette.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CorpusSelectionProbe } from "../../../state/_ct-stories.tsx";
import { CorpusModePaletteStory } from "../_ct-stories.tsx";

test("the palette lists each Corpus mode under Corpus, and a picked row lands on Corpus in that mode", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": { items: [], nextCursor: null } });
  await mount(
    <>
      <CorpusModePaletteStory />
      <CorpusSelectionProbe />
    </>,
  );

  await page.getByRole("combobox").fill("tags");
  await page.getByRole("option", { name: /Tags/u }).click();
  const state = page.locator("output");
  await expect(state).toContainText("section=corpus mode=labels");

  await page.getByRole("combobox").fill("stats");
  await page.getByRole("option", { name: /Insights/u }).click();
  await expect(state).toContainText("section=corpus mode=insights");
});

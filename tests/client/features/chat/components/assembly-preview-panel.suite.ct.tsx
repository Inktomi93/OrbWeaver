import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AssemblyPreviewPanelStory } from "../_ct-stories.tsx";

const TRACE = {
  staticSections: [],
  dynamicSections: [],
  worldInfoIncluded: 0,
  worldInfoDropped: [],
  worldInfoActivated: [],
  matchedKeys: [],
  compactSummaryIncluded: false,
  memoryIncluded: false,
  memoryRecall: null,
  databankIncluded: false,
  guidedInstructionIncluded: false,
  staticCacheBusters: [],
  chatInjectionsIncluded: 0,
  afterHistorySections: [],
};

async function routePreview(page: Page, dynamic: boolean): Promise<void> {
  const id = mintTypeId(ID_PREFIX.worldEntry);
  const title = dynamic ? "Dragon arrival" : "Static setting";
  const lore = dynamic ? "A dragon appears." : "The hills are green.";
  const tokens = estimateTokens(lore);
  const trace = {
    ...TRACE,
    staticSections: dynamic ? [] : ["wi-before"],
    dynamicSections: dynamic ? ["wi-before"] : [],
    worldInfoIncluded: 1,
    worldInfoActivated: [{ id, title, keys: dynamic ? ["dragon"] : [] }],
    worldInfoDynamicEntries: dynamic ? [{ id, title, position: "before" as const }] : [],
  };
  await routeTrpc(page, {
    "chat.previewAssembly": {
      prompt: { static: dynamic ? "" : lore, dynamic: dynamic ? lore : "", afterHistory: [], sendHistory: true, trace },
      trace,
      budget: {
        ceilingTokens: 0,
        ceilingEstimated: false,
        reserveOutputTokens: 0,
        limit: null,
        totalTokens: tokens,
        sources: [{ source: "world-info", detail: "World info (before)", tokens, text: lore, parts: [{ label: title, tokens, text: lore }] }],
        sections: [],
      },
    },
    "chat.getShapeTrace": {
      multiCharacter: false,
      stageCounts: { withTail: 0, injected: 0, squashed: 0, named: 0 },
      squashMerges: 0,
      breakpointDecision: "no-stable-prefix",
      rows: [],
    },
  });
}

test("static world info does not warn", async ({ mount, page }) => {
  await routePreview(page, false);
  const component = await mount(<AssemblyPreviewPanelStory />);
  await expect(component.getByText(/Counts are estimated locally/)).toBeVisible();
  await expect(component.locator('[data-slot="world-info-cache-warning"]')).toHaveCount(0);
});

test("preview names actual dynamic lore and its anchor", async ({ mount, page }) => {
  await routePreview(page, true);
  const component = await mount(<AssemblyPreviewPanelStory />);
  const warning = component.locator('[data-slot="world-info-cache-warning"]');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Dragon arrival · World info (before)");
  await expect(warning).toContainText("keyword-matched entries actually join this turn");
  await expect(warning).toContainText("Adjust entry activation or depth placement");
  await test.info().attach("dynamic-lore-warning", { body: await component.screenshot(), contentType: "image/png" });
});

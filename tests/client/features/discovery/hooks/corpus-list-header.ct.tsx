// @subject packages/client/src/features/discovery/hooks/use-corpus-list-header.tsx
import type { TrpcWireOutput } from "@orb/testkit/ct";
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import { distilledCensus } from "#client/features/discovery/lib/corpus-vocabulary.ts";
import type { CorpusListHeaderStory } from "./_list-header-stories.tsx";

const PARTLY_DISTILLED: TrpcWireOutput<"discovery.catalog"> = { genres: [], tones: [], topTags: [], totalDistilled: 12, totalCharacters: 20 };

test("the Corpus band states the distilled count against the library it is drawn from", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.catalog": () => PARTLY_DISTILLED });
  const component = await mount<typeof CorpusListHeaderStory>("tests/client/features/discovery/hooks/_list-header-stories/CorpusListHeaderStory", {});
  await expect(component.getByRole("heading", { level: 2 }).getByText(String(distilledCensus(12, 20)), { exact: true })).toBeVisible();
});

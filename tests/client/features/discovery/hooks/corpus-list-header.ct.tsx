// @subject packages/client/src/features/discovery/hooks/use-corpus-list-header.tsx
import type { TrpcWireOutput } from "@orb/testkit/ct";
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import type { CorpusListHeaderStory } from "./_list-header-stories.tsx";

const PARTLY_DISTILLED: TrpcWireOutput<"discovery.catalog"> = { genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 12, totalCharacters: 20 };

test("the Corpus band states the distilled count against the library it is drawn from", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.catalog": () => PARTLY_DISTILLED });
  const component = await mount<typeof CorpusListHeaderStory>("tests/client/features/discovery/hooks/_list-header-stories/CorpusListHeaderStory", {});
  await expect(component.getByRole("heading", { level: 2 }).getByText("12 of 20 distilled", { exact: true })).toBeVisible();
});

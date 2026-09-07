// CT: the characters CONTEXT panel's resting overview card — its READ ARMS (#1500).
//
// THE DEFECT: `data === undefined` was the card's only branch, so the card could not tell "still loading"
// from "the read failed". The client retries a query twice and then stops, and this pane is the whole
// content of the CONTEXT panel — so a failed `character.get` left a 384px column reading "Loading…" for the
// rest of the session with no recovery but a page reload. Two of the eleven surfaces in #1500 had that
// shape; this is one of them, and it is the worse kind, because the surface keeps claiming to be working.
//
// The pin drives a FAIL-THEN-SUCCEED script, so the Retry is proven to actually re-read rather than merely
// re-render (`QueryErrorState`'s whole contract). `CtDataProviders` pins `retry: false`, so the failure is
// the settled state on the first response rather than something to wait three backoffs for.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { CharacterOverviewCardStory } from "../_ct-stories.tsx";
import { makeCharacterDetail } from "../fixtures.ts";

const NO_CHATS = { items: [], nextCursor: null, totalCount: 0 };

test("a FAILED character read says so and its Retry really re-reads — never a permanent 'Loading…' (#1500)", async ({ mount, page }) => {
  let attempts = 0;
  const trpc = await routeTrpc(page, {
    "character.get": () => (attempts++ === 0 ? trpcError({ message: "character read failed" }) : makeCharacterDetail({ name: "Aria Nightshade" })),
    "chat.listChats": () => NO_CHATS,
  });
  const card = await mount(<CharacterOverviewCardStory />);

  await expect(card.getByText("Couldn't load this character.")).toBeVisible();
  await expect(card.getByText("Loading…")).toHaveCount(0);

  await card.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => trpc.count("character.get"), { intervals: [20, 50, 100] }).toBe(2);
  // The settled card is what the retry is FOR — the Origin group is its first real content.
  await expect(card.getByText("Origin")).toBeVisible();
});

// CT: the character library surface end-to-end. Drives the PRODUCTION path — `character.list`
// (routeTrpc, keyset-paged) → `createCollectionSurface`'s `useInfiniteQuery` → the virtualized card
// list. Asserts: the first page renders AND the tail-fetch guard auto-pulls the second page (the story's
// 480px/2-row viewport puts every row within the default 12-row `endApproachRows` window, so the guard
// fires without a real scroll gesture); the search box (useDeferredValue) filters by name/tag
// CLIENT-SIDE over whatever pages are loaded (`character.list` has no server-side search param — see
// the surface's header note); an empty library and a no-match search each get their own honest empty
// state; a scripted read failure shows the error state (NO Retry — `createCollectionSurface` exposes no
// refetch handle, so the QueryBoundary reset handshake the old unpaged read used no longer applies).
//
// NOTE (mirrors message-list-surface.ct.tsx's own note): `trpc.character.list` is stubbed at the NETWORK
// (routeTrpc) — the responder inspects the decoded `input.cursor` to serve page 1 vs page 2.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { CharacterLibrarySurfaceStory } from "../_ct-stories";
import { makeCharacterSummary, makeTagFixture } from "../fixtures";

const ARIA = makeCharacterSummary({
  id: "char_aria",
  name: "Aria Nightshade",
  createdAt: 3000,
  tags: [makeTagFixture({ id: "tag_rpg", name: "rpg" })],
});
const BOLT = makeCharacterSummary({ id: "char_bolt", name: "Bolt", createdAt: 2000, tags: [] });
const CASSIUS = makeCharacterSummary({
  id: "char_cassius",
  name: "Cassius",
  createdAt: 1000,
  tags: [],
});

const PAGE_1_CURSOR = { createdAt: BOLT.createdAt, id: BOLT.id };

/** A two-page keyset series: page 1 = [ARIA, BOLT] + a cursor; page 2 = [CASSIUS], exhausted. */
function twoPageResponder(input: unknown): unknown {
  const cursor = (input as { cursor?: unknown } | undefined)?.cursor;
  return cursor === undefined
    ? { items: [ARIA, BOLT], nextCursor: PAGE_1_CURSOR }
    : { items: [CASSIUS], nextCursor: null };
}

test("renders the first page, then auto-fetches the next page (tail-fetch guard)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { "character.list": twoPageResponder });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();
  // The tail-fetch guard (VirtualList's onEndApproach) pulls page 2 without a scroll gesture — the
  // story's viewport puts every row inside the default endApproachRows window.
  await expect(component.getByText("Cassius")).toBeVisible();
});

test("the search box filters loaded pages by name, client-side", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": twoPageResponder });

  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Cassius")).toBeVisible(); // both pages loaded first
  await component.getByPlaceholder("Search characters…").fill("bolt");

  await expect(component.getByText("Bolt")).toBeVisible();
  await expect(component.getByText("Aria Nightshade")).toHaveCount(0);
  await expect(component.getByText("Cassius")).toHaveCount(0);
});

test("an empty library shows the 'no characters yet' empty state", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": () => ({ items: [], nextCursor: null }) });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByText("No characters yet")).toBeVisible();
});

test("a search with no matches shows the 'no matches' empty state", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": twoPageResponder });

  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Cassius")).toBeVisible(); // both pages loaded first
  await component.getByPlaceholder("Search characters…").fill("nonexistent-name");

  await expect(component.getByText("No matches")).toBeVisible();
});

test("a read failure shows the error state (no Retry — the factory exposes no refetch handle)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { "character.list": () => trpcError() });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByText("Couldn't load the character library.")).toBeVisible();
  await expect(component.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

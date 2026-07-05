// CT: the character library surface end-to-end. Drives the PRODUCTION path — `character.list` read
// (routeTrpc) → useSuspenseQuery/QueryBoundary → the virtualized card list. Asserts: the full unpaged
// list renders; the search box (useDeferredValue) filters by name/tag client-side; an empty library and
// a no-match search each get their own honest empty state; a scripted read failure hits the QueryBoundary
// error surface and Retry actually refetches.
//
// NOTE (mirrors message-list-surface.ct.tsx's own note): `trpc.character.list` is stubbed at the NETWORK
// (routeTrpc) — the tRPC proxy builds the path structurally, so this CT runs regardless of the read
// verb's pagination shape (see the surface's MISSING-API header note).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { CharacterLibrarySurfaceStory } from "../_ct-stories";
import { makeCharacterSummary, makeTagFixture } from "../fixtures";

const ARIA = makeCharacterSummary({
  id: "char_aria",
  name: "Aria Nightshade",
  tags: [makeTagFixture({ id: "tag_rpg", name: "rpg" })],
});
const BOLT = makeCharacterSummary({ id: "char_bolt", name: "Bolt", tags: [] });

test("renders every character in the unpaged list", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": () => [ARIA, BOLT] });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();
});

test("the search box filters the list by name", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": () => [ARIA, BOLT] });

  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByPlaceholder("Search characters…").fill("bolt");

  await expect(component.getByText("Bolt")).toBeVisible();
  await expect(component.getByText("Aria Nightshade")).toHaveCount(0);
});

test("an empty library shows the 'no characters yet' empty state", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": () => [] });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByText("No characters yet")).toBeVisible();
});

test("a search with no matches shows the 'no matches' empty state", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": () => [ARIA, BOLT] });

  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByPlaceholder("Search characters…").fill("nonexistent-name");

  await expect(component.getByText("No matches")).toBeVisible();
});

test("a read failure shows the error state, and Retry actually refetches", async ({
  mount,
  page,
}) => {
  let call = 0;
  await routeTrpc(page, {
    "character.list": () => (call++ === 0 ? trpcError() : [ARIA]),
  });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByText("Couldn't load the character library.")).toBeVisible();
  await component.getByRole("button", { name: "Retry" }).click();
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
});

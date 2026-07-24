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
import type { Page } from "@playwright/test";
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
  return cursor === undefined ? { items: [ARIA, BOLT], nextCursor: PAGE_1_CURSOR } : { items: [CASSIUS], nextCursor: null };
}

test("renders the first page, then auto-fetches the next page (tail-fetch guard)", async ({ mount, page }) => {
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

test("a read failure shows the error state with a working Retry (rule 1 — no dead ends)", async ({ mount, page }) => {
  // First read fails; after Retry the responder recovers — the list renders without a remount.
  let failed = false;
  await routeTrpc(page, {
    "character.list": () => {
      if (!failed) {
        failed = true;
        return trpcError();
      }
      return { items: [BOLT], nextCursor: null };
    },
  });

  const component = await mount(<CharacterLibrarySurfaceStory />);

  await expect(component.getByText("Couldn't load the character library.")).toBeVisible();
  await component.getByRole("button", { name: "Retry" }).click();
  await expect(component.getByText("Bolt")).toBeVisible();
});

// ── §4.2/§4.5/§4.6/§4.3 the new LIST features ──────────────────────────────────────────────────────

const STARLA = makeCharacterSummary({
  id: "char_star",
  name: "Starla",
  starred: true,
  createdAt: 3000,
});
const BOLT2 = makeCharacterSummary({ id: "char_bolt2", name: "Bolt", createdAt: 2000 });
const TAGGED = makeCharacterSummary({
  id: "char_tag",
  name: "Cassius",
  createdAt: 1000,
  tags: [makeTagFixture({ id: "tag_rpg", name: "rpg" })],
});

/** Route a single exhausted page of the three fixtures + an empty `listChats` (empty resume map). */
async function routeThree(page: Page): Promise<void> {
  await routeTrpc(page, {
    "character.list": () => ({ items: [STARLA, BOLT2, TAGGED], nextCursor: null }),
    "chat.listChats": () => [],
  });
}

test("§4.2 the favorites strip surfaces starred characters as select-only avatars", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  const strip = component.getByRole("list", { name: "Favorite characters" });
  await expect(strip.getByRole("button", { name: "Open Starla" })).toBeVisible();
  // Bolt is not starred → not in the strip.
  await expect(strip.getByRole("button", { name: "Open Bolt" })).toHaveCount(0);
});

test("§4.5 the Favorites filter chip narrows to starred rows", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Bolt")).toBeVisible();
  await component.getByRole("button", { name: "Show only favorites" }).click();
  await expect(component.getByText("Bolt")).toHaveCount(0);
  await expect(component.getByText("Cassius")).toHaveCount(0);
});

test("§4.3 the Group toggle switches to categorized view (an Uncategorized bucket)", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Group by tag" }).click();
  // Starla + Bolt have no tags → the trailing Uncategorized category header.
  await expect(component.getByText("Uncategorized")).toBeVisible();
});

test("§4.6 bulk mode reveals row checkboxes + the selection bar", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Select multiple" }).click();
  await component.getByRole("checkbox", { name: "Select Bolt" }).click();
  // The selection bar's bulk actions appear once a row is selected.
  await expect(component.getByRole("button", { name: "Tag", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
});

// D1 — a chip-induced empty over the loaded window must NOT show search copy nor dead-end: a favorite that
// lives only on a LATER page is reachable via a Load more affordance. Page 1 is large enough that the
// virtual list does not auto-tail-fetch, so filtering to favorites (none on page 1) yields the chip-empty.
const PAGE1_FILLERS = Array.from({ length: 40 }, (_, i) => makeCharacterSummary({ id: `char_fill_${i}`, name: `Filler ${i}`, createdAt: 9000 - i }));
const LATE_FAVORITE = makeCharacterSummary({
  id: "char_late_fav",
  name: "Zephyr",
  starred: true,
  createdAt: 100,
});
const PAGE1_CURSOR_LATE = { createdAt: 8961, id: "char_fill_39" };

test("D1 a favorites-chip empty over the loaded window offers Load more, reaching a later-page favorite", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": (input: unknown) =>
      (input as { cursor?: unknown } | undefined)?.cursor === undefined
        ? { items: PAGE1_FILLERS, nextCursor: PAGE1_CURSOR_LATE }
        : { items: [LATE_FAVORITE], nextCursor: null },
    "chat.listChats": () => [],
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await expect(component.getByText("Filler 0")).toBeVisible();

  await component.getByRole("button", { name: "Show only favorites" }).click();
  // NOT the search copy (no search was typed), and NOT a dead end — the chip-empty offers Load more.
  await expect(component.getByText("No matches in view")).toBeVisible();
  const loadMore = component.getByRole("button", { name: "Load more" });
  await expect(loadMore).toBeVisible();

  await loadMore.click();
  // Page 2 holds the only favorite — it is now reachable.
  await expect(component.getByText("Zephyr")).toBeVisible();
});

test("D2 the bulk Tag action opens a picker and applies a tag to the selection", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "character.list": () => ({ items: [STARLA, BOLT2, TAGGED], nextCursor: null }),
    "chat.listChats": () => [],
    "character.bulkAddCardTag": () => ({ tagged: 1 }),
  });
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "Select multiple" }).click();
  await component.getByRole("checkbox", { name: "Select Bolt" }).click();
  await component.getByRole("button", { name: "Tag", exact: true }).click();

  // The picker Dialog is portaled outside the mount root — query it via `page`.
  await page.getByRole("textbox", { name: "Tag name" }).fill("adventure");
  await page.getByRole("button", { name: "Apply" }).click();
  // The mutation carries the typed tag + exactly the selected id (assertion-quality audit 2026-07-24:
  // the selection-cleared check alone left the wire payload unpinned).
  await expect
    .poll(() => trpc.lastInput("character.bulkAddCardTag"), { intervals: [20, 50, 100] })
    .toMatchObject({ tagName: "adventure", characterIds: ["char_bolt2"] });
  // Applying clears the selection → the bulk bar (its Tag action) is gone.
  await expect(component.getByRole("button", { name: "Tag", exact: true })).toHaveCount(0);
});

test("D4 the create dialog gates Create on BOTH name and description, with the requirement shown", async ({ mount, page }) => {
  await routeThree(page);
  const component = await mount(<CharacterLibrarySurfaceStory />);
  await component.getByRole("button", { name: "New or import a character" }).click();
  // The Menu popup + the create Dialog are portaled outside the mount root — query them via `page`.
  await page.getByRole("menuitem", { name: "New character" }).click();

  const create = page.getByRole("button", { name: "Create", exact: true });
  await expect(create).toBeDisabled();
  await expect(page.getByText("A name and a description are both required.")).toBeVisible();

  await page.getByRole("textbox", { name: "Character name" }).fill("Elara");
  // Name alone is not enough — description is required (§4.1).
  await expect(create).toBeDisabled();

  await page.getByRole("textbox", { name: "Character description" }).fill("A sharp-tongued map-maker.");
  await expect(create).toBeEnabled();
  await expect(page.getByText("A name and a description are both required.")).toHaveCount(0);
});

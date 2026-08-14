// CT: the J2 new-chat character picker end-to-end. Drives the PRODUCTION path — `character.list`
// (routeTrpc, one bounded page) → `useSuspenseQuery` in `<QueryBoundary>` → the cmdk multi-select list.
// Asserts: character rows render; the "Blank chat" escape hatch is present; the confirm item's label
// reflects the live selection count (proving the multi-select toggle is wired); the search reaches the
// SERVER (owner ruling 2026-08-13) — this picker used to be ONE `limit: 100` page filtered by cmdk, so a
// character past the hundredth card could not be found here at all while she sat in the library.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { characterListResponder, makeCharacterSummary } from "../../character/fixtures.ts";
import { NewChatPickerStory } from "../_ct-stories.tsx";

const ARIA = makeCharacterSummary({ id: "char_aria", name: "Aria" });
const BOLT = makeCharacterSummary({ id: "char_bolt", name: "Bolt" });

const charPage = { items: [ARIA, BOLT], nextCursor: null, totalCount: 2 };

test("renders the character rows + the Blank chat escape hatch", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": charPage });

  const component = await mount(<NewChatPickerStory />);

  await expect(component.getByText("Aria")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();
  await expect(page.getByText("Blank chat")).toBeVisible();
});

test("the confirm item's label reflects the multi-select count", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": charPage });

  const component = await mount(<NewChatPickerStory />);
  // Nothing picked yet — the confirm item teaches.
  await expect(component.getByText("Pick a character to start")).toBeVisible();

  await component.getByText("Aria").click();
  await expect(page.getByText("Start chat with 1 character")).toBeVisible();

  await component.getByText("Bolt").click();
  await expect(page.getByText("Start chat with 2 characters")).toBeVisible();
});

test("the search input filters the character rows", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": characterListResponder([ARIA, BOLT]) });

  const component = await mount(<NewChatPickerStory />);
  await expect(component.getByText("Aria")).toBeVisible();

  // cmdk owns the input's ARIA (combobox); there is exactly one per surface (its own CT queries it
  // name-less too — the aria-label doesn't resolve as the accessible name through cmdk's wiring).
  await component.getByRole("combobox").fill("bolt");
  await expect(component.getByText("Bolt")).toBeVisible();
  await expect(page.getByText("Aria")).toBeHidden();
});

// THE OWNER'S SECOND P1 SURFACE: the picker's own bounded page. The pin is a character who is NOT on the
// first page — under the old one-page-plus-cmdk shape she was unreachable from "new chat" no matter what
// was typed, which is exactly how the owner "found her in the new-chat window" only by luck.
const DEEP_LIBRARY = [
  ...Array.from({ length: 120 }, (_unused, at) => makeCharacterSummary({ id: `char_bulk_${String(at)}`, name: `Bulk ${String(at)}` })),
  makeCharacterSummary({ id: "char_deep", name: "Zephyrine" }),
];

test("typing reaches the WHOLE library — a character past the first page is findable", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "character.list": characterListResponder(DEEP_LIBRARY) });

  const component = await mount(<NewChatPickerStory />);
  await expect(component.getByText("Bulk 0")).toBeVisible();
  // She is beyond the picker's page ceiling, so she is NOT in the DOM to be filtered client-side.
  await expect(component.getByText("Zephyrine")).toHaveCount(0);

  await component.getByRole("combobox").fill("zephyr");

  await expect.poll(() => (trpc.lastInput("character.list") as { search?: string } | undefined)?.search, { intervals: [50, 100, 200] }).toBe("zephyr");
  await expect(component.getByText("Zephyrine")).toBeVisible();
});

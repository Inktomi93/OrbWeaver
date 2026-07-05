// CT: the J2 new-chat character picker end-to-end. Drives the PRODUCTION path — `character.list`
// (routeTrpc, one bounded page) → `useSuspenseQuery` in `<QueryBoundary>` → the cmdk multi-select list.
// Asserts: character rows render; the "Blank chat" escape hatch is present; the confirm item's label
// reflects the live selection count (proving the multi-select toggle is wired); the search input filters.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { makeCharacterSummary } from "../../character/fixtures";
import { NewChatPickerStory } from "../_ct-stories";

const ARIA = makeCharacterSummary({ id: "char_aria", name: "Aria" });
const BOLT = makeCharacterSummary({ id: "char_bolt", name: "Bolt" });

const charPage = { items: [ARIA, BOLT], nextCursor: null };

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
  await routeTrpc(page, { "character.list": charPage });

  const component = await mount(<NewChatPickerStory />);
  await expect(component.getByText("Aria")).toBeVisible();

  // cmdk owns the input's ARIA (combobox); there is exactly one per surface (its own CT queries it
  // name-less too — the aria-label doesn't resolve as the accessible name through cmdk's wiring).
  await component.getByRole("combobox").fill("bolt");
  await expect(component.getByText("Bolt")).toBeVisible();
  await expect(page.getByText("Aria")).toBeHidden();
});

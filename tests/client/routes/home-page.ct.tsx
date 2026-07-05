// CT: the `/` home route — the central navigation seam end-to-end (this route was untested before this
// task). Drives the PRODUCTION composition: the four-region shell, the active-chat store, and the
// character→chat seam. Asserts: the default chats section renders the draft-landing composer; and
// picking a character in the library STARTS a chat with it — the library writes the shared stores
// (startNewChat + setActiveSection), the route (the sole reader) flips CONTENT to a seeded chat room.
// This is the §5.1 anti-jank seam proven without a real generation (that's the e2e's job).
//
// tRPC is stubbed at the NETWORK (routeTrpc): `chat.listChats` (the docked LIST panel reads it on
// mount) + `character.list` (the library). No `chat.listMessages` stub is needed — every chat reached
// here is a DRAFT (no server row), so the transcript never reads the server.

import { expect, test } from "@playwright/experimental-ct-react";
import { testId } from "../../../packages/client/src/lib/test-ids";
import { routeTrpc } from "../../support/ct/route-trpc";
import { makeCharacterSummary } from "../features/character/fixtures";
import { HomePageStory } from "./_ct-stories";

const ARIA = makeCharacterSummary({ id: "char_home_aria", name: "Aria Nightshade" });

/** The library page (`character.list` is keyset-paged: `{items, nextCursor}`). */
const ONE_CHARACTER = { items: [ARIA], nextCursor: null };

test("the default chats section renders the draft-landing composer", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [] });
  const component = await mount(<HomePageStory />);

  // Landing = an empty draft chat: the composer is live, the transcript empty. No character picked yet.
  await expect(component.getByTestId(testId("composer"))).toBeVisible();
  await expect(component.getByText("No messages yet.")).toBeVisible();
});

test("picking a character in the library starts a chat with it (the library→chat seam)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { "chat.listChats": [], "character.list": ONE_CHARACTER });

  const component = await mount(<HomePageStory />);

  // Go to the Characters section (exact — "Characters" is a substring of "Collapse Characters panel").
  await component.getByRole("button", { name: "Characters", exact: true }).click();
  await expect(page.getByText("Aria Nightshade")).toBeVisible();
  // On the Characters section the chat composer is NOT mounted (CONTENT is the library).
  await expect(page.getByTestId(testId("composer"))).toHaveCount(0);

  // Start a chat with Aria → the store seam flips CONTENT back to a fresh, seeded chat room.
  await page.getByRole("button", { name: "Start chat with Aria Nightshade", exact: true }).click();

  // The route (the sole store reader) navigated to the Chats section: the composer is back, on a fresh
  // draft (empty transcript) seeded with Aria — ready for the first send to `startChat` with her.
  await expect(page.getByTestId(testId("composer"))).toBeVisible();
  await expect(page.getByText("No messages yet.")).toBeVisible();
});

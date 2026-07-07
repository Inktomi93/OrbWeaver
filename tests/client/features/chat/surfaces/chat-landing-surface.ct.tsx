// CT: the Chats-section LANDING surface end-to-end (J1). Drives the PRODUCTION path — `chat.listChats`
// + `character.list` (routeTrpc) → `useSuspenseQueries` in `<QueryBoundary>` → the hero + recents +
// quick-picks. Asserts: the hero renders; recents + quick-picks render; selecting a recent fires
// `onSelect`; a quick-pick fires `onStartChat`; the hero primary fires `onNewChat`; an empty DB swaps the
// primary to "Create your first character" (→ `onBrowseCharacters`).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { makeCharacterSummary } from "../../character/fixtures";
import { ChatLandingSurfaceStory } from "../_ct-stories";
import { makeChatSummary } from "../fixtures";

const RECENT = makeChatSummary({
  id: "chat_recent",
  title: "A grand adventure",
  // A participant name with no substring overlap with the quick-pick names (Aria/Bolt) so the
  // getByText assertions below stay unambiguous.
  participantNames: ["Wren"],
});
const ARIA = makeCharacterSummary({ id: "char_aria", name: "Aria" });
const BOLT = makeCharacterSummary({ id: "char_bolt", name: "Bolt" });

const charPage = { items: [ARIA, BOLT], nextCursor: null };

test("renders the hero, recents, and character quick-picks", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [RECENT], "character.list": charPage });

  const component = await mount(<ChatLandingSurfaceStory />);

  await expect(component.getByText("Pick up a thread")).toBeVisible();
  await expect(component.getByText("Recent chats")).toBeVisible();
  await expect(component.getByText("A grand adventure")).toBeVisible();
  await expect(component.getByText("Wren")).toBeVisible();
  await expect(component.getByText("Aria")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();
});

test("with the LIST docked (showRecents=false) the landing drops its Recent chats — no duplicate (#13)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { "chat.listChats": [RECENT], "character.list": charPage });

  const component = await mount(<ChatLandingSurfaceStory showRecents={false} />);

  // The hero + the "Start a chat" quick-picks still render — only the recents FINDER is dropped, because
  // the docked LIST already is it (§4.3 rule 5). A recent that WOULD show (RECENT is stubbed) must not.
  await expect(component.getByText("Pick up a thread")).toBeVisible();
  await expect(component.getByText("Start a chat")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();
  await expect(component.getByText("Recent chats")).toHaveCount(0);
  await expect(component.getByText("A grand adventure")).toHaveCount(0);
});

test("selecting a recent chat fires onSelect with that id", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [RECENT], "character.list": charPage });

  const component = await mount(<ChatLandingSurfaceStory />);
  await component.getByText("A grand adventure").click();

  await expect(page.getByTestId("selected")).toHaveText("chat_recent");
});

test("a character quick-pick fires onStartChat with that character id", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [RECENT], "character.list": charPage });

  const component = await mount(<ChatLandingSurfaceStory />);
  await component.getByText("Bolt").click();

  await expect(page.getByTestId("started")).toHaveText("char_bolt");
});

test("the hero primary fires onNewChat when characters exist", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [RECENT], "character.list": charPage });

  const component = await mount(<ChatLandingSurfaceStory />);
  await component.getByRole("button", { name: "Start a new chat" }).click();

  await expect(page.getByTestId("new-count")).toHaveText("1");
});

test("an empty DB swaps the primary to 'Create your first character' → onBrowseCharacters", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "chat.listChats": [],
    "character.list": { items: [], nextCursor: null },
  });

  const component = await mount(<ChatLandingSurfaceStory />);
  const create = component.getByRole("button", { name: "Create your first character" });
  await expect(create).toBeVisible();
  await create.click();

  await expect(page.getByTestId("browsed")).toHaveText("1");
});

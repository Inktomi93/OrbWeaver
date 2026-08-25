// CT: the Characters section's IA — what each shell region IS, and what a selection does to them (#501,
// owner ruling 2026-08-22 "library stays docked"). Driven through the REAL section registry
// (`registry.get("characters").list()` / `.listHeader()` / `.context`), which is the production path: the
// `makeCharactersSection` door param, the chat-owned projection threaded in at the door, and the shell's own
// `SectionContextHost`. A bespoke mount of any one component would prove none of it.
//
// What it pins:
//   · the LIST pane is the LIBRARY in both arms — a selection no longer swaps it to her chats (the defect:
//     the section whose job is browsing 327 characters lost the library on every pick);
//   · the BAND has one mode — `CHARACTERS` + the create primary — and never grows a back chevron;
//   · her chats are a CONTEXT tab, carrying the same server-narrowed projection the LIST used to;
//   · the hero's "N chats ›" LANDS there (the re-pointed intent, asserted through the rendered tab state,
//     not through the store write).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { chatListResponder, makeChatSummary, makeSeatPortrait } from "../../chat/fixtures.ts";
import { CharactersContextStory, CharactersListStory, CharactersScreenStory } from "../_ct-stories.tsx";
import { makeCharacterDetail, makeCharacterSummary } from "../fixtures.ts";

const AZARAEL = "char_ct_azarael0001";
const SERA = "char_ct_sera00000001";

const CHARACTER_PAGE = {
  items: [makeCharacterSummary({ id: AZARAEL, name: "Azarael", createdAt: 2000 }), makeCharacterSummary({ id: SERA, name: "Sera", createdAt: 1000 })],
  nextCursor: null,
  totalCount: 2,
};

const SETTINGS = { userId: "user_ct_pane", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };

/** The band + the context tabs + the editor all read this key; the editor seeds every field off it. */
const AZARAEL_DETAIL = makeCharacterDetail({ id: AZARAEL, handle: castId<CharacterHandle>("azarael"), name: "Azarael" });

const HER_CHAT = makeChatSummary({
  id: "chat_ct_newest",
  title: "Winter court",
  participantCharacterIds: [AZARAEL],
  participantNames: ["Azarael"],
  participantPortraits: [makeSeatPortrait(AZARAEL, "Azarael")],
  lastMessageAt: 300,
  updatedAt: 300,
});

async function routeAll(page: Page): Promise<void> {
  await routeTrpc(page, {
    "character.list": () => CHARACTER_PAGE,
    "character.get": () => AZARAEL_DETAIL,
    "character.update": () => AZARAEL_DETAIL,
    "chat.listChats": chatListResponder([HER_CHAT]),
    "settings.getUserSettings": () => SETTINGS,
    "worldInfo.listForCharacter": () => [],
    "persona.listConnectedToCharacter": () => [],
    "regex.listForCharacter": () => [],
    // #649 — the editor pane's STAGED tag-suggestion read was the last unfed one here, so the suggestion
    // tier ran INERT on `routeTrpc`'s null. Empty is the honest default (nothing staged for this card).
    "tag.listPendingSuggestions": () => [],
  });
}

test("nothing selected: the LIST pane is the library and the band names the section with its ONE create primary", async ({ mount, page }) => {
  await routeAll(page);
  const component = await mount(<CharactersListStory />);

  await expect(component.getByText("Azarael", { exact: true })).toBeVisible();
  await expect(component.getByText("Sera", { exact: true })).toBeVisible();
  const band = page.getByTestId("list-band");
  await expect(band.getByRole("heading", { level: 2 })).toContainText("Characters");
  await expect(band.getByRole("heading", { level: 2 })).not.toContainText("Chats");
  await expect(band.getByRole("button", { name: "Back to all characters" })).toHaveCount(0);
  await expect(band.getByRole("button", { name: "New chat" })).toHaveCount(0);
});

// THE #501 PIN. Pre-#501 this arm rendered her CHATS in this slot and the picker was gone — "Sera" (the
// character you might look at next) had no row, and the band carried a back chevron to get her back.
test("a selection LEAVES THE LIBRARY DOCKED — every other character is still one click away", async ({ mount, page }) => {
  await routeAll(page);
  const component = await mount(<CharactersListStory selectedCharacterId={AZARAEL} />);

  // The library, whole: the open character AND the one you would look at next.
  await expect(component.getByRole("button", { name: "Azarael", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Sera", exact: true })).toBeVisible();
  // …and her chats did NOT take the slot.
  await expect(component.getByText("Winter court")).toHaveCount(0);

  // The band has one mode: no back chevron to un-swap, no second create primary competing with New.
  const band = page.getByTestId("list-band");
  await expect(band.getByRole("heading", { level: 2 })).toContainText("Characters");
  await expect(band.getByRole("heading", { level: 2 })).not.toContainText("Chats");
  await expect(band.getByRole("button", { name: "Back to all characters" })).toHaveCount(0);
  await expect(band.getByRole("button", { name: "New chat" })).toHaveCount(0);
});

// …and the history the LIST stopped carrying is reachable, in CONTEXT, with the SAME rows.
test("her chats are a CONTEXT tab, carrying the server-narrowed projection", async ({ mount, page }) => {
  await routeAll(page);
  const component = await mount(<CharactersContextStory selectedCharacterId={AZARAEL} />);

  const chatsTab = component.getByRole("tab", { name: "Chats" });
  await expect(chatsTab).toBeVisible();
  await chatsTab.click();
  await expect(component.getByText("Winter court")).toBeVisible();
  // The rows still name WHOSE chats these are, for a rotor reader — the identity ROW is gone (CONTENT
  // prints her portrait and name), the accessible name is not. ONE node carries it, not two.
  await expect(component.getByRole("list", { name: "Chats with Azarael" })).toBeVisible();
});

// The hero's "N chats ›" was a LIST intent (dock the pane her chats had become). It is a CONTEXT intent now,
// and the pin is the RENDERED landing — the tab the user ends up on — never the store write that got there.
test('the editor hero\'s "N chats ›" lands on the CONTEXT Chats tab', async ({ mount, page }) => {
  await routeAll(page);
  const component = await mount(<CharactersScreenStory deepLinkCharacterId={AZARAEL} />);

  await component.getByRole("button", { name: "Azarael", exact: true }).click();
  // Settled: the editor is up (its own read resolved) before anything is clicked in it.
  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Azarael");
  const context = component.getByTestId("context-region");
  // The resting tab is Field — the overview card, not her chats.
  await expect(context.getByRole("tab", { name: "Field" })).toHaveAttribute("aria-selected", "true");

  // The hero prints her census as the link's own name — one chat in this fixture.
  await component.getByTestId("content-region").getByRole("button", { name: "1 chat", exact: true }).click();

  await expect(context.getByRole("tab", { name: "Chats" })).toHaveAttribute("aria-selected", "true");
  await expect(context.getByText("Winter court")).toBeVisible();
});

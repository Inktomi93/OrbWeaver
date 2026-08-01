// CT: the Characters MODAL LIST pane (list-pane-projection Arm A). Drives the PRODUCTION path — the real
// section registry's `list()`/`listHeader()` closures, the `makeCharactersSection` door param, and the
// chat-owned projection body threaded in at the door — over the network-stubbed `character.list`,
// `character.get` and `chat.listChats`.
//
// What it pins:
//   · the SWAP — no selection = the picker; a selection = her chats, in the same slot (D2, unconditional);
//   · the projection rows ARE `chatsWithCharacter(cache)` — a chat she LEFT is in (departed seats), a chat
//     she was never in is out, and the ORDER is the server's (D4, never re-sorted);
//   · the band swaps with the pane (D9): `CHARACTERS` + create ⇄ `‹ CHATS · <name>` + New chat;
//   · New chat fires the STORE ACTION with her id (the draft cast + the section switch), not a UI echo;
//   · back deselects AND restores focus to her row in the library — a swap that drops focus to <body> is
//     a defect (§3.7), so this is a behavioural assertion, not a class check;
//   · the empty projection TEACHES and ACTS (empty states are load-bearing).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { CharactersListPaneStory } from "../_ct-stories";
import { makeCharacterSummary } from "../fixtures";

const AZARAEL = "char_ct_azarael0001";
const SERA = "char_ct_sera00000001";

const CHARACTER_PAGE = {
  items: [makeCharacterSummary({ id: AZARAEL, name: "Azarael", createdAt: 2000 }), makeCharacterSummary({ id: SERA, name: "Sera", createdAt: 1000 })],
  nextCursor: null,
};

const SETTINGS = { userId: "user_ct_pane", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };

/** `character.get` is the band + identity-row read; the editor beside the pane suspends on the same key. */
const AZARAEL_DETAIL = { ...makeCharacterSummary({ id: AZARAEL, name: "Azarael" }), description: "", personality: "", scenario: "", greetings: [] };

function chat(fields: { id: string; title: string; seats: readonly string[]; lastMessageAt: number }): Record<string, unknown> {
  return {
    id: fields.id,
    title: fields.title,
    star: false,
    archived: false,
    parentChatId: null,
    lastMessageAt: fields.lastMessageAt,
    messageCount: 3,
    participantNames: ["Alex"],
    participantCharacterIds: fields.seats,
    lastMessagePreview: null,
    isGame: false,
    viewerRole: "host",
    createdAt: 0,
    updatedAt: fields.lastMessageAt,
  };
}

// Server order = newest-updated first. "The Gilded Ember" is a room Azarael has SINCE LEFT: her seat id is
// still on the row (the contract's departed-seat guarantee) while the present cast is someone else.
const HER_NEWEST = chat({ id: "chat_ct_newest", title: "Winter court", seats: [AZARAEL], lastMessageAt: 300 });
const HER_DEPARTED = chat({ id: "chat_ct_left", title: "The Gilded Ember", seats: [AZARAEL, SERA], lastMessageAt: 200 });
const NOT_HERS = chat({ id: "chat_ct_other", title: "Sera alone", seats: [SERA], lastMessageAt: 250 });
const CHATS = [HER_NEWEST, NOT_HERS, HER_DEPARTED];

const ROW_TITLE = '[data-slot="list-row-title"]';
const LIST_ROW_ROOT = '[data-slot="list-row-root"]';
const AVATAR_STACK = '[data-slot="avatar-stack-root"]';

function routeAll(page: Parameters<typeof routeTrpc>[0], chats: readonly Record<string, unknown>[]): ReturnType<typeof routeTrpc> {
  return routeTrpc(page, {
    "character.list": () => CHARACTER_PAGE,
    "character.get": () => AZARAEL_DETAIL,
    "chat.listChats": () => chats,
    "settings.getUserSettings": () => SETTINGS,
  });
}

test("no selection: the pane is the PICKER and the band names the section with its ONE create primary", async ({ mount, page }) => {
  await routeAll(page, CHATS);
  const component = await mount(<CharactersListPaneStory />);

  await expect(component.getByText("Azarael", { exact: true })).toBeVisible();
  await expect(component.getByText("Sera", { exact: true })).toBeVisible();
  const band = page.getByTestId("list-band");
  await expect(band.getByRole("heading", { level: 2 })).toHaveText("Characters");
  // The projection chrome is absent in this mode — no back, no New chat.
  await expect(band.getByRole("button", { name: "Back to all characters" })).toHaveCount(0);
  await expect(band.getByRole("button", { name: "New chat" })).toHaveCount(0);
});

test("a selection SWAPS the same slot to her chats — the rows are exactly the projection, in server order", async ({ mount, page }) => {
  await routeAll(page, CHATS);
  const component = await mount(<CharactersListPaneStory selectedCharacterId={AZARAEL} />);

  await expect(component.getByText("Winter court")).toBeVisible();
  // The projection, exactly: her two rows (INCLUDING the room she left — departed seats are history), the
  // room she was never in excluded, and the server's recency order preserved (D4).
  await expect(component.locator(ROW_TITLE)).toHaveText(["Winter court", "The Gilded Ember"]);
  // The picker is GONE — one slot, two roles, not two lists stacked.
  await expect(component.getByRole("button", { name: "Sera", exact: true })).toHaveCount(0);
});

test("D3 the projection INHERITS the shared row upgrade: a multi-seat room stacks, a 1:1 does not", async ({ mount, page }) => {
  await routeAll(page, CHATS);
  const component = await mount(<CharactersListPaneStory selectedCharacterId={AZARAEL} />);
  await expect(component.getByText("Winter court")).toBeVisible();

  // One row anatomy, both surfaces (no fork): the 2-seat room she left stacks, her 1:1 keeps one portrait.
  await expect(component.locator(LIST_ROW_ROOT, { hasText: "The Gilded Ember" }).locator(AVATAR_STACK)).toBeVisible();
  await expect(component.locator(LIST_ROW_ROOT, { hasText: "Winter court" }).locator(AVATAR_STACK)).toHaveCount(0);
});

test("the band swaps with the pane (D9): back + CHATS · <name> + the New-chat primary", async ({ mount, page }) => {
  await routeAll(page, CHATS);
  await mount(<CharactersListPaneStory selectedCharacterId={AZARAEL} />);

  const band = page.getByTestId("list-band");
  await expect(band.getByRole("heading", { level: 2 })).toContainText("Azarael");
  await expect(band.getByRole("heading", { level: 2 })).toContainText("Chats");
  await expect(band.getByRole("button", { name: "Back to all characters", exact: true })).toBeVisible();
  // ONE primary for the mode — the character-create menu does not linger under her chats.
  await expect(band.getByRole("button", { name: "New chat", exact: true })).toBeVisible();
});

test("New chat fires the STORE action with her id (a seeded draft + the section switch), not a UI echo", async ({ mount, page }) => {
  await routeAll(page, CHATS);
  const component = await mount(<CharactersListPaneStory selectedCharacterId={AZARAEL} />);
  await expect(component.getByText("Winter court")).toBeVisible();

  await page.getByTestId("list-band").getByRole("button", { name: "New chat", exact: true }).click();

  await expect(component.getByTestId("draft-cast")).toHaveText(AZARAEL);
  await expect(component.getByTestId("active-section")).toHaveText("chats");
});

test("back deselects AND restores focus to her row in the library (§3.7 — never <body>)", async ({ mount, page }) => {
  await routeAll(page, CHATS);
  const component = await mount(<CharactersListPaneStory selectedCharacterId={AZARAEL} />);
  await expect(component.getByText("Winter court")).toBeVisible();

  await page.getByTestId("list-band").getByRole("button", { name: "Back to all characters", exact: true }).click();

  // The picker is back…
  await expect(component.getByRole("button", { name: "Sera", exact: true })).toBeVisible();
  // …and focus landed on HER row, not the pane container and not <body>.
  await expect(component.getByRole("button", { name: "Azarael", exact: true })).toBeFocused();
});

// §3.7's forward half — the mirror of the back-focus test above. Entering the projection is a pane SWAP,
// and the click that triggers it UNMOUNTS the row the user pressed, so `document.activeElement` is already
// `<body>` by the time the new pane mounts: a guarded "only steal focus if something was focused" hook
// reads that as a cold page load and silently skips (side-eye P1-1). Behavioural, not a class check.
test("selecting a character moves focus INTO the projection (§3.7 — never left on <body>)", async ({ mount, page }) => {
  await routeAll(page, CHATS);
  const component = await mount(<CharactersListPaneStory />);

  await component.getByRole("button", { name: "Azarael", exact: true }).click();
  await expect(component.getByText("Winter court")).toBeVisible();

  // Polled: focus lands in a mount effect, so a single snapshot samples the transition and flakes.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const active = document.activeElement;
          const pane = document.querySelector('[data-slot="character-chats-projection"]');
          return { onBody: active === document.body, inside: pane !== null && active !== null && pane.contains(active) };
        }),
      { intervals: [20, 50, 100] },
    )
    .toEqual({ onBody: false, inside: true });
});

test("a character with no chats gets an empty state that teaches AND acts", async ({ mount, page }) => {
  await routeAll(page, [NOT_HERS]);
  const component = await mount(<CharactersListPaneStory selectedCharacterId={AZARAEL} />);

  // The identity gloss says "no chats yet" too, so pin the EMPTY-STATE title by its slot.
  await expect(component.locator('[data-slot="empty-state-title"]')).toHaveText("No chats yet");
  await expect(component.getByText("No chats with Azarael yet — start the first one.")).toBeVisible();
  // Empty is never a dead end: its own action (distinct from the band's) fires the same store write.
  await component.getByLabel("Chats with Azarael").getByRole("button", { name: "New chat", exact: true }).click();
  await expect(component.getByTestId("draft-cast")).toHaveText(AZARAEL);
});

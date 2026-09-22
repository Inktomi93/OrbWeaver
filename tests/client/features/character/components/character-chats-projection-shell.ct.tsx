// CT: the chats-with-this-character PROJECTION, in the CONTEXT **Chats** tab it moved to (#501; these pins
// lived in `characters-list-pane.ct.tsx` while the LIST pane WAS the projection — that file is gone with the
// swap, and every arm below that was about the SWAP went with it, per the manifest's `deletions` entry).
// Driven through the REAL section registry + the shell's own `SectionContextHost`, so the door-injected
// chat-owned body is the production one.
//
// What it pins:
//   · the rows are the SERVER'S `characterId` narrowing (it used to be a client filter over the whole
//     library) — a chat she LEFT is IN (departed seats are history), a chat she was never in is OUT, and the
//     ORDER is the server's (D4, never re-sorted). The stub honours the input (`chatListResponder`), so
//     these arms still fail if the pane stops asking for her;
//   · the shared row upgrade lands here too (D3): a multi-seat room stacks, a 1:1 does not;
//   · the empty projection TEACHES and ACTS — and its action is now the region's ONE primary, because the
//     LIST band that used to carry it is not above this pane any more;
//   · same-titled rows whose stamps ALSO collide still expose distinct action names (this pane is THE
//     collision case: every row can be titled with her name).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import type { TrpcFixtureOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import type { ScopedChatSummaryFixture } from "../../chat/fixtures.ts";
import { chatListResponder, makeChatSummary, makeSeatPortrait } from "../../chat/fixtures.ts";
import { CharactersContextStory } from "../_ct-stories.tsx";
import { makeCharacterDetail } from "../fixtures.ts";

const AZARAEL = "char_ct_azarael0001";
const SERA = "char_ct_sera00000001";

const SETTINGS = { userId: "user_ct_ctx", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null };
const AZARAEL_DETAIL = makeCharacterDetail({ id: AZARAEL, handle: castId<CharacterHandle>("azarael"), name: "Azarael" });

/** The row's cast as the SERVER sends it: the viewer's own seat is suppressed while another seat remains. */
const CAST_BY_SEAT: Record<string, string> = { [AZARAEL]: "Azarael", [SERA]: "Sera" };

/** `seats` feeds the responder's harness-only character scope and deliberately KEEPS a departed seat.
 *  `present` is who is still in the room, i.e. the row's own faces (`participantPortraits`, #192); it
 *  defaults to `seats` for a room nobody has left. */
function chat(fields: { id: string; title: string; seats: readonly string[]; present?: readonly string[]; lastMessageAt: number }): ScopedChatSummaryFixture {
  const present = fields.present ?? fields.seats;
  return makeChatSummary({
    id: fields.id,
    title: fields.title,
    lastMessageAt: fields.lastMessageAt,
    updatedAt: fields.lastMessageAt,
    participantNames: fields.seats.map((seat) => CAST_BY_SEAT[seat] ?? seat),
    filterCharacterIds: fields.seats,
    participantPortraits: present.map((seat) => makeSeatPortrait(seat, CAST_BY_SEAT[seat] ?? seat)),
  });
}

// Server order = newest-updated first. "The Gilded Ember" is a room Azarael has SINCE LEFT: her seat id is
// still in the responder's filter scope while the present characters is someone else.
const HER_NEWEST = chat({ id: "chat_ct_newest", title: "Winter court", seats: [AZARAEL], lastMessageAt: 300 });
const HER_DEPARTED = chat({ id: "chat_ct_left", title: "The Gilded Ember", seats: [AZARAEL, SERA], present: [SERA], lastMessageAt: 200 });
/** A room with TWO seats still IN it — the stack arm of D3. */
const HER_GROUP = chat({ id: "chat_ct_group", title: "The Crimson Court", seats: [AZARAEL, SERA], lastMessageAt: 150 });
const NOT_HERS = chat({ id: "chat_ct_other", title: "Sera alone", seats: [SERA], lastMessageAt: 250 });
const CHATS = [HER_NEWEST, NOT_HERS, HER_DEPARTED];

const ROW_TITLE = '[data-slot="list-row-title"]';
const LIST_ROW_ROOT = '[data-slot="list-row-root"]';
const AVATAR_STACK = '[data-slot="avatar-stack-root"]';
/** Every per-row kebab, by the shape of its name ("Chat actions for <subject>"). */
const ANY_ROW_MENU = /^Chat actions for /;
/** The page clock the stamp test pins — never an ambient wall-clock read (test-determinism gate). */
const FROZEN_NOW = FROZEN_AT_MS;
const HOUR_MS = 3_600_000;

/** R1: New chat mints a REAL room — the minimal ChatDetail the startChat responder returns. */
const CREATED_CHAT_ID = "chat_ctx_created";
const CREATED_CHAT: TrpcFixtureOutput<"chat.startChat">["chat"] = {
  id: CREATED_CHAT_ID,
  title: null,
  participants: [],
  anchorPersonaId: null,
  identities: [],
  temporary: false,
  viewerIsHost: true,
  roomOverrides: {},
  background: null,
  rpg: null,
};

function routeAll(page: Page, chats: readonly ScopedChatSummaryFixture[]): ReturnType<typeof routeTrpc> {
  return routeTrpc(page, {
    "character.get": () => AZARAEL_DETAIL,
    "chat.listChats": chatListResponder(chats),
    "chat.startChat": { chat: CREATED_CHAT, opening: null },
    "settings.getUserSettings": () => SETTINGS,
    "worldInfo.listForCharacter": () => [],
    "persona.listConnectedToCharacter": () => [],
  });
}

/** Every arm starts by opening the Chats tab — the pane rests on Field (the overview card). */
async function openChatsTab(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Chats", exact: true }).click();
}

test("the rows are exactly her projection, in server order", async ({ mount, page }) => {
  await routeAll(page, CHATS);
  const component = await mount(<CharactersContextStory selectedCharacterId={AZARAEL} />);
  await openChatsTab(page);

  await expect(component.getByText("Winter court")).toBeVisible();
  // Her two rows (INCLUDING the room she left — departed seats are history), the room she was never in
  // excluded, and the server's recency order preserved (D4).
  await expect(component.locator(ROW_TITLE)).toHaveText(["Winter court", "The Gilded Ember"]);
});

test("D3 the projection INHERITS the shared row upgrade: a multi-seat room stacks, a 1:1 does not", async ({ mount, page }) => {
  await routeAll(page, [HER_NEWEST, HER_GROUP, HER_DEPARTED]);
  const component = await mount(<CharactersContextStory selectedCharacterId={AZARAEL} />);
  await openChatsTab(page);
  await expect(component.getByText("Winter court")).toBeVisible();

  await expect(component.locator(LIST_ROW_ROOT, { hasText: "The Crimson Court" }).locator(AVATAR_STACK)).toBeVisible();
  await expect(component.locator(LIST_ROW_ROOT, { hasText: "Winter court" }).locator(AVATAR_STACK)).toHaveCount(0);
  // …and the room she LEFT paints the seat that remains, not the departed seat retained only by the
  // responder's character scope (#192): a face would claim she is still in the room.
  await expect(component.locator(LIST_ROW_ROOT, { hasText: "The Gilded Ember" }).locator(AVATAR_STACK)).toHaveCount(0);
});

// P2c: this pane is the collision case — every row can be titled "Azarael", and the newest few share a
// stamp, so the per-row qualifier produced N identical accessible names. The escalation is resolved across
// the LIST, so the rendered names are distinct.
test("same-titled rows whose stamps ALSO collide still expose distinct action names", async ({ mount, page }) => {
  // The stamp is clock-relative, so the page clock is pinned: both rows land in the SAME "1h" bucket, which
  // is exactly the collision (a minute apart, indistinguishable on screen).
  await page.clock.setFixedTime(FROZEN_NOW);
  const twins = [
    chat({ id: "chat_ct_twin_a", title: "Azarael", seats: [AZARAEL], lastMessageAt: FROZEN_NOW - HOUR_MS }),
    chat({ id: "chat_ct_twin_b", title: "Azarael", seats: [AZARAEL], lastMessageAt: FROZEN_NOW - HOUR_MS - 60_000 }),
  ];
  await routeAll(page, twins);
  const component = await mount(<CharactersContextStory selectedCharacterId={AZARAEL} />);
  await openChatsTab(page);
  await expect(component.locator(ROW_TITLE)).toHaveText(["Azarael", "Azarael"]);

  const names = await page.getByRole("button", { name: ANY_ROW_MENU }).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  expect(names).toHaveLength(2);
  expect(new Set(names).size).toBe(2);
});

// NR2 + #501: the empty pane says it ONCE — and its action, which demoted to secondary while a LIST band
// carried the region's primary, is the primary again now that this pane has no band above it.
test("an EMPTY projection is ONE statement whose action is the region's primary — and it still acts", async ({ mount, page }) => {
  const trpc = await routeAll(page, [NOT_HERS]);
  const component = await mount(<CharactersContextStory selectedCharacterId={AZARAEL} />);
  await openChatsTab(page);

  await expect(component.locator('[data-slot="empty-state-title"]')).toHaveText("No chats yet");
  await expect(component.getByText("No chats with Azarael yet — start the first one.")).toBeVisible();
  // `data-cta` is the primary CTA's own marker (the accent ring keys off it), so this is the rendered tell,
  // not a class check.
  const paneAction = component.getByRole("button", { name: "New chat", exact: true });
  await expect(paneAction).toHaveAttribute("data-cta", "");

  // Empty is never a dead end: it mints the same real room, with HER id on the wire.
  await paneAction.click();
  await expect.poll(() => trpc.lastInput("chat.startChat"), { intervals: [20, 50, 100] }).toMatchObject({ characterIds: [AZARAEL] });
  await expect(component.getByTestId("started-chat")).toHaveText(CREATED_CHAT_ID);
  await expect(component.getByTestId("active-section")).toHaveText("chats");
});

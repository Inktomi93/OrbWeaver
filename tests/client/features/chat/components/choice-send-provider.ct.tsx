// CT: the P5 CYOA choice provider's send-vs-compose BRANCH (§5.4). Drives the real `<ChoiceSendProvider>`
// over the real data layer (routeTrpc stubs `rpg.getGame` + `chat.send`) — the ChoiceProviderStory wires
// the real choices block AND a real `<Composer>` reading the real composer-draft store, so each branch is
// asserted at its true effect ([assert-the-mutation-fired]): `send` fires `chat.send` (composer stays
// empty); `compose` seeds the composer draft (the textarea shows the option text) and fires NO send.
//
// The knob rides `rpg.getGame.publicConfig.cyoaChoiceBehavior`. The first choice option is
// "Draw your blade." (the CHOICES_BODY fence in _ct-stories).

import type { RpgCyoaChoiceBehavior, RpgGameView } from "@orb/contracts/rpg";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { makeRpgGameView } from "../../rpg/fixtures.ts";
import { ChoiceProviderStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ROOM_ROUTES, COMPOSER_CHAT_ID } from "../fixtures.ts";

// `rpg.getGame` for the room the provider reads; `behavior` is the knob under test and every other knob is
// the born game's own default.
//
// IT IS THE REAL `RpgGameView`, BUILT BY THE BIRTH DERIVATION (#900). The literal this replaced returned
// `unknown` and was missing `canPopulate`, `publicConfig.ruleset` and `publicConfig.dateMode` — three
// REQUIRED members of the view — while spelling a `statProfile` of one field out of six. None of it changed
// this file's verdict (the branch keys on `cyoaChoiceBehavior` alone), which is precisely why it survived:
// a fixture the server cannot mint is a green pin over a product nobody ships.
function gameView(behavior: RpgCyoaChoiceBehavior): RpgGameView {
  return makeRpgGameView(COMPOSER_CHAT_ID, {
    extractionMode: "cheap",
    features: { immersiveHtml: true, cyoa: true, cyoaChoiceBehavior: behavior, plotProgression: true },
  });
}

const FIRST_OPTION = "Draw your blade.";

// The provider's game gate (`8eb6e427`) reads `chat.getChat.rpg` through `isRpgEngaged` BEFORE it fires
// `rpg.getGame` — it only queries the game (and thus honors the `send` knob) on a LIVE game room. So the
// story's room must present an ENGAGED rpg pointer here, or the provider falls back to `compose` and never
// sends. (The prod fix that added this gate stopped `rpg.getGame` 404-looping on non-game chats.)
const engagedRpgPointer = { rpg: { gameId: "rpg_game_ct", engaged: true } };

test("cyoaChoiceBehavior:send — a choice click fires chat.send with the option text; the composer stays empty", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": () => engagedRpgPointer,
    "rpg.getGame": () => gameView("send"),
    "chat.send": () => ({ ok: true }),
  });
  const component = await mount(<ChoiceProviderStory />);

  await component.getByRole("button", { name: `1. ${FIRST_OPTION}` }).click();

  await expect.poll(() => trpc.count("chat.send"), { intervals: [20, 50, 100] }).toBe(1);
  const readInputAtAssertion = async (): Promise<typeof input> => trpc.lastInput("chat.send") as { readonly content?: string };
  const input = trpc.lastInput("chat.send") as { readonly content?: string };
  await expect.poll(async () => (await readInputAtAssertion()).content).toBe(FIRST_OPTION);
  // send mode never touches the composer draft.
  await expect(component.getByLabel("Message", { exact: true })).toHaveValue("");
});

test("cyoaChoiceBehavior:compose — a choice click seeds the composer draft with the option text and fires NO send", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": () => engagedRpgPointer,
    "rpg.getGame": () => gameView("compose"),
    "chat.send": () => ({ ok: true }),
  });
  const component = await mount(<ChoiceProviderStory />);

  await component.getByRole("button", { name: `1. ${FIRST_OPTION}` }).click();

  // The option text lands in the composer draft (observable in the real textarea) — the reader appends flavor.
  await expect(component.getByLabel("Message", { exact: true })).toHaveValue(FIRST_OPTION);
  // compose mode never fires a turn.
  // Settled snapshot: the draft-set is synchronous in the click handler; once toHaveValue settles the handler has
  // fully run, and compose mode never calls send() — no chat.send request can be in flight, so the count is
  // provably 0 and cannot change (settled read of a negative, not a mid-transition sample).
  await expect.poll(async () => trpc.count("chat.send")).toBe(0);
});

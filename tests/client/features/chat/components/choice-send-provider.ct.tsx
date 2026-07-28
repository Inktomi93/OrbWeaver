// CT: the P5 CYOA choice provider's send-vs-compose BRANCH (§5.4). Drives the real `<ChoiceSendProvider>`
// over the real data layer (routeTrpc stubs `rpg.getGame` + `chat.send`) — the ChoiceProviderStory wires
// the real choices block AND a real `<Composer>` reading the real composer-draft store, so each branch is
// asserted at its true effect ([assert-the-mutation-fired]): `send` fires `chat.send` (composer stays
// empty); `compose` seeds the composer draft (the textarea shows the option text) and fires NO send.
//
// The knob rides `rpg.getGame.publicConfig.cyoaChoiceBehavior`. The first choice option is
// "Draw your blade." (the CHOICES_BODY fence in _ct-stories).

import type { RpgCyoaChoiceBehavior } from "@orb/contracts/rpg";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChoiceProviderStory } from "../_ct-stories";
import { COMPOSER_CHAT_ID } from "../fixtures";

// `rpg.getGame` shaped as the publicConfig slice the provider reads; `chatId` echoes the room. `behavior`
// is the knob under test; the other play-style fields are the defaults (irrelevant to the branch).
function gameView(behavior: RpgCyoaChoiceBehavior): unknown {
  return {
    id: "rpg_game_ct",
    chatId: COMPOSER_CHAT_ID,
    mode: "lite",
    status: "active",
    trackersReadOnly: false,
    extractionMode: "reliable",
    publicConfig: { statProfile: { attributes: [] }, immersiveHtml: true, cyoa: true, cyoaChoiceBehavior: behavior, plotProgression: true },
  };
}

const FIRST_OPTION = "Draw your blade.";

// The provider's game gate (`8eb6e427`) reads `chat.getChat.rpg` through `isRpgEngaged` BEFORE it fires
// `rpg.getGame` — it only queries the game (and thus honors the `send` knob) on a LIVE game room. So the
// story's room must present an ENGAGED rpg pointer here, or the provider falls back to `compose` and never
// sends. (The prod fix that added this gate stopped `rpg.getGame` 404-looping on non-game chats.)
const engagedRpgPointer = { rpg: { gameId: "rpg_game_ct", engaged: true } };

test("cyoaChoiceBehavior:send — a choice click fires chat.send with the option text; the composer stays empty", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => engagedRpgPointer,
    "rpg.getGame": () => gameView("send"),
    "chat.send": () => ({ ok: true }),
  });
  const component = await mount(<ChoiceProviderStory />);

  await component.getByRole("button", { name: `1. ${FIRST_OPTION}` }).click();

  await expect.poll(() => trpc.count("chat.send"), { intervals: [20, 50, 100] }).toBe(1);
  const input = trpc.lastInput("chat.send") as { readonly content?: string };
  expect(input.content).toBe(FIRST_OPTION);
  // send mode never touches the composer draft.
  await expect(component.getByLabel("Message", { exact: true })).toHaveValue("");
});

test("cyoaChoiceBehavior:compose — a choice click seeds the composer draft with the option text and fires NO send", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => engagedRpgPointer,
    "rpg.getGame": () => gameView("compose"),
    "chat.send": () => ({ ok: true }),
  });
  const component = await mount(<ChoiceProviderStory />);

  await component.getByRole("button", { name: `1. ${FIRST_OPTION}` }).click();

  // The option text lands in the composer draft (observable in the real textarea) — the reader appends flavor.
  await expect(component.getByLabel("Message", { exact: true })).toHaveValue(FIRST_OPTION);
  // compose mode never fires a turn.
  // ONESHOT-OK: the draft-set is synchronous in the click handler; once toHaveValue settles the handler has
  // fully run, and compose mode never calls send() — no chat.send request can be in flight, so the count is
  // provably 0 and cannot change (settled read of a negative, not a mid-transition sample).
  expect(trpc.count("chat.send")).toBe(0);
});

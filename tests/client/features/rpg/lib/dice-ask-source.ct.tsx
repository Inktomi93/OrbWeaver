// CT: B8 — the REAL rpg dice-ASK control source, end-to-end (interaction-direction-spec §7 row B8). Mirrors
// its source `packages/client/src/features/rpg/lib/dice-ask-source.tsx`.
//
// The band CT proves the S1 SEAM with a synthetic source; this proves the GAME-ARM consumer: `rpgDiceAskSource`
// appended to the `chat-controls` registry exactly as `authed-app.tsx` does it (the `RpgDiceAskStory`, wired
// the door's way through the real band and a real `ChatRoomSurface`). The source gates on `isRpgEngaged` off
// `chat.getChat.rpg`, so the whole path is exercised: an ENGAGED pointer opens the chips → an `execute` click
// rolls `rpg.rollDice` (server CSPRNG, bake-once) → the baked stamp is APPENDED to THIS room's composer draft
// for the member to send as their turn (canon). The acceptance arm is a PLAIN chat (`rpg: null`): no chips.
//
// Every assertion barriers on a SETTLED rendered state (the chip visible, the recorded roll, the composer's
// value) — never a draft-state read, never a mid-flight sample. Accessible names go through the band's
// `${CONTROL_MODE_WORD} ${label}` shape ("Run Roll d20"), since @orb/ui primitives drop `data-testid`.

import type { ChatIdentity, GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { RpgGameView, RpgRuleset } from "@orb/contracts/rpg";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { RpgDiceAskStory } from "../../chat/_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ID, makeMessagesPage, makeMessageView } from "../../chat/fixtures.ts";
import { makeRpgGameView } from "../fixtures.ts";

const CHIPS = '[data-slot="chat-control-chips"]';

/** The engaged room's OTHER game read (the composer's choice provider suspends on it once the game gate opens
 *  — the guided-cluster/choice CT precedent): the `publicConfig` slice those readers use. The dice source
 *  itself reads only `chat.getChat.rpg`, but the ROOM mounts game-aware chrome the moment the pointer engages,
 *  so an engaged mount must feed this or a suspending reader renders `QueryErrorState`.
 *
 *  THE VOCABULARY IS THE RULESET'S, NEVER THIS FILE'S (#900). This literal used to spell
 *  `statProfile: { attributes: [] }` beside `ruleset: "d20"` — a pair the birth path cannot mint (a d20 game is
 *  born carrying `RPG_RULESET_PROFILE.d20`), one `RpgStatProfile` field of six, with `dateMode` missing
 *  outright; the `unknown` return hid all three from tsc. {@link makeRpgGameView} runs the product's own birth
 *  derivation and answers the real `RpgGameView`. */
function gameView(ruleset: RpgRuleset): RpgGameView {
  return makeRpgGameView(CHAT_ID, { gameId: "rpg_game_ct_dice", ruleset, extractionMode: "cheap", features: { immersiveHtml: true } });
}

/** A baked `rpg.rollDice` outcome — the wire shape (`RollDiceResult`) verbatim. Network-stubbed, so a fixed
 *  roll; the stamp is what the source appends to the composer. */
function rollOutcome(notation: string, rolls: readonly number[], total: number): unknown {
  return { notation, rolls, modifier: 0, total, stamp: `[dice: ${notation} → ${total}]` };
}

/** The room floor (the band CT's own reads), plus the game-ness pointer the dice source gates on and the
 *  `rpg.rollDice` stub. `engaged` chooses whether `chat.getChat.rpg` presents a LIVE game. */
function routeRoom(
  page: Page,
  engaged: boolean,
  ruleset: RpgRuleset = "d20",
): Promise<{ readonly count: (p: string) => number; readonly lastInput: (p: string) => unknown }> {
  return routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    "chat.previewContextFit": (): unknown => ({
      boundaryMessageId: null,
      usedTokens: 120,
      ceilingTokens: 32_768,
      ceilingEstimated: false,
      reserveOutputTokens: 2048,
      droppedCount: 0,
      compactSummary: null,
    }),
    "chat.getChat": (): {
      participants: never[];
      anchorPersonaId: null;
      identities: readonly ChatIdentity[];
      group: GroupConfig;
      rpg: { gameId: string; engaged: boolean } | null;
    } => ({
      participants: [],
      anchorPersonaId: null,
      identities: [],
      group: DEFAULT_GROUP_CONFIG,
      rpg: engaged ? { gameId: "rpg_game_ct_dice", engaged: true } : null,
    }),
    "chat.listMessages": (): unknown =>
      makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_dice_room"), role: "assistant", content: "The corridor forks.", seq: 1 })]),
    // The engaged room's game-aware chrome suspends on getGame; a plain chat never asks for it (no unfed read).
    ...(engaged ? { "rpg.getGame": (): RpgGameView => gameView(ruleset) } : {}),
    "rpg.rollDice": (): unknown => rollOutcome("d20", [14], 14),
    "chat.send": (): unknown => ({ ok: true }),
  });
}

test("an engaged game chat surfaces the dice-ask chips above the composer", async ({ mount, page }) => {
  await routeRoom(page, true);

  const component = await mount(<RpgDiceAskStory />);

  // The room is really rendered (the discriminator) before the game-gated chips are trusted.
  await expect(component.getByText("The corridor forks.")).toBeVisible();
  // The four default dice, each an `execute` chip ("Run <label>" accessible name), on the real band.
  await expect(component.getByRole("button", { name: "Run Roll d20" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Run Roll d6" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Run Roll 2d6" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Run Roll d100" })).toBeVisible();
  // The chip row sits ABOVE the composer (the S1 anchor).
  const chipsBox = await component.locator(CHIPS).boundingBox();
  const composerBox = await component.getByRole("textbox", { name: "Message" }).boundingBox();
  expect((chipsBox?.y ?? 0) + (chipsBox?.height ?? 0)).toBeLessThanOrEqual(composerBox?.y ?? 0);
});

test("clicking a dice chip rolls rpg.rollDice for that notation and inserts the baked stamp into the composer", async ({ mount, page }) => {
  const trpc = await routeRoom(page, true);

  const component = await mount(<RpgDiceAskStory />);
  await component.getByRole("button", { name: "Run Roll d20" }).click();

  // The server roll fired for the clicked notation.
  await expect.poll(() => trpc.count("rpg.rollDice"), { intervals: [20, 50, 100] }).toBe(1);
  // ONESHOT-OK: the poll settled the recorder — the roll is recorded, so its input is a fixed value.
  expect((trpc.lastInput("rpg.rollDice") as { readonly notation?: string }).notation).toBe("d20");
  // The baked stamp lands in THIS room's composer draft (observable in the real textarea) — canon on send.
  await expect(component.getByRole("textbox", { name: "Message" })).toHaveValue("[dice: d20 → 14]");
  // The roll is inserted, never auto-sent — the member sends it as their turn.
  await expect.poll(async () => trpc.count("chat.send")).toBe(0);
});

test("a plain (non-game) chat surfaces NO dice chips — the game-arm acceptance property", async ({ mount, page }) => {
  await routeRoom(page, false);

  const component = await mount(<RpgDiceAskStory />);
  // The room renders (the discriminator) — then the absence of the band is a settled truth, not a pre-load flash.
  await expect(component.getByText("The corridor forks.")).toBeVisible();
  await expect(component.getByRole("button", { name: "Run Roll d20" })).toHaveCount(0);
  // The whole control band collapses (no source published anything) — byte-identical to a build without S1.
  await expect(component.locator(CHIPS)).toHaveCount(0);
});

// #862 — THE RULESET GATES THE ROW. A freeform game is a table with no dice, and its own start-door copy
// promises prose steering; four d20-family chips over it were the measured contradiction (side-eye
// 2026-08-30) AND the thing that would have made the new ruleset SETTING a dead toggle. This is the pin that
// the setting has a visible consequence for every member, not just the host who flipped it.
test("an engaged FREEFORM game surfaces NO dice chips — the ruleset gates the row (#862)", async ({ mount, page }) => {
  await routeRoom(page, true, "freeform");

  const component = await mount(<RpgDiceAskStory />);
  // The room renders (the discriminator) — the absence below is a settled truth, not a pre-load flash.
  await expect(component.getByText("The corridor forks.")).toBeVisible();
  await expect(component.getByRole("button", { name: "Run Roll d20" })).toHaveCount(0);
  // The whole band collapses: a freeform game publishes an EMPTY control set, not four dead chips.
  await expect(component.locator(CHIPS)).toHaveCount(0);
});

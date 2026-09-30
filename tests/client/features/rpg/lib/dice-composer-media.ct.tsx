// CT: D269 — the real RPG dice group in the composer's existing Message tools menu. The room exercises
// the engaged pointer, ruleset gate, keyboard entry, baked roll stamp and absence of a persistent dice door.

import type { ChatIdentity, GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { RpgGameView, RpgRuleset } from "@orb/contracts/rpg";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { resolveSpacingPx } from "../../../../support/browser/touch-floor.ts";
import type { TrpcFixtureOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcHold } from "../../../../support/node/route-trpc.ts";
import { RpgDiceComposerStory } from "../../chat/_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ID, makeMessagesPage, makeMessageView } from "../../chat/fixtures.ts";
import { makeRpgGameView } from "../fixtures.ts";

const CHIPS = '[data-slot="chat-control-chips"]';
const MENU_POPUP = '[data-slot="menu-popup"]';
const NO_CONNECTION = { available: false, cause: "no-connection" } satisfies TrpcFixtureOutput<"chat.checkSendAvailability">;

/** The engaged room's game read (the composer's choice provider suspends on it once the game gate opens
 *  — the guided-cluster/choice CT precedent): the `publicConfig` slice those readers use. The dice group
 *  reads the ruleset there; the ROOM also mounts game-aware chrome the moment the pointer engages,
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
 *  roll; the stamp is what the action appends to the composer. */
function rollOutcome(notation: string, rolls: readonly number[], total: number): TrpcFixtureOutput<"rpg.rollDice"> {
  return { notation, rolls, modifier: 0, total, stamp: `[dice: ${notation} → ${total}]` };
}

/** The room floor, plus the game-ness pointer the dice contribution gates on and the
 *  `rpg.rollDice` stub. `engaged` chooses whether `chat.getChat.rpg` presents a LIVE game; `unconnected` makes
 *  the room's pre-send verdict the no-connection refusal. */
function routeRoom(
  page: Page,
  engaged: boolean,
  {
    ruleset = "d20",
    heldRoll,
    unconnected = false,
  }: { readonly ruleset?: RpgRuleset; readonly heldRoll?: ReturnType<typeof trpcHold>; readonly unconnected?: boolean } = {},
): Promise<{ readonly count: (p: string) => number; readonly lastInput: (p: string) => unknown }> {
  return routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...(unconnected ? { "chat.checkSendAvailability": NO_CONNECTION } : {}),
    "chat.previewContextFit": () => ({
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
    "chat.listMessages": () =>
      makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_dice_room"), role: "assistant", content: "The corridor forks.", seq: 1 })]),
    // The engaged room's game-aware chrome suspends on getGame; a plain chat never asks for it (no unfed read).
    ...(engaged ? { "rpg.getGame": (): RpgGameView => gameView(ruleset) } : {}),
    "rpg.rollDice": heldRoll ?? (() => rollOutcome("d20", [14], 14)),
    "chat.send": () => ({ messages: [], aborted: false }),
  });
}

test("an engaged d20 game exposes four dice actions in Message tools, with no persistent dice door", async ({ mount, page }) => {
  await routeRoom(page, true);

  const component = await mount(<RpgDiceComposerStory />);

  await expect(component.getByText("The corridor forks.")).toBeVisible();
  await expect(component.getByRole("button", { name: /Dice rolls/u })).toHaveCount(0);
  await expect(component.locator(CHIPS)).toHaveCount(0);
  const tools = component.getByRole("button", { name: "Message tools" });
  await expect(tools).toBeVisible();
  await tools.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Dice rolls", { exact: true })).toBeVisible();
  for (const notation of ["d20", "d6", "2d6", "d100"]) {
    await expect(page.getByRole("menuitem", { name: `Roll ${notation}`, exact: true })).toBeVisible();
  }
});

test("a menu roll appends the baked stamp to the draft without sending it", async ({ mount, page }) => {
  const trpc = await routeRoom(page, true);

  const component = await mount(<RpgDiceComposerStory />);
  const composer = component.getByRole("textbox", { name: "Message" });
  await composer.fill("I attack —");
  await component.getByRole("button", { name: "Message tools" }).click();
  await page.getByRole("menuitem", { name: "Roll d20", exact: true }).click();

  // The server roll fired for the clicked notation.
  await expect.poll(() => trpc.count("rpg.rollDice"), { intervals: [20, 50, 100] }).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the poll settled the recorder — the roll is recorded, so its input is a fixed value.
  expect((trpc.lastInput("rpg.rollDice") as { readonly notation?: string }).notation).toBe("d20");
  await expect(composer).toHaveValue("I attack — [dice: d20 → 14]");
  // The roll is inserted, never auto-sent — the member sends it as their turn.
  await expect.poll(async () => trpc.count("chat.send")).toBe(0);
});

test("a held roll still inserts exactly one stamp after Escape dismisses the menu", async ({ mount, page }) => {
  const heldRoll = trpcHold();
  const trpc = await routeRoom(page, true, { heldRoll });
  const component = await mount(<RpgDiceComposerStory />);
  const composer = component.getByRole("textbox", { name: "Message" });
  await composer.fill("I attack —");
  await component.getByRole("button", { name: "Message tools" }).click();
  await page.getByRole("menuitem", { name: "Roll d20", exact: true }).click();
  await heldRoll.requested;
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Roll d20", exact: true })).toHaveCount(0);
  await expect(composer).toHaveValue("I attack —");

  heldRoll.release(rollOutcome("d20", [14], 14));
  await expect(composer).toHaveValue("I attack — [dice: d20 → 14]");
  await expect.poll(() => trpc.count("rpg.rollDice")).toBe(1);
  await expect.poll(() => trpc.count("chat.send")).toBe(0);
});

test.describe("coarse pointer", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 800 } });

  test("the same dice action is reachable by touch in a narrow room", async ({ mount, page }) => {
    const trpc = await routeRoom(page, true);
    const component = await mount(<RpgDiceComposerStory />);
    await expect(component.getByText("The corridor forks.")).toBeVisible();
    await component.getByRole("button", { name: "Message tools" }).tap();
    const roll = page.getByRole("menuitem", { name: "Roll d20", exact: true });
    await expect(roll).toBeVisible();
    await roll.tap();
    await expect.poll(() => trpc.count("rpg.rollDice")).toBe(1);
    await expect(component.getByRole("textbox", { name: "Message" })).toHaveValue("[dice: d20 → 14]");
  });
});

test("a plain chat has no dice group in Message tools", async ({ mount, page }) => {
  await routeRoom(page, false);

  const component = await mount(<RpgDiceComposerStory />);
  await expect(component.getByText("The corridor forks.")).toBeVisible();
  await component.getByRole("button", { name: "Message tools" }).click();
  await expect(page.getByText("Dice rolls", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Roll d20" })).toHaveCount(0);
  await expect(component.locator(CHIPS)).toHaveCount(0);
});

test("an engaged freeform game has no dice group in Message tools", async ({ mount, page }) => {
  await routeRoom(page, true, { ruleset: "freeform" });

  const component = await mount(<RpgDiceComposerStory />);
  await expect(component.getByText("The corridor forks.")).toBeVisible();
  await component.getByRole("button", { name: "Message tools" }).click();
  await expect(page.getByText("Dice rolls", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Roll d20" })).toHaveCount(0);
  await expect(component.locator(CHIPS)).toHaveCount(0);
});

// The room's own group leads the menu, so a phone reaches every roll without scrolling the popup past the
// generic groups. `toBeInViewport` is clipped by the popup's own scroller, so an item below its fold fails.
test.describe("phone", () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 780 } });

  test("every dice action is in view the moment Message tools opens", async ({ mount, page }) => {
    await routeRoom(page, true);
    const component = await mount(<RpgDiceComposerStory height={780} />);
    await expect(component.getByText("The corridor forks.")).toBeVisible();
    await component.getByRole("button", { name: "Message tools" }).tap();
    await expect(page.locator(MENU_POPUP)).toHaveCSS("opacity", "1");
    for (const notation of ["d20", "d6", "2d6", "d100"]) {
      await expect(page.getByRole("menuitem", { name: `Roll ${notation}`, exact: true })).toBeInViewport({ ratio: 1 });
    }
  });

  test("an unconnected game room still rolls into the draft: dice need no chat connection", async ({ mount, page }) => {
    const trpc = await routeRoom(page, true, { unconnected: true });
    const component = await mount(<RpgDiceComposerStory height={780} />);
    await expect(component.locator('[data-slot="composer-next-turn"]')).toHaveAttribute("data-unset", "");
    await component.getByRole("button", { name: "Message tools" }).tap();
    await expect(page.locator(MENU_POPUP)).toHaveCSS("opacity", "1");
    const roll = page.getByRole("menuitem", { name: "Roll d20", exact: true });
    await expect(roll).toBeInViewport({ ratio: 1 });
    await expect(roll).toBeEnabled();
    // Generation is refused in the same room, so the menu is not simply enabled across the board.
    await expect(page.getByRole("menuitem", { name: "Offer choices" })).toBeDisabled();
    await roll.tap();
    await expect.poll(() => trpc.count("rpg.rollDice")).toBe(1);
    await expect(component.getByRole("textbox", { name: "Message" })).toHaveValue("[dice: d20 → 14]");
    await expect.poll(() => trpc.count("chat.send")).toBe(0);
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 700 } });

  // The app's topbar is the viewport's first chrome row; the story has none, so the row is measured as the
  // band of viewport the menu must leave clear. The viewport is short enough that the game menu's content is
  // taller than the space above the composer, so an unbounded menu would reach the viewport's top edge.
  test("a tall Message tools menu stops below the topbar's chrome row", async ({ mount, page }) => {
    await routeRoom(page, true);
    const component = await mount(<RpgDiceComposerStory height={700} />);
    await expect(component.getByText("The corridor forks.")).toBeVisible();
    await component.getByRole("button", { name: "Message tools" }).click();
    const popup = page.locator(MENU_POPUP);
    await expect(popup).toHaveCSS("opacity", "1");
    const chromeRow = await resolveSpacingPx(page, "--dimension-chrome-row");
    await expect.poll(async () => (await popup.boundingBox())?.y ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual(chromeRow);
    // The bound scrolls the menu rather than cutting it: its last row is still reachable.
    const last = popup.getByRole("menuitem").last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport({ ratio: 1 });
  });
});

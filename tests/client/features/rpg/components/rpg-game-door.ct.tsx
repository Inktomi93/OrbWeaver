// CT: the GAME-MODE door's direct mutation ownership. #862 collapsed the two profile buttons into ONE start
// action (the ruleset is a Game-tab setting now), so the admission property is per-DOOR: a held create owns
// the start button, the re-engage door owns itself, and a failure releases each for retry.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcResponder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { RpgGameDoorStory } from "../_ct-stories.tsx";

function stubCreate(page: Page, responder: TrpcResponder<"rpg.createGame">): Promise<TrpcRecorder> {
  return routeTrpc(page, { "chat.getChat": () => ({ rpg: null }), "rpg.createGame": responder });
}

function stubUpdate(page: Page, responder: TrpcResponder<"rpg.updateConfig">): Promise<TrpcRecorder> {
  return routeTrpc(page, { "chat.getChat": () => ({ rpg: { gameId: "rpg_game_ct", engaged: false } }), "rpg.updateConfig": responder });
}

// #862 — ONE START ACTION. The door used to offer `Freeform story` | `D20 adventure`, two buttons that
// minted the identical lite game and differed only by packaged profile; that pick is the Game tab's ruleset
// SETTING now. The pins: the retired buttons are gone, the one that remains is `Turn on game mode`, and a
// same-task double activation still admits exactly one create.
test("the door offers ONE start action (no profile pick), admits one create per task, and releases on rejection", async ({ mount, page }) => {
  const held = trpcHold();
  const trpc = await stubCreate(page, held);
  await mount(<RpgGameDoorStory />);

  await expect(page.getByRole("button", { name: "Freeform story" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "D20 adventure" })).toHaveCount(0);
  const start = page.getByRole("button", { name: "Turn on game mode" });
  await start.evaluate((element) => {
    (element as HTMLElement).click();
    (element as HTMLElement).click();
  });
  await held.requested;

  await expect(start).toBeDisabled();
  await expect.poll(() => trpc.count("rpg.createGame")).toBe(1);
  // The create carries no vocabulary pick — a game is born freeform and retuned by the setting.
  await expect.poll(() => trpc.lastInput("rpg.createGame")).not.toHaveProperty("ruleset");

  held.release(trpcError());
  await expect(start).toBeEnabled();
  await start.click();
  await expect.poll(() => trpc.count("rpg.createGame")).toBe(2);
});

test("a same-task repeat admits one re-engage write, and rejection releases retry", async ({ mount, page }) => {
  const held = trpcHold();
  const trpc = await stubUpdate(page, held);
  await mount(<RpgGameDoorStory />);

  const engage = page.getByRole("button", { name: "Turn game mode back on" });
  await engage.evaluate((element) => {
    (element as HTMLElement).click();
    (element as HTMLElement).click();
  });
  await held.requested;

  await expect(engage).toBeDisabled();
  await expect.poll(() => trpc.count("rpg.updateConfig")).toBe(1);

  held.release(trpcError());
  await expect(engage).toBeEnabled();
  await engage.click();
  await expect.poll(() => trpc.count("rpg.updateConfig")).toBe(2);
});

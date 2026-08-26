// CT: the RPG game door's direct mutation ownership. A held first-ever create owns both mutually-exclusive
// profile choices for this chat; the re-engage door owns itself. Failures release both doors for retry.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcResponder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/ct/route-trpc.ts";
import { RpgGameDoorStory } from "../_ct-stories.tsx";

function stubChat(page: Page, rpg: unknown, mutation: string, responder: TrpcResponder): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "chat.getChat": () => ({ rpg }),
    [mutation]: responder,
  });
}

test("a held create owns both profile choices, and rejection releases the opposite choice for retry", async ({ mount, page }) => {
  const held = trpcHold();
  const trpc = await stubChat(page, null, "rpg.createGame", held);
  await mount(<RpgGameDoorStory />);

  const freeform = page.getByRole("button", { name: "Freeform story" });
  const d20 = page.getByRole("button", { name: "D20 adventure" });
  await freeform.click();
  await held.requested;

  await expect(freeform).toBeDisabled();
  await expect(d20).toBeDisabled();
  await expect.poll(() => trpc.count("rpg.createGame")).toBe(1);

  held.release(trpcError());
  await expect(freeform).toBeEnabled();
  await expect(d20).toBeEnabled();
  await d20.click();
  await expect.poll(() => trpc.count("rpg.createGame")).toBe(2);
});

test("a held re-engage owns its door, and rejection releases retry", async ({ mount, page }) => {
  const held = trpcHold();
  const trpc = await stubChat(page, { gameId: "rpg_game_ct", engaged: false }, "rpg.updateConfig", held);
  await mount(<RpgGameDoorStory />);

  const engage = page.getByRole("button", { name: "Turn the overlay on" });
  await engage.click();
  await held.requested;

  await expect(engage).toBeDisabled();
  await expect.poll(() => trpc.count("rpg.updateConfig")).toBe(1);

  held.release(trpcError());
  await expect(engage).toBeEnabled();
  await engage.click();
  await expect.poll(() => trpc.count("rpg.updateConfig")).toBe(2);
});

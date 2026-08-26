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

test("same-task opposite profile choices admit one create, and rejection releases retry", async ({ mount, page }) => {
  const held = trpcHold();
  const trpc = await stubChat(page, null, "rpg.createGame", held);
  await mount(<RpgGameDoorStory />);

  const freeform = page.getByRole("button", { name: "Freeform story" });
  const d20 = page.getByRole("button", { name: "D20 adventure" });
  await freeform.evaluate((element) => {
    const choices = element.parentElement?.querySelectorAll("button");
    (element as HTMLElement).click();
    (choices?.item(1) as HTMLElement | undefined)?.click();
  });
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

test("a same-task repeat admits one re-engage write, and rejection releases retry", async ({ mount, page }) => {
  const held = trpcHold();
  const trpc = await stubChat(page, { gameId: "rpg_game_ct", engaged: false }, "rpg.updateConfig", held);
  await mount(<RpgGameDoorStory />);

  const engage = page.getByRole("button", { name: "Turn the overlay on" });
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

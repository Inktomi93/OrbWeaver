import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { CharacterHistoryTabStory } from "../_ct-stories.tsx";

test("Snapshot now admits one durable intent and rejection restores retry", async ({ mount, page }) => {
  const first = trpcHold();
  const retry = trpcHold();
  let attempts = 0;
  const trpc = await routeTrpc(page, {
    "character.listSnapshots": [],
    "character.snapshot": () => (attempts++ === 0 ? first : retry),
  });
  const component = await mount(<CharacterHistoryTabStory />);
  const snapshot = component.getByRole("button", { name: "Snapshot now" });

  await snapshot.evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Snapshot now did not resolve to a button");
    }
    button.click();
    button.click();
  });
  await first.requested;
  await expect(snapshot).toBeDisabled();
  await expect.poll(() => trpc.count("character.snapshot")).toBe(1);

  first.release(trpcError());
  await expect(snapshot).toBeEnabled();
  await snapshot.click();
  await retry.requested;
  await expect(snapshot).toBeDisabled();
  await expect.poll(() => trpc.count("character.snapshot")).toBe(2);
  retry.release(null);
  await expect(snapshot).toBeEnabled();
});

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/ct/route-trpc.ts";
import { CharacterTagsRowStory } from "../_ct-stories.tsx";

test("tag removal admits one durable intent, holds the cluster inert, and rejection restores retry", async ({ mount, page }) => {
  const first = trpcHold();
  const retry = trpcHold();
  let attempts = 0;
  const trpc = await routeTrpc(page, {
    "character.bulkRemoveCardTag": () => (attempts++ === 0 ? first : retry),
  });
  const component = await mount(<CharacterTagsRowStory />);
  const remove = component.getByRole("button", { name: "Remove rpg" });
  const add = component.getByRole("button", { name: "Add tag" });

  await remove.evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Remove rpg did not resolve to a button");
    }
    button.click();
    button.click();
  });
  await first.requested;
  await expect(remove).toBeDisabled();
  await expect(add).toBeDisabled();
  await expect.poll(() => trpc.count("character.bulkRemoveCardTag")).toBe(1);

  first.release(trpcError());
  await expect(remove).toBeEnabled();
  await expect(add).toBeEnabled();
  await remove.click();
  await retry.requested;
  await expect(remove).toBeDisabled();
  await expect.poll(() => trpc.count("character.bulkRemoveCardTag")).toBe(2);
  retry.release({ applied: ["char_ct_1"], failed: [] });
  await expect(remove).toBeEnabled();
});

test("tag apply admits one durable intent and rejection restores the picker", async ({ mount, page }) => {
  const first = trpcHold();
  const retry = trpcHold();
  let attempts = 0;
  const trpc = await routeTrpc(page, {
    "tag.listTagsWithUsage": [],
    "character.bulkAddCardTag": () => (attempts++ === 0 ? first : retry),
  });
  const component = await mount(<CharacterTagsRowStory />);
  const add = component.getByRole("button", { name: "Add tag" });

  await add.click();
  await page.getByRole("combobox", { name: "Tag name" }).fill("adventure");
  const submit = page.getByRole("button", { name: 'Create "adventure"' });
  await submit.evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Create adventure did not resolve to a button");
    }
    button.click();
    button.click();
  });
  await first.requested;
  await expect(add).toBeDisabled();
  await expect.poll(() => trpc.count("character.bulkAddCardTag")).toBe(1);

  first.release(trpcError());
  await expect(add).toBeEnabled();
  await add.click();
  await page.getByRole("combobox", { name: "Tag name" }).fill("adventure");
  await page.getByRole("button", { name: 'Create "adventure"' }).click();
  await retry.requested;
  await expect(add).toBeDisabled();
  await expect.poll(() => trpc.count("character.bulkAddCardTag")).toBe(2);
  retry.release({ applied: ["char_ct_1"], failed: [] });
  await expect(add).toBeEnabled();
});

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/experimental-ct-react";
import { unzipSync } from "fflate";
import { PocketArcadeFrame } from "./_ct-stories.tsx";

test("the separately typed Pocket Arcade frame boots from the release-built bundle", async ({ mount, page }) => {
  const zip = await readFile(join(import.meta.dirname, "..", "..", "packages", "showcase-plugins", "dist", "bundles", "pocket-arcade.zip"));
  const main = unzipSync(zip)["main.js"];
  if (main === undefined) {
    throw new Error("pocket-arcade runtime artifact has no main.js; run pnpm build");
  }
  await mount(<PocketArcadeFrame mainSource={new TextDecoder().decode(main)} />);
  const frame = page.frameLocator('iframe[title="2048"]');

  await expect(frame.locator("#board .cell")).toHaveCount(16);
  await expect(frame.locator("#score")).toHaveText("0");
  await expect(frame.getByRole("button", { name: "New game" })).toBeVisible();
  await frame.getByRole("button", { name: "New game" }).click();
  await expect(frame.locator("#board .cell")).toHaveCount(16);
});

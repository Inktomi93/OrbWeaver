import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/experimental-ct-react";
import { unzipSync } from "fflate";
import { PocketArcadeFrame } from "./_ct-stories.tsx";

/** The chat flank is `--width-sidebar-sm` (220px) less its card's border and padding. */
const FLANK_FRAME_WIDTH_PX = 194;

async function builtMainSource(): Promise<string> {
  const zip = await readFile(join(import.meta.dirname, "..", "..", "..", "packages", "showcase-plugins", "dist", "bundles", "pocket-arcade.zip"));
  const main = unzipSync(zip)["main.js"];
  if (main === undefined) {
    throw new Error("pocket-arcade runtime artifact has no main.js; run pnpm build");
  }
  return new TextDecoder().decode(main);
}

test("the separately typed Pocket Arcade frame boots from the release-built bundle", async ({ mount, page }) => {
  await mount(<PocketArcadeFrame mainSource={await builtMainSource()} />);
  const frame = page.frameLocator('iframe[title="2048"]');

  await expect(frame.locator("#board .cell")).toHaveCount(16);
  await expect(frame.locator("#score")).toHaveText("0");
  await expect(frame.getByRole("button", { name: "New game" })).toBeVisible();
  await frame.getByRole("button", { name: "New game" }).click();
  await expect(frame.locator("#board .cell")).toHaveCount(16);
});

test("in the flank's narrow column the New game label stays on one line and the bar does not overflow", async ({ mount, page }) => {
  await mount(<PocketArcadeFrame mainSource={await builtMainSource()} widthPx={FLANK_FRAME_WIDTH_PX} />);
  const frame = page.frameLocator('iframe[title="2048"]');
  const button = frame.getByRole("button", { name: "New game" });
  await expect(button).toBeVisible();

  const measured = await button.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const bar = el.parentElement;
    return {
      lines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size,
      barFits: bar !== null && bar.scrollWidth <= bar.clientWidth,
    };
  });
  expect(measured.lines, "a button label breaks mid-phrase when its text spans two line boxes").toBe(1);
  expect(measured.barFits, "the score row must not spill past the frame's width").toBe(true);
});

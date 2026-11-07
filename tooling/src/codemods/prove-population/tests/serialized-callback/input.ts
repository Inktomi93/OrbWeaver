import { expect, test } from "@playwright/test";

test("rows", async ({ page }) => {
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll("li")];
    expect(rows.every((row) => row.isConnected)).toBe(true);
  });
  await page.waitForFunction(() => expect(document.body?.dataset).not.toBe(undefined));
});

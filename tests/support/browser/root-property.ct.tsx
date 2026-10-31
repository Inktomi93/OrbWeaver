// The font-scale drivers write and clear the root channel and step a ladder until a control shows.
import { expect, test } from "@playwright/test";
import { channelName } from "../node/appearance-channel-name.ts";
import { enlargeUntilVisible, setRootFontScale } from "./root-property.ts";

const ORIGIN = "http://root-property.test";
const PROPERTY = channelName("fontScale");

test.beforeEach(async ({ page }) => {
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: "text/html", body: '<p id="probe">text</p><button id="late" style="display:none">late</button>' }),
  );
  await page.goto(ORIGIN);
});

const rootValue = (page: import("@playwright/test").Page): Promise<string> =>
  page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), PROPERTY);

test("setRootFontScale writes the channel over the document and null clears it", async ({ page }) => {
  await setRootFontScale(page, PROPERTY, 1.5);
  expect(await rootValue(page)).toBe("1.5");
  await setRootFontScale(page, PROPERTY, 2);
  expect(await rootValue(page)).toBe("2");
  await setRootFontScale(page, PROPERTY, null);
  expect(await rootValue(page)).toBe("");
});

test("enlargeUntilVisible steps the ladder until the trigger shows and stops there", async ({ page }) => {
  const trigger = page.locator("#late");
  await page.evaluate((name) => {
    new MutationObserver(() => {
      const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
      const late = document.getElementById("late");
      if (late !== null) {
        late.style.display = scale >= 3 ? "block" : "none";
      }
    }).observe(document.head, { childList: true, subtree: true, characterData: true });
  }, PROPERTY);
  await enlargeUntilVisible(page, trigger, PROPERTY, [1, 2, 3, 4]);
  await expect(trigger).toBeVisible();
  expect(await rootValue(page)).toBe("3");
});

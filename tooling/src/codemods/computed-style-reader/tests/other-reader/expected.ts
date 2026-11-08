import type { Locator } from "@playwright/test";

function style(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).color);
}

export const read = (locator: Locator): Promise<string> => style(locator);

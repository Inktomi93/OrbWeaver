import type { Locator } from "@playwright/test";

/** One computed property of the located element, or of its `::before`/`::after` when `pseudo` is set. */
export function computedStyle(locator: Locator, property: string, pseudo?: string): Promise<string> {
  return locator.evaluate((element, [name, at]) => getComputedStyle(element, at).getPropertyValue(name), [property, pseudo ?? null] as const);
}

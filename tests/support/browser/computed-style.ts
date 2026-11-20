import type { Locator } from "@playwright/test";

/** One computed property of the located element, or of its `::before`/`::after` when `pseudo` is set. */
export function computedStyle(locator: Locator, property: string, pseudo?: string): Promise<string> {
  return locator.evaluate((element, [name, at]) => getComputedStyle(element, at).getPropertyValue(name), [property, pseudo ?? null] as const);
}

/**
 * The px size the type-ramp step `cssVar` (a `--text-*` token) resolves to where the located element sits, and the
 * element's own font size, so a line is compared with the step it should read at under the same root and scope.
 */
export function fontSizeAgainstStep(locator: Locator, cssVar: string): Promise<{ readonly own: number; readonly step: number }> {
  return locator.evaluate((element, name) => {
    // A probe in the element's own parent resolves the token's `rem` and any carried scope exactly as the element's would.
    const probe = document.createElement("span");
    probe.style.fontSize = `var(${name})`;
    (element.parentElement ?? element).append(probe);
    const step = Number.parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return { own: Number.parseFloat(getComputedStyle(element).fontSize), step };
  }, cssVar);
}

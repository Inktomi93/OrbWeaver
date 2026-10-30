import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/** Keep default document/frame rules and explicitly enable the vendor's disabled WCAG 2.2 target-size rule. */
export async function accessibilityScan(page: Page): ReturnType<AxeBuilder["analyze"]> {
  return await new AxeBuilder({ page }).options({ rules: { "target-size": { enabled: true } } }).analyze();
}

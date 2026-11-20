// Card-frame geometry read the way a reader sees it: a token's length as the host page resolves it, and where a frame's
// text starts past its body's edge.
import type { Locator, Page } from "@playwright/test";

/** `cssVar` resolved by the host page as a padding, in px. Read it once the app's stylesheet is mounted. */
export async function hostLengthPx(page: Page, cssVar: string): Promise<number> {
  return await page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.paddingLeft = `var(${name})`;
    document.body.append(probe);
    const px = Number.parseFloat(getComputedStyle(probe).paddingLeft);
    probe.remove();
    return px;
  }, cssVar);
}

/** How far the frame's `text` starts in from its own document body's left edge, in px. */
export async function frameTextInsetPx(frame: Locator, text: string): Promise<number> {
  return await frame
    .contentFrame()
    .getByText(text)
    .evaluate((node) => node.getBoundingClientRect().left - document.body.getBoundingClientRect().left);
}

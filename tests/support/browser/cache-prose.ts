import { expect } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";

/** Measure the paragraph's own font and cap, not a wrapper's reading scale. */
export async function expectCacheProse(paragraph: Locator): Promise<void> {
  await expect(paragraph).toBeVisible();
  const proof = await paragraph.evaluate((node) => {
    const actual = getComputedStyle(node);
    const probe = node.ownerDocument.createElement("div");
    probe.style.font = actual.font;
    probe.style.fontSize = "var(--text-label)";
    probe.style.lineHeight = "var(--leading-label-relaxed)";
    probe.style.width = "var(--reading-measure-prose)";
    node.append(probe);
    const expected = getComputedStyle(probe);
    const facts = {
      size: actual.fontSize,
      leading: actual.lineHeight,
      cap: actual.maxWidth,
      width: node.getBoundingClientRect().width,
      expectedSize: expected.fontSize,
      expectedLeading: expected.lineHeight,
      expectedCap: expected.width,
    };
    probe.remove();
    return facts;
  });
  expect(proof.size).toBe(proof.expectedSize);
  expect(proof.leading).toBe(proof.expectedLeading);
  expect(proof.cap).toBe(proof.expectedCap);
  expect(proof.width).toBeLessThanOrEqual(Number.parseFloat(proof.expectedCap));
}

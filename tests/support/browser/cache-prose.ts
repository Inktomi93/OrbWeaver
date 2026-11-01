import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/** Measure the paragraph's own font and cap, not a wrapper's reading scale. */
export async function expectCacheProse(paragraph: Locator): Promise<void> {
  await expect(paragraph).toBeVisible();
  const proof = await paragraph.evaluate(
    (node, { textLabel, leadingLabelRelaxed, readingMeasureProse }) => {
      const actual = getComputedStyle(node);
      const probe = node.ownerDocument.createElement("div");
      probe.style.font = actual.font;
      probe.style.fontSize = `var(${textLabel})`;
      probe.style.lineHeight = `var(${leadingLabelRelaxed})`;
      probe.style.width = `var(${readingMeasureProse})`;
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
    },
    {
      textLabel: TOKENS["text.label"].cssVar,
      leadingLabelRelaxed: TOKENS["leading.label-relaxed"].cssVar,
      readingMeasureProse: TOKENS["reading.measure-prose"].cssVar,
    },
  );
  expect(proof.size).toBe(proof.expectedSize);
  expect(proof.leading).toBe(proof.expectedLeading);
  expect(proof.cap).toBe(proof.expectedCap);
  expect(proof.width).toBeLessThanOrEqual(Number.parseFloat(proof.expectedCap));
}

import { expect, test } from "@playwright/experimental-ct-react";
import { CorpusSearchDisclosureStory } from "../_ct-stories.tsx";

for (const width of [320, 720]) {
  test(`keyboard disclosure preserves a row-token gap above coverage at ${width}`, async ({ mount }) => {
    const disclosure = await mount(<CorpusSearchDisclosureStory width={width} />);
    const trigger = disclosure.getByRole("button", { name: "How search works", exact: true });
    await trigger.focus();
    await trigger.press("Enter");
    const coverage = disclosure.getByText("Request limit:", { exact: false });
    await expect(coverage).toBeVisible();
    await expect(trigger).toBeFocused();
    await expect
      .poll(() =>
        coverage.evaluate((element) => {
          const button = element.closest('[data-slot="collapsible-root"]')?.querySelector("button");
          if (button === null || button === undefined) {
            throw new Error("The disclosure trigger is missing");
          }
          const probe = element.ownerDocument.createElement("div");
          probe.style.height = "var(--spacing-row)";
          probe.style.position = "absolute";
          element.append(probe);
          const expected = probe.getBoundingClientRect().height;
          probe.remove();
          return element.getBoundingClientRect().top - button.getBoundingClientRect().bottom >= expected && expected > 0;
        }),
      )
      .toBe(true);
    await test.info().attach(`0314-disclosure-${width}`, { body: await disclosure.screenshot(), contentType: "image/png" });
  });
}

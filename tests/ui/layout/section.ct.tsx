// <Section> CT — the block-spacing wrapper: py-section rhythm + the conditional heading slot.
import { Section } from "@orb/ui/layout";
import { expect, test } from "@playwright/experimental-ct-react";

test("renders the heading slot and the py-section rhythm", async ({ mount }) => {
  const component = await mount(
    <Section heading="Sampling">
      <p>content</p>
    </Section>,
  );
  await expect(component.getByRole("heading", { name: "Sampling" })).toBeVisible();
  await expect(component).toHaveCSS("padding-top", "24px");
  await expect(component).toHaveCSS("padding-bottom", "24px");
});

test("no heading prop → no heading element", async ({ mount }) => {
  const component = await mount(
    <Section>
      <p>content</p>
    </Section>,
  );
  await expect(component.getByRole("heading")).toHaveCount(0);
});

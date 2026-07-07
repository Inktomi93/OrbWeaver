// <Section> CT — the block-spacing wrapper: an internal `gap-block` rhythm + the conditional heading
// slot. It NO LONGER self-pads (commit 428707a: between-section spacing is the container's `gap`, not
// Section's own `py` — padding-as-margin double-counted the gap; UI layout doctrine).
import { Section } from "@orb/ui/layout";
import { expect, test } from "@playwright/experimental-ct-react";

test("renders the heading slot and does NOT self-pad (spacing is the container gap)", async ({
  mount,
}) => {
  const component = await mount(
    <Section heading="Sampling">
      <p>content</p>
    </Section>,
  );
  await expect(component.getByRole("heading", { name: "Sampling" })).toBeVisible();
  // Section is a flex-col with an internal gap-block (12px), never its own vertical padding.
  await expect(component).toHaveCSS("padding-top", "0px");
  await expect(component).toHaveCSS("padding-bottom", "0px");
  await expect(component).toHaveCSS("row-gap", "12px");
});

test("no heading prop → no heading element", async ({ mount }) => {
  const component = await mount(
    <Section>
      <p>content</p>
    </Section>,
  );
  await expect(component.getByRole("heading")).toHaveCount(0);
});

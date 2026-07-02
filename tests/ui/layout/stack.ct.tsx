// <Stack> CT — the intent-token mapping is the component's whole job, so assert the computed
// pixel value of a gap token (gap-row = --spacing-row = 0.5rem = 8px), not just that it mounts.
import { Stack } from "@orb/ui/layout";
import { expect, test } from "@playwright/experimental-ct-react";

test("gap='row' computes to the 8px intent token on a column flex", async ({ mount }) => {
  const component = await mount(
    <Stack gap="row">
      <span>alpha</span>
      <span>beta</span>
    </Stack>,
  );
  await expect(component).toHaveCSS("display", "flex");
  await expect(component).toHaveCSS("flex-direction", "column");
  await expect(component).toHaveCSS("row-gap", "8px");
});

test("padding variant maps to the intent scale (padding='section' = 24px)", async ({ mount }) => {
  const component = await mount(
    <Stack gap="field" padding="section">
      <span>alpha</span>
    </Stack>,
  );
  await expect(component).toHaveCSS("padding-top", "24px");
  await expect(component).toHaveCSS("row-gap", "6px");
});

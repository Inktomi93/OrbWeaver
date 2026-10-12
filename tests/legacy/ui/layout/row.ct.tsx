// <Row> CT — horizontal flex with centered items by default; gap rides the same intent scale.
import { Row } from "@orb/ui/layout";
import { expect, test } from "@playwright/experimental-ct-react";

test("Row is a centered horizontal flex with intent-token gaps", async ({ mount }) => {
  const component = await mount(
    <Row gap="block">
      <span>alpha</span>
      <span>beta</span>
    </Row>,
  );
  await expect(component).toHaveCSS("display", "flex");
  await expect(component).toHaveCSS("flex-direction", "row");
  await expect(component).toHaveCSS("align-items", "center");
  await expect(component).toHaveCSS("column-gap", "12px");
});

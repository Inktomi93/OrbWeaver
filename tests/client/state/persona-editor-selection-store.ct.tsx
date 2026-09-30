import { expect, test } from "@playwright/experimental-ct-react";
import { PersonaEditorSelectionProbe } from "./_ct-stories.tsx";

test("a persona door opens its management group and closing is not replayed", async ({ mount }) => {
  const probe = await mount(<PersonaEditorSelectionProbe />);
  await probe.getByRole("button", { name: "open persona editor" }).click();
  await expect(probe.locator("output")).toHaveText(/^personas:persona_/u);
  await probe.getByRole("button", { name: "close persona editor" }).click();
  await expect(probe.locator("output")).toHaveText("personas:none");
});

import { expect, test } from "@playwright/experimental-ct-react";
import { PersonaEditorSelectionProbe } from "./_ct-stories.tsx";

test("a persona door opens its management group and closing is not replayed", async ({ mount }) => {
  const probe = await mount(<PersonaEditorSelectionProbe />);
  await probe.getByRole("button", { name: "open persona editor" }).click();
  await expect(probe.locator("output").first()).toHaveText(/^personas:persona_/u);
  await expect(probe.getByLabel("Persona management target")).toHaveText("personas/your-personas");
  await probe.getByRole("button", { name: "close persona editor" }).click();
  await expect(probe.locator("output").first()).toHaveText("personas:none");
  await expect(probe.getByLabel("Persona management target")).toHaveText("personas/your-personas");
});

test("row expansion and nullable collapse do not open the management group", async ({ mount }) => {
  const probe = await mount(<PersonaEditorSelectionProbe />);
  await expect(probe.getByLabel("Persona management target")).toHaveText("none/none");
  await probe.getByRole("button", { name: "select persona row" }).click();
  await expect(probe.locator("output").first()).toHaveText(/^none:persona_/u);
  await expect(probe.getByLabel("Persona management target")).toHaveText("none/none");
  await probe.getByRole("button", { name: "close persona editor" }).click();
  await expect(probe.locator("output").first()).toHaveText("none:none");
  await expect(probe.getByLabel("Persona management target")).toHaveText("none/none");
});

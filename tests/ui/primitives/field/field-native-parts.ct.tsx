import { expect, test } from "@playwright/test";
import type { FieldCustomValidityStory, FieldNativeConstraintStory } from "./field-native-parts-stories.tsx";

test("custom validation transitions agree with the render prop without losing label or description association", async ({ mount }) => {
  const component = await mount<typeof FieldCustomValidityStory>("tests/ui/primitives/field/field-native-parts-stories/FieldCustomValidityStory");
  const input = component.getByRole("textbox", { name: "Age", exact: true });
  const validity = component.getByRole("status", { name: "Age validity", exact: true });
  await expect(input).toHaveAccessibleDescription("Use your age in years");
  await component.getByText("Age", { exact: true }).click();
  await expect(input).toBeFocused();
  await expect(input).not.toHaveAttribute("data-invalid", "");
  await input.fill("20");
  await expect(input).toHaveAttribute("data-valid", "");
  await expect(validity).toHaveText("valid");
  await input.fill("13");
  await expect(input).toHaveAttribute("data-invalid", "");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(validity).toHaveText("Too young");
  await input.fill("21");
  await expect(input).toHaveAttribute("data-valid", "");
  await expect(input).not.toHaveAttribute("data-invalid", "");
  await expect(input).not.toHaveAttribute("aria-invalid", "true");
  await expect(validity).toHaveText("valid");
  await expect(input).toHaveAccessibleDescription("Use your age in years");
});

test("native email and required failures reach FieldValidity and recover on a valid value", async ({ mount }) => {
  const component = await mount<typeof FieldNativeConstraintStory>("tests/ui/primitives/field/field-native-parts-stories/FieldNativeConstraintStory");
  const input = component.getByRole("textbox", { name: "Contact email", exact: true });
  const validity = component.getByRole("status", { name: "Email validity", exact: true });
  await expect(input).toHaveAccessibleDescription("Where replies arrive");
  await input.fill("not-an-email");
  await expect(validity).toHaveText("type mismatch");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect.poll(() => input.evaluate((element: HTMLInputElement) => element.validity.typeMismatch)).toBe(true);
  await input.fill("author@example.test");
  await expect(validity).toHaveText("valid");
  await expect(input).toHaveAttribute("data-valid", "");
  await input.fill("");
  await expect(validity).toHaveText("missing");
  await expect(input).toHaveAttribute("data-invalid", "");
  await expect.poll(() => input.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
  await input.fill("replies@example.test");
  await expect(validity).toHaveText("valid");
  await expect(input).not.toHaveAttribute("aria-invalid", "true");
  await expect.poll(() => input.evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(true);
});

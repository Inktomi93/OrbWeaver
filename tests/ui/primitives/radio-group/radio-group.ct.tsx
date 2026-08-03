// CT: the radio-group seal — one-of-many selection (role="radio" per item, name from the wrapping
// label). Pointer selects one; arrow keys move the selection (Base UI roving tabindex).
import { Field } from "@orb/ui/field";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color.ts";

const NON_EMPTY = /.+/u;

test("clicking an option selects exactly one", async ({ mount, page }) => {
  await mount(
    <RadioGroup aria-label="Who runs the game">
      <RadioGroupItem value="ai">An AI</RadioGroupItem>
      <RadioGroupItem value="human">A human GM</RadioGroupItem>
      <RadioGroupItem value="solo">Solo</RadioGroupItem>
    </RadioGroup>,
  );
  const ai = page.getByRole("radio", { name: "An AI" });
  const human = page.getByRole("radio", { name: "A human GM" });
  await expect(ai).toHaveAttribute("aria-checked", "false");
  await ai.click();
  await expect(ai).toHaveAttribute("aria-checked", "true");
  await human.click();
  await expect(human).toHaveAttribute("aria-checked", "true");
  await expect(ai).toHaveAttribute("aria-checked", "false");
});

test("arrow keys move the selection", async ({ mount, page }) => {
  await mount(
    <RadioGroup aria-label="Who runs the game">
      <RadioGroupItem value="ai">An AI</RadioGroupItem>
      <RadioGroupItem value="human">A human GM</RadioGroupItem>
    </RadioGroup>,
  );
  const ai = page.getByRole("radio", { name: "An AI" });
  await ai.click();
  await expect(ai).toHaveAttribute("aria-checked", "true");
  await ai.press("ArrowDown");
  await expect(page.getByRole("radio", { name: "A human GM" })).toHaveAttribute("aria-checked", "true");
});

test("onValueChange reports the picked value", async ({ mount, page }) => {
  const seen: string[] = [];
  await mount(
    <RadioGroup
      aria-label="Who runs the game"
      onValueChange={(value): void => {
        seen.push(value as string);
      }}
    >
      <RadioGroupItem value="ai">An AI</RadioGroupItem>
      <RadioGroupItem value="human">A human GM</RadioGroupItem>
    </RadioGroup>,
  );
  await page.getByRole("radio", { name: "A human GM" }).click();
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toBe("human");
});

test("disabled blocks selection and drops the interactive skin", async ({ mount, page }) => {
  await mount(
    <RadioGroup aria-label="Who runs the game" disabled={true}>
      <RadioGroupItem value="ai">An AI</RadioGroupItem>
      <RadioGroupItem value="human">A human GM</RadioGroupItem>
    </RadioGroup>,
  );
  const ai = page.getByRole("radio", { name: "An AI" });
  await expect(ai).toHaveAttribute("data-disabled", "");
  await expect(ai).toHaveCSS("opacity", "0.5");
  await ai.click({ force: true });
  await expect(ai).toHaveAttribute("aria-checked", "false");
});

test("read-only: blocks selection but keeps the checked token + shows the lock glyph", async ({ mount, page }) => {
  await mount(
    <RadioGroup aria-label="Who runs the game" readOnly={true} value="ai">
      <RadioGroupItem value="ai">An AI</RadioGroupItem>
      <RadioGroupItem value="human">A human GM</RadioGroupItem>
    </RadioGroup>,
  );
  const ai = page.getByRole("radio", { name: "An AI" });
  const human = page.getByRole("radio", { name: "A human GM" });
  await expect(ai).toHaveAttribute("data-readonly", "");
  // A read-only radio is NOT the disabled grey-out — the checked item still wears the primary token.
  await expect(ai).toHaveCSS("background-color", TOKENS["color.primary"].value);
  await expect(ai).toHaveCSS("opacity", "1");
  // The non-color signal: a lock glyph replaces the selected dot.
  await expect(ai.locator("svg")).toBeVisible();
  await human.click();
  await expect(human).toHaveAttribute("aria-checked", "false");
  await expect(ai).toHaveAttribute("aria-checked", "true");
});

test("inside an invalid <Field>, data-invalid lands on every item and the border swaps to destructive", async ({ mount, page }) => {
  await mount(
    <Field error="Pick one" label="Who runs the game">
      <RadioGroup>
        <RadioGroupItem value="ai">An AI</RadioGroupItem>
        <RadioGroupItem value="human">A human GM</RadioGroupItem>
      </RadioGroup>
    </Field>,
  );
  // Field's `label` associates onto the GROUP (confirmed: the radiogroup gets named "Who runs the
  // game") — Base UI's per-item aria-labelledby then collides with it, so items can no longer be
  // resolved by their OWN option text here; the data-slot locator sidesteps that and is what
  // actually matters for this assertion (the token skin).
  const ai = page.locator('[data-slot="radio-group-item"]').first();
  await expect(ai).toHaveAttribute("data-invalid", "");
  await expect(ai).toHaveCSS("border-top-color", resolvedTokenColor("color.destructive"));
});

test("inside a <Field>, the group registers — aria-describedby wires the description", async ({ mount, page }) => {
  await mount(
    <Field description="Pick who narrates" label="Who runs the game">
      <RadioGroup>
        <RadioGroupItem value="ai">An AI</RadioGroupItem>
        <RadioGroupItem value="human">A human GM</RadioGroupItem>
      </RadioGroup>
    </Field>,
  );
  await expect(page.getByRole("radiogroup")).toHaveAttribute("aria-describedby", NON_EMPTY);
});

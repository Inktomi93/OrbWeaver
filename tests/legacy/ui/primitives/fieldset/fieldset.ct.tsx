// CT: the fieldset seal — the Legend gives an otherwise-nameless control group an accessible name
// (Base UI wires aria-labelledby from the <fieldset> to the Legend). The sanctioned way to name a
// RadioGroup/CheckboxGroup (ui-package-design §13 R2).
import { Fieldset, FieldsetLegend } from "@orb/ui/fieldset";
import { Input } from "@orb/ui/input";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { expect, test } from "@playwright/experimental-ct-react";

test("the Legend names the enclosing group (aria)", async ({ mount, page }) => {
  await mount(
    <Fieldset>
      <FieldsetLegend>Difficulty</FieldsetLegend>
      <RadioGroup>
        <RadioGroupItem value="easy">Easy</RadioGroupItem>
        <RadioGroupItem value="hard">Hard</RadioGroupItem>
      </RadioGroup>
    </Fieldset>,
  );
  // The <fieldset> exposes role="group"; Base UI names it via aria-labelledby → the Legend.
  await expect(page.getByRole("group", { name: "Difficulty" })).toBeVisible();
  // The nested radiogroup is still its own group and remains operable.
  await expect(page.getByRole("radiogroup")).toBeVisible();
});

test("disabled propagates natively to a nested real form control", async ({ mount, page }) => {
  // A native <fieldset disabled> only disables genuine form-associated descendants (input, button,
  // select, textarea, …) — RadioGroup/Checkbox render a styled `<span role="…">` for their visible
  // control (a hidden native input rides beside it, per R2), so THAT part doesn't pick up the
  // browser's native cascade. Input renders a real `<input>` directly, so it's the faithful CT for
  // Fieldset's actual disabling mechanism.
  await mount(
    <Fieldset disabled={true}>
      <FieldsetLegend>Profile</FieldsetLegend>
      <Input aria-label="Display name" />
    </Fieldset>,
  );
  const input = page.getByLabel("Display name");
  await expect(input).toBeDisabled();
  await expect(input).toHaveCSS("opacity", "0.5");
});

// CT: the radio-group seal — one-of-many selection (role="radio" per item, name from the wrapping
// label). Pointer selects one; arrow keys move the selection (Base UI roving tabindex).
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { expect, test } from "@playwright/experimental-ct-react";

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
  await expect(page.getByRole("radio", { name: "A human GM" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
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
  await expect.poll(() => seen.at(-1)).toBe("human");
});

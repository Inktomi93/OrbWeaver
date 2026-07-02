// CT: the toggle-group seal — single selection by default swaps the pressed item; multiple lets
// several stay pressed. Items are <Toggle>s identified by their `value`.
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { expect, test } from "@playwright/experimental-ct-react";

test("single-select swaps the pressed item", async ({ mount, page }) => {
  await mount(
    <ToggleGroup aria-label="Text alignment" defaultValue={["left"]}>
      <Toggle aria-label="Left" value="left">
        L
      </Toggle>
      <Toggle aria-label="Center" value="center">
        C
      </Toggle>
    </ToggleGroup>,
  );
  const left = page.getByRole("button", { name: "Left" });
  const center = page.getByRole("button", { name: "Center" });
  await expect(left).toHaveAttribute("aria-pressed", "true");
  await center.click();
  await expect(center).toHaveAttribute("aria-pressed", "true");
  await expect(left).toHaveAttribute("aria-pressed", "false");
});

test("multiple lets several stay pressed", async ({ mount, page }) => {
  await mount(
    <ToggleGroup aria-label="Text style" multiple={true}>
      <Toggle aria-label="Bold" value="bold">
        B
      </Toggle>
      <Toggle aria-label="Italic" value="italic">
        I
      </Toggle>
    </ToggleGroup>,
  );
  const bold = page.getByRole("button", { name: "Bold" });
  const italic = page.getByRole("button", { name: "Italic" });
  await bold.click();
  await italic.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(italic).toHaveAttribute("aria-pressed", "true");
});

test("onValueChange reports the pressed values", async ({ mount, page }) => {
  const seen: string[][] = [];
  await mount(
    <ToggleGroup
      aria-label="Text alignment"
      onValueChange={(value): void => {
        seen.push(value);
      }}
    >
      <Toggle aria-label="Left" value="left">
        L
      </Toggle>
      <Toggle aria-label="Center" value="center">
        C
      </Toggle>
    </ToggleGroup>,
  );
  await page.getByRole("button", { name: "Center" }).click();
  await expect.poll(() => seen.at(-1)).toEqual(["center"]);
});

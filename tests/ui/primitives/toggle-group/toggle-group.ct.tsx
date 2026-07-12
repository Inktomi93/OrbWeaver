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
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toEqual(["center"]);
});

function threeItemFixture(): ReturnType<typeof ToggleGroup> {
  return (
    <ToggleGroup aria-label="Text alignment">
      <Toggle aria-label="Left" value="left">
        L
      </Toggle>
      <Toggle aria-label="Center" value="center">
        C
      </Toggle>
      <Toggle aria-label="Right" value="right">
        R
      </Toggle>
    </ToggleGroup>
  );
}

test("roving tabindex: only one item is tabbable at a time", async ({ mount, page }) => {
  await mount(threeItemFixture());
  await expect(page.getByRole("button", { name: "Left" })).toHaveAttribute("tabindex", "0");
  await expect(page.getByRole("button", { name: "Center" })).toHaveAttribute("tabindex", "-1");
  await expect(page.getByRole("button", { name: "Right" })).toHaveAttribute("tabindex", "-1");
});

test("arrow keys move roving focus across items, wrapping at the ends", async ({ mount, page }) => {
  await mount(threeItemFixture());
  const left = page.getByRole("button", { name: "Left" });
  const center = page.getByRole("button", { name: "Center" });
  const right = page.getByRole("button", { name: "Right" });
  await left.focus();
  await page.keyboard.press("ArrowRight");
  await expect(center).toBeFocused();
  await expect(center).toHaveAttribute("tabindex", "0");
  await expect(left).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowRight");
  await expect(right).toBeFocused();
  // loopFocus defaults to true — arrowing past the last item wraps to the first.
  await page.keyboard.press("ArrowRight");
  await expect(left).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(right).toBeFocused();
});

test("Home/End jump roving focus to the first/last item", async ({ mount, page }) => {
  await mount(threeItemFixture());
  await page.getByRole("button", { name: "Center" }).focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("button", { name: "Right" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("button", { name: "Left" })).toBeFocused();
});

test("disabled disables every item and drops the group from the tab order", async ({
  mount,
  page,
}) => {
  await mount(
    <div>
      <button type="button">Before</button>
      <ToggleGroup aria-label="Text alignment" disabled={true}>
        <Toggle aria-label="Left" value="left">
          L
        </Toggle>
        <Toggle aria-label="Center" value="center">
          C
        </Toggle>
      </ToggleGroup>
    </div>,
  );
  const left = page.getByRole("button", { name: "Left" });
  const center = page.getByRole("button", { name: "Center" });
  await expect(left).toBeDisabled();
  await expect(center).toBeDisabled();
  await page.getByRole("button", { name: "Before" }).focus();
  await page.keyboard.press("Tab");
  await expect(left).not.toBeFocused();
  await expect(center).not.toBeFocused();
});

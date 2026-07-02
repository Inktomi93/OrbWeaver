// CT: the switch seal — real role="switch" semantics: pointer + keyboard toggle aria-checked,
// checked state lands as the primary token track. (Base UI renders the styled span + a hidden
// form input as siblings, so the role locator is the element under test, not the mount handle.)
import { Switch } from "@orb/ui/switch";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

test("click toggles aria-checked", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" />);
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("aria-checked", "false");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("keyboard toggles too, and checked wears the primary token", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" defaultChecked={true} />);
  const control = page.getByRole("switch");
  await expect(control).toHaveCSS("background-color", TOKENS["color.primary"].value);
  await control.press("Space");
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("onCheckedChange reports the next state", async ({ mount, page }) => {
  const seen: boolean[] = [];
  await mount(
    <Switch
      aria-label="Streaming"
      onCheckedChange={(checked): void => {
        seen.push(checked);
      }}
    />,
  );
  await page.getByRole("switch").click();
  await expect.poll(() => seen.at(-1)).toBe(true);
});

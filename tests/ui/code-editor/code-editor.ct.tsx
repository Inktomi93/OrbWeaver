import { expect, test } from "@playwright/experimental-ct-react";
import { ControlledEditor, ReadOnlyEditor } from "./code-editor.fixtures";

const INITIAL_CSS = "body { color: red; }";
// The resolved --color-background token (Hearth) — the theme test pins the ONE mapping site.
const BACKGROUND_OKLCH = /oklch\(0\.175 0\.012 65\)/u;

test("mounts with the controlled value", async ({ mount }) => {
  const component = await mount(<ControlledEditor initialValue={INITIAL_CSS} />);
  await expect(component.locator(".cm-content")).toContainText("color: red");
});

test("typing flows out through onChange", async ({ mount }) => {
  const component = await mount(<ControlledEditor initialValue={INITIAL_CSS} />);
  const content = component.locator(".cm-content");
  await content.click();
  await content.pressSequentially("abc");
  await expect(component.getByRole("status")).toContainText("abc");
  // The controlled round-trip (onChange → value prop → no-op dispatch) must not clobber the doc.
  await expect(content).toContainText("color: red");
});

test("readOnly blocks edits", async ({ mount }) => {
  const component = await mount(<ReadOnlyEditor value="locked" />);
  const content = component.locator(".cm-content");
  await content.click();
  await content.pressSequentially("x");
  await expect(content).toHaveText("locked");
});

test("the token theme is applied (background resolves the design token)", async ({ mount }) => {
  const component = await mount(<ControlledEditor initialValue={INITIAL_CSS} />);
  await expect(component.locator(".cm-editor")).toHaveCSS("background-color", BACKGROUND_OKLCH);
});

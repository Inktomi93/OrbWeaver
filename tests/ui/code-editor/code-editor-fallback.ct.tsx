// @subject packages/ui/src/code-editor/fallback.tsx
// @subject packages/ui/src/code-editor/code-editor.tsx
// The fallback a caller shows while the editor's chunk loads is the box the editor settles into: the same height for an empty document,
// a one-line one and a multi-line one that ends in a newline, with and without the line-number gutter.
import { LAYOUT_SUBPIXEL_PX, settledBox } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { CodeEditorFallbackStory } from "./_code-editor-fallback-stories.tsx";

const STORY = "tests/ui/code-editor/_code-editor-fallback-stories/CodeEditorFallbackStory";
const DOCUMENTS = ["", "a { color: red; }", "a {\n  color: red;\n}\n"] as const;
const SETUPS = ["full", "line"] as const;

for (const setup of SETUPS) {
  for (const value of DOCUMENTS) {
    test(`the ${setup} editor's fallback holds the box of ${JSON.stringify(value)}`, async ({ mount, page }) => {
      await mount<typeof CodeEditorFallbackStory>(STORY, { value, setup });
      await expect(page.getByRole("textbox", { name: "Document", exact: true })).toBeVisible();
      const editor = await settledBox(page.getByRole("region", { name: "Editor", exact: true }));
      const fallback = await settledBox(page.getByRole("region", { name: "Fallback", exact: true }));
      expect(fallback.width).toBe(editor.width);
      expect(Math.abs(fallback.height - editor.height)).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
    });
  }
}

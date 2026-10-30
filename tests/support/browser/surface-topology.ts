import type { Page, TestInfo } from "@playwright/test";
import { attachNativeFile } from "../node/native-attachments.ts";
import type { SurfacePaneRequest } from "../node/surface-audit.ts";

/** Preserve the requested layout separately from the shell's resolved modes, capabilities, and actual content box. */
export async function surfaceTopology(info: TestInfo, { page, requested }: { readonly page: Page; readonly requested: SurfacePaneRequest }): Promise<void> {
  const actual = await page.locator(".shell-grid").evaluate((grid) => {
    const content = grid.querySelector<HTMLElement>(".shell-content");
    const list = grid.querySelector<HTMLElement>('.shell-panel[data-panel-side="list"]');
    const context = grid.querySelector<HTMLElement>('.shell-panel[data-panel-side="context"]');
    if (content === null || list === null || context === null) {
      throw new Error("Shell topology requires the real Content, List, and Context hosts");
    }
    const panel = (
      node: HTMLElement,
    ): {
      readonly available: boolean;
      readonly mode: string;
      readonly sheet: boolean;
      readonly inert: boolean;
      readonly role: string | null;
      readonly width: number;
      readonly height: number;
    } => {
      const available = node.getAttribute("data-panel-available");
      const mode = node.getAttribute("data-panel-mode");
      if ((available !== "true" && available !== "false") || mode === null) {
        throw new Error("The shell did not publish its registry capability and resolved panel mode");
      }
      const box = node.getBoundingClientRect();
      return {
        available: available === "true",
        mode,
        sheet: node.hasAttribute("data-panel-sheet"),
        inert: node.inert,
        role: node.getAttribute("role"),
        width: box.width,
        height: box.height,
      };
    };
    const box = content.getBoundingClientRect();
    return {
      section: grid.getAttribute("data-section"),
      viewport: { width: innerWidth, height: innerHeight, coarsePointer: matchMedia("(pointer: coarse)").matches },
      list: panel(list),
      context: panel(context),
      content: { x: box.x, y: box.y, width: box.width, height: box.height, inert: content.inert, display: getComputedStyle(content).display },
      gridTemplateColumns: getComputedStyle(grid).gridTemplateColumns,
    };
  });
  await attachNativeFile(info, info, "pane-topology", { body: JSON.stringify({ requested, actual }, null, 2), contentType: "application/json" });
}

// Page drivers for the avatar control's cases: a refusal line read as the browser painted it, and whether the page's pointer can hover.
// The case table is Node-rooted and reaches no DOM declaration, so the in-page reads live here, in the browser world.

import { MEDIA_QUERIES, TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";

/** A refusal line as the browser laid it out and painted it. */
export interface RefusalLineReading {
  /** The line's resolved ink, and the resolved destructive ink beside it: the voice is the destructive one when they match. */
  readonly ink: string;
  readonly destructiveInk: string;
  readonly left: number;
  readonly width: number;
  readonly lines: number;
}

export function readRefusalLine(line: Locator): Promise<RefusalLineReading> {
  return line.evaluate((node, destructiveVar) => {
    const probe = document.createElement("div");
    probe.style.color = `var(${destructiveVar})`;
    node.append(probe);
    const destructiveInk = getComputedStyle(probe).color;
    probe.remove();
    const { left, width, height } = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return { ink: style.color, destructiveInk, left, width, lines: Math.round(height / Number.parseFloat(style.lineHeight)) };
  }, TOKENS["color.destructive"].cssVar);
}

/** Whether the page's primary pointer can hover. */
export function pageCanHover(page: Page): Promise<boolean> {
  return page.evaluate((query) => globalThis.matchMedia(query).matches, MEDIA_QUERIES["hover-capable"]);
}

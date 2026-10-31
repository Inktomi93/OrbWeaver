// A control's laid-out box in page coordinates.

import type { Locator } from "@playwright/test";

export interface LayoutBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The control's box. A hidden or detached control has none, which is a fixture break rather than a layout case. */
export async function boxOf(locator: Locator): Promise<LayoutBox> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("The measured control has no layout box; it is hidden or detached");
  }
  return box;
}

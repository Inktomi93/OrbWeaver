import type { Locator } from "@playwright/test";
import { settledBox } from "./shell-drive.ts";

interface ActionGroupGeometry {
  readonly host: Awaited<ReturnType<typeof settledBox>>;
  readonly controls: readonly Awaited<ReturnType<typeof settledBox>>[];
  readonly viewportWidth: number;
  readonly inlineOverflow: number;
}

/** Read actual action boxes against the explicit containing region and viewport, not the document's scroll width. */
export async function actionGroupGeometry(region: Locator, actions: readonly Locator[]): Promise<ActionGroupGeometry> {
  const host = await settledBox(region);
  const controls = await Promise.all(actions.map(settledBox));
  const viewportWidth = await region.page().evaluate(() => innerWidth);
  const inlineOverflow = Math.max(
    0,
    ...controls.flatMap((box) => [host.x - box.x, box.x + box.width - host.x - host.width, -box.x, box.x + box.width - viewportWidth]),
  );
  return { host, controls, viewportWidth, inlineOverflow };
}

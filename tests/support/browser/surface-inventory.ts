import type { TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import type { SurfaceCoverageInventory } from "../iso/surface-coverage.ts";
import { SURFACE_INVENTORY_ATTACHMENT, surfaceCoverageInventorySchema, surfaceCoverageKey } from "../iso/surface-coverage.ts";
import { attachNativeFile } from "../node/native-attachments.ts";

/** Retain immutable native evidence and fail newly expected surfaces without a witnessed or explicit disposition. */
export async function publishSurfaceInventory(info: TestInfo, inventory: SurfaceCoverageInventory): Promise<void> {
  const parsed = surfaceCoverageInventorySchema.parse(inventory);
  await attachNativeFile(info, info, SURFACE_INVENTORY_ATTACHMENT, { body: JSON.stringify(parsed, null, 2), contentType: "application/json" });
  const observed = new Map(parsed.observations.map((observation) => [surfaceCoverageKey(observation), observation]));
  const missing = parsed.expected.filter((subject) => {
    const observation = observed.get(surfaceCoverageKey(subject));
    return observation === undefined || observation.disposition === "unvisited";
  });
  expect.soft(missing, `${parsed.name}: newly expected production subjects lack witnessed coverage; inspect the native inventory`).toEqual([]);
}

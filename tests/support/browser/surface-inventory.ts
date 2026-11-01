import type { TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import type { SurfaceCoverageInventory } from "../iso/surface-coverage.ts";
import { auditSurfaceInventory, SURFACE_INVENTORY_ATTACHMENT } from "../iso/surface-coverage.ts";
import { attachNativeFile } from "../node/native-attachments.ts";

/** Retain the native evidence, then fail an expected subject without a witness and any skip without a listed reason. */
export async function publishSurfaceInventory(info: TestInfo, inventory: SurfaceCoverageInventory): Promise<void> {
  // Attach before judging, so a rejected inventory still reaches the walk report.
  await attachNativeFile(info, info, SURFACE_INVENTORY_ATTACHMENT, { body: JSON.stringify(inventory, null, 2), contentType: "application/json" });
  const audit = auditSurfaceInventory(inventory);
  expect.soft(audit.malformed, `${audit.name}: the inventory does not match the coverage vocabulary`).toEqual([]);
  expect.soft(audit.unlistedSkips, `${audit.name}: a skipped subject must name a reason from SURFACE_SKIP_REASONS`).toEqual([]);
  expect.soft(audit.missing, `${audit.name}: newly expected production subjects lack witnessed coverage; inspect the native inventory`).toEqual([]);
}

import { isBuiltin } from "node:module";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { InventoryRuntime, InventoryRuntimeRole } from "./semantic-inventory-runtime-contract.ts";
import {
  inventoryRuntimeHeaderSchema,
  inventoryRuntimeResolutionSchema,
  inventoryRuntimeSchema,
  inventoryRuntimeSourceSchema,
} from "./semantic-inventory-runtime-contract.ts";

const payloadRow = z.object({ payload: z.string() });
const orderedPayloadRow = payloadRow.extend({ ordinal: z.number().int().nonnegative() });

/** Runtime dependencies remain indexed metadata, separate from projected native subject inputs. */
export function readInventoryRuntime(db: DatabaseSync, id: string, role: InventoryRuntimeRole): InventoryRuntime {
  const row = db.prepare("SELECT payload FROM inventory_runtime_header WHERE partition=? AND role=?").get(id, role);
  const header = inventoryRuntimeHeaderSchema.parse(JSON.parse(payloadRow.parse(row).payload));
  const sources = db
    .prepare("SELECT ordinal,payload FROM inventory_runtime_source WHERE partition=? AND role=? ORDER BY ordinal")
    .all(id, role)
    .map((value, ordinal) => {
      const source = orderedPayloadRow.parse(value);
      if (source.ordinal !== ordinal) {
        throw new Error("native implementation source census is incomplete");
      }
      return inventoryRuntimeSourceSchema.parse(JSON.parse(source.payload));
    });
  const resolutions = db
    .prepare("SELECT ordinal,payload FROM inventory_runtime_resolution WHERE partition=? AND role=? ORDER BY ordinal")
    .all(id, role)
    .map((value, ordinal) => {
      const request = orderedPayloadRow.parse(value);
      if (request.ordinal !== ordinal) {
        throw new Error("native implementation resolution census is incomplete");
      }
      return inventoryRuntimeResolutionSchema.parse(JSON.parse(request.payload));
    });
  if (header.sourceCount !== sources.length || header.resolutionCount !== resolutions.length) {
    throw new Error("native implementation dependency census is incomplete");
  }
  const urls = new Set(sources.map((source) => source.url));
  if (
    urls.size !== sources.length ||
    new Set(header.roots).size !== header.roots.length ||
    header.roots.some((url) => !urls.has(url)) ||
    sources.some((source) => !source.url.startsWith("file:") || fileURLToPath(source.url) !== source.path) ||
    resolutions.some(
      (request) =>
        !urls.has(request.context.parentURL) ||
        (request.outcome.kind === "resolved" &&
          !isBuiltin(request.outcome.value.url) &&
          request.outcome.value.url !== header.bootstrap &&
          !urls.has(request.outcome.value.url)),
    )
  ) {
    throw new Error("native implementation dependency graph is not closed");
  }
  return inventoryRuntimeSchema.parse({ ...header, sources, resolutions });
}

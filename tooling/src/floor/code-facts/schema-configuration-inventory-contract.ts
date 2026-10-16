// Config observations retain ordered effective entries and a closed native array/spread value graph.
import { z } from "zod";
import type { InventoryModuleOrigin } from "./module-origin-inventory-contract.ts";
import type { InventoryAuthoredValueProjection } from "./projection-inventory-contract.ts";
import type { InventoryInvocationReference, InventorySpan } from "./semantic-inventory-contract.ts";

export interface InventorySchemaConfiguration {
  readonly entries: InventoryInvocationReference<readonly { readonly name: string; readonly value: InventorySpan }[]>;
  readonly values: readonly {
    readonly node: InventorySpan;
    readonly module: InventoryInvocationReference<InventoryModuleOrigin>;
    readonly stable: InventoryInvocationReference<InventorySpan>;
    readonly authored: InventoryAuthoredValueProjection;
    readonly children: readonly InventorySpan[];
  }[];
}

/** Existing inventory factories own reference, span and authored-value vocabulary. */
export function schemaConfigurationSchema(
  span: z.ZodType<InventorySpan>,
  reference: <Value>(value: z.ZodType<Value>) => z.ZodType<InventoryInvocationReference<Value>>,
  authored: z.ZodType<InventoryAuthoredValueProjection>,
  module: z.ZodType<InventoryModuleOrigin>,
): z.ZodType<InventorySchemaConfiguration> {
  return z
    .strictObject({
      entries: reference(z.array(z.strictObject({ name: z.string(), value: span }))),
      values: z.array(z.strictObject({ node: span, module: reference(module), stable: reference(span), authored, children: z.array(span) })),
    })
    .superRefine((input, context) => {
      const byNode = new Map(input.values.map((value) => [JSON.stringify(value.node), value]));
      if (byNode.size !== input.values.length) {
        context.addIssue({ code: "custom", message: "native schema configuration value coverage is ambiguous" });
        return;
      }
      const visited = new Set<string>();
      const missing = new Set<string>();
      const visit = (node: InventorySpan): void => {
        const key = JSON.stringify(node);
        if (visited.has(key)) {
          return;
        }
        const value = byNode.get(key);
        if (value === undefined) {
          missing.add(key);
          return;
        }
        visited.add(key);
        for (const child of value.children) {
          visit(child);
        }
      };
      if (input.entries.kind === "resolved") {
        for (const entry of input.entries.value) {
          visit(entry.value);
        }
      }
      if (missing.size > 0) {
        context.addIssue({ code: "custom", message: "native schema configuration value coverage is incomplete" });
      }
      if (visited.size !== byNode.size) {
        context.addIssue({ code: "custom", message: "native schema configuration value coverage is foreign" });
      }
    });
}

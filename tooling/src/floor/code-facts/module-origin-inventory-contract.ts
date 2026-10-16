// The existing invocation schema remains the sole wire spelling of native module origin.
import type { InventoryInvocationEvidence, InventoryInvocationReference } from "./semantic-inventory-contract.ts";

export type InventoryModuleOrigin =
  NonNullable<InventoryInvocationEvidence["profiles"][number]["module"]> extends InventoryInvocationReference<infer Origin> ? Origin : never;

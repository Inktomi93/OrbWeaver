// The existing invocation schema remains the sole wire spelling of native module origin.
import type { z } from "zod";
import type { moduleValueSchema } from "./semantic-inventory-contract.ts";

export type InventoryModuleOrigin = z.infer<typeof moduleValueSchema>;

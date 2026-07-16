import { z } from "zod";

// A JSON-serializable value. Used to type generic settings KV honestly: a stored setting can be any
// JSON shape, but it is NOT `any` — it cannot be a function, a class instance, undefined, etc. This
// closes the `z.any()` escape hatch while keeping the KV generic. Kept a generic primitive (no domain
// shape) so every layer can lean on it.

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

import { z } from "zod";

export const renameInputSchema = z.strictObject({ id: z.string(), name: z.string() });
export const pageInputSchema = z
  .strictObject({ cursor: z.strictObject({ at: z.number() }).optional(), limit: z.number() })
  .optional();
export const pairInputSchema = z.strictObject({ left: z.object({ a: z.string() }), right: z.strictObject({ b: z.string() }) });

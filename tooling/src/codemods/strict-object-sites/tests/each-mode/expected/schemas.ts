import { z } from "zod";

export const renameInputSchema = z.strictObject({ id: z.string(), name: z.string() });
export const pageInputSchema = z
  .object({ cursor: z.strictObject({ at: z.number() }).optional(), limit: z.number() }).strip()
  .optional();
export const pairInputSchema = z.strictObject({ left: z.object({ a: z.string() }).strip(), right: z.strictObject({ b: z.string() }) });
export const storedRowSchema = z.object({ kept: z.string() }).strip();

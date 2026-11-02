import { z } from "zod";

export const renameInputSchema = z.object({ id: z.string(), name: z.string() });
export const pageInputSchema = z
  .object({ cursor: z.object({ at: z.number() }).optional(), limit: z.number() })
  .optional();
export const pairInputSchema = z.strictObject({ left: z.object({ a: z.string() }), right: z.object({ b: z.string() }) });
export const storedRowSchema = z.object({ kept: z.string() }).strip();
export const reclassifiedSchema = z
  .object({ wireOnly: z.string() })
  .strip()
  .optional();

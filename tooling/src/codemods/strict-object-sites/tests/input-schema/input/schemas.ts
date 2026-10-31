import { z } from "zod";

export const renameInputSchema = z.object({ id: z.string(), name: z.string() });
export const pageInputSchema = z
  .object({ cursor: z.object({ at: z.number() }).optional(), limit: z.number() })
  .optional();
export const pairInputSchema = z.object({ left: z.object({ a: z.string() }), right: z.object({ b: z.string() }) });

import { z } from "zod";

// The external card keeps its unknown keys; its nested asset is listed strip, and the unlisted view keeps its spelling.
export const cardSchema = z.object({ name: z.string(), asset: z.object({ uri: z.string() }).optional() }).loose();
export const bookSchema = z
  .object({ entries: z.array(z.string()) })
  .loose()
  .optional();
export const tagViewSchema = z.object({ id: z.string(), name: z.string(), usage: z.number() });
export const shapeOnly = { object: z.string() };

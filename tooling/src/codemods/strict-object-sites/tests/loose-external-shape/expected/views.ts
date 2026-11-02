import { z } from "zod";

// The external card keeps its unknown keys; its nested asset is listed strip, and the unlisted view keeps its spelling.
export const cardSchema = z.looseObject({ name: z.string(), asset: z.object({ uri: z.string() }).strip().optional() });
export const bookSchema = z
  .looseObject({ entries: z.array(z.string()) })
  .optional();
export const tagViewSchema = z.object({ id: z.string(), name: z.string(), usage: z.number() });
export const shapeOnly = { object: z.string() };

import { z } from "zod";

// Only the input on line 5 is listed; the output view and the tool-args schema keep strip mode.
export const tagViewSchema = z.object({ id: z.string(), name: z.string(), usage: z.number() });
export const renameTagInputSchema = z.object({ id: z.string(), name: z.string() });
export const tagToolArgsSchema = z.object({ name: z.string() });
export const shapeOnly = { object: z.string() };

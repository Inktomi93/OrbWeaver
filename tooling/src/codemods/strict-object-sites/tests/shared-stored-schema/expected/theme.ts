import { z } from "zod";

// `themeSchema` also parses a stored row, so it is listed strip; only the input wrapper around it becomes strict.
export const themeSchema = z.object({ accent: z.string().optional(), bubble: z.object({ fill: z.string() }).strip().optional() }).strip();
export const createThemeInputSchema = z.strictObject({ name: z.string(), theme: themeSchema });
export function readThemeRow(raw: unknown): z.infer<typeof themeSchema> {
  return themeSchema.catch({}).parse(raw);
}

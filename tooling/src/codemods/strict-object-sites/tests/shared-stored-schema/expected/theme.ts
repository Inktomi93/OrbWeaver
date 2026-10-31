import { z } from "zod";

// `themeSchema` also parses a stored row, so it is not listed; only the input wrapper around it changes.
export const themeSchema = z.object({ accent: z.string().optional(), bubble: z.object({ fill: z.string() }).optional() });
export const createThemeInputSchema = z.strictObject({ name: z.string(), theme: themeSchema });
export function readThemeRow(raw: unknown): z.infer<typeof themeSchema> {
  return themeSchema.catch({}).parse(raw);
}

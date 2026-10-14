import { z } from "zod";

export const SNIPPET_ERROR_KINDS = ["parse", "runtime"] as const;

export const snippetResultSchema = z.strictObject({
  logLines: z.array(z.string()).readonly(),
  error: z.string().exactOptional(),
  errorKind: z.enum(SNIPPET_ERROR_KINDS).exactOptional(),
  errorLine: z.int().exactOptional(),
});
export type SnippetResult = z.output<typeof snippetResultSchema>;

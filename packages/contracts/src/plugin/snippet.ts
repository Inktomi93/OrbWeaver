import { z } from "zod";

const SNIPPET_ERROR_KINDS = ["parse", "runtime"] as const;

export const snippetResultSchema = z.union([
  z.strictObject({
    logLines: z.array(z.string()).readonly(),
    error: z.never().exactOptional(),
    errorKind: z.never().exactOptional(),
    errorLine: z.never().exactOptional(),
  }),
  z.strictObject({
    logLines: z.array(z.string()).readonly(),
    error: z.string(),
    errorKind: z.enum(SNIPPET_ERROR_KINDS).exactOptional(),
    errorLine: z.int().exactOptional(),
  }),
]);
export type SnippetResult = z.output<typeof snippetResultSchema>;

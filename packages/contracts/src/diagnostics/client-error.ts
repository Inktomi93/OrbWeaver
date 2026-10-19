// Error telemetry accepts bounded diagnostic text; the log sink separately scrubs URLs and correlation ids.
import { z } from "zod";

const CLIENT_ERROR_TEXT_MAX = 20_000;
const CLIENT_ERROR_URL_MAX = 4000;
const CLIENT_ERROR_REQUEST_ID_MAX = 200;

/** The anonymous-allowed client error report; unrecognized fields are stripped at the transport boundary. */
export const clientErrorReportSchema = z.object({
  message: z.string().max(CLIENT_ERROR_TEXT_MAX),
  stack: z.string().max(CLIENT_ERROR_TEXT_MAX).optional(),
  ownerStack: z.string().max(CLIENT_ERROR_TEXT_MAX).optional(),
  url: z.string().max(CLIENT_ERROR_URL_MAX),
  // opaque client-supplied correlation string, not an entity id (mirrors X-Request-Id's own charset-only validation in observability/middleware.ts — never a TypeID/nanoid-branded domain id).
  requestId: z.string().max(CLIENT_ERROR_REQUEST_ID_MAX).optional(),
});
export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;

// Error telemetry accepts bounded diagnostic text; the log sink separately scrubs URLs and correlation ids.
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";

const CLIENT_ERROR_TEXT_MAX = 20_000;
const CLIENT_ERROR_URL_MAX = 4000;
const CLIENT_ERROR_REQUEST_ID_MAX = 200;

/** The correlation text a client error report carries; the diagnostic sink scrubs it before it is logged. */
const clientRequestIdSchema = brandedId("ClientRequestId").refine((value) => value.length <= CLIENT_ERROR_REQUEST_ID_MAX);

/** The anonymous-allowed client error report; unrecognized fields are stripped at the transport boundary. */
export const clientErrorReportSchema = z.strictObject({
  message: z.string().max(CLIENT_ERROR_TEXT_MAX),
  stack: z.string().max(CLIENT_ERROR_TEXT_MAX).optional(),
  ownerStack: z.string().max(CLIENT_ERROR_TEXT_MAX).optional(),
  url: z.string().max(CLIENT_ERROR_URL_MAX),
  requestId: clientRequestIdSchema.optional(),
});
export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;

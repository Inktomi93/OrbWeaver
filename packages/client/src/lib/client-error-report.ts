// The pure wire-payload builder for a caught client error. Deliberately tRPC-free: lib/ sits below
// data/ in the one-directional client cake, so this never reaches back into #data for the client — the
// actual wire call is wired at main.tsx. `url` is injected (not read from globalThis.location here) so
// this stays plain-data-in/plain-data-out and cheaply testable under the node unit lane.

import type { ClientErrorReport } from "@orb/contracts/diagnostics";
import { clientErrorReportSchema, REQUEST_ID_HEADER } from "@orb/contracts/diagnostics";
import { isTRPCClientError } from "@trpc/client";

/** The render error builder's readonly projection of the client error wire contract. */
export type ClientErrorPayload = Readonly<Pick<ClientErrorReport, "message" | "stack" | "ownerStack" | "url" | "requestId">>;

/** The correlation id the server stamped on the response of the tRPC call that failed, or `undefined` for an error no response carried. */
function failingRequestId(error: Error): ClientErrorReport["requestId"] {
  const response = isTRPCClientError(error) ? error.meta?.["response"] : undefined;
  const stamped = response instanceof Response ? response.headers.get(REQUEST_ID_HEADER) : null;
  return clientErrorReportSchema.shape.requestId.safeParse(stamped).data;
}

/** Build the report payload from a caught render error + its (DEV-only, possibly null) owner stack. */
export function buildClientErrorPayload(error: Error, ownerStack: string | null, url: string): ClientErrorPayload {
  const requestId = failingRequestId(error);
  return {
    message: error.message,
    ...(error.stack === undefined ? {} : { stack: error.stack }),
    ...(ownerStack === null ? {} : { ownerStack }),
    url,
    ...(requestId === undefined ? {} : { requestId }),
  };
}

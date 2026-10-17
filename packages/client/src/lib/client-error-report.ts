// The pure wire-payload builder for a caught client error. Deliberately tRPC-free: lib/ sits below
// data/ in the one-directional client cake, so this never reaches back into #data for the client — the
// actual wire call is wired at main.tsx. `url` is injected (not read from globalThis.location here) so
// this stays plain-data-in/plain-data-out and cheaply testable under the node unit lane.

import type { ClientErrorReport } from "@orb/contracts/diagnostics";

/** The render error builder's readonly projection of the client error wire contract. */
export type ClientErrorPayload = Readonly<Pick<ClientErrorReport, "message" | "stack" | "ownerStack" | "url">>;

/** Build the report payload from a caught render error + its (DEV-only, possibly null) owner stack. */
export function buildClientErrorPayload(error: Error, ownerStack: string | null, url: string): ClientErrorPayload {
  return {
    message: error.message,
    ...(error.stack === undefined ? {} : { stack: error.stack }),
    ...(ownerStack === null ? {} : { ownerStack }),
    url,
  };
}

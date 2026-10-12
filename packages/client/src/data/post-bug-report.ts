// The bug-report POST — the data/ seam for the `/api/_debug` gate, a Hono route outside tRPC. A feature builds
// the report and reads the refusal; the wire primitive stays here (R5, client-architecture-state-and-gates.md §10).

/** POST one JSON report body to the debug gate. Same-origin and credentialed: the gate admits an owner session. */
export function postBugReport(route: string, body: string): Promise<Response> {
  return fetch(route, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body,
  });
}

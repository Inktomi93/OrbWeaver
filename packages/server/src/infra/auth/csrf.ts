// The CSRF mutation-header signal. `SameSite=Lax` + this custom header is the anti-CSRF signal: a
// cross-site page can't set a custom request header without a CORS preflight the app never grants.
// infra/auth PRODUCES the signal; every GATE that reads it lives at the route tier, and there is no
// single via-keying any more (spine invariant #9 — the gate is split by CONTENT-TYPE PHYSICS):
//   · the four byte-ingest registrars (`entry/http/upload.ts`, `import.ts`, `import-tree.ts`,
//     `import-chat.ts`) accept a CORS-SIMPLE content-type, so they gate `via !== "header"` — cookie AND
//     the loopback owner fallback both must carry the header (#300);
//   · the tRPC ladder (`transport/trpc/trpc.ts`) gates `via === "cookie"` only, because `entry/app.ts`'s
//     content-type belt already refuses every non-`application/json` POST to the mount — which is what
//     keeps the un-cookied loopback dev tooling working without the header.
// A new route that accepts a CORS-simple body belongs in the first class; one that is JSON-only belongs in
// the second ONLY if a belt refuses the other content-types. This flag is inert without one of them.

// The header NAME's one home moved to `@orb/contracts/identity` (the client sends it, so it is a
// cross-boundary wire fact — promoted Phase 6); the infra/auth barrel re-exports it for the
// existing server-side consumers. This file keeps only the signal predicate.
import { CSRF_HEADER } from "@orb/contracts/identity";

/** True when the request carries the custom CSRF header (any value). */
export function hasCsrfHeader(headers: Headers): boolean {
  return headers.get(CSRF_HEADER) !== null;
}

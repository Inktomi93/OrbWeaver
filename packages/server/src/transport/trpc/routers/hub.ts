// transport/trpc/routers/hub — the remote-catalog surface (D61). v1 = the gif slice (search + import);
// card-hub browse verbs land with H2+. authed; owner-scoped. Thin: validate with the `@orb/contracts/hub`
// wire schemas → `ctx.services.hub.<verb>` passing the resolved `Principal` as the actor (the same
// actor-passing shape as the other routers). All egress + the SSRF host allowlist + the image guard live
// DOWN in `infra/network/gif-search` (compose-bound ops); the router never touches a URL or a fetch.

import { gifImportParamsSchema, gifSearchParamsSchema } from "@orb/contracts/hub";
import { authedProcedure, t } from "../trpc";

export const hubRouter = t.router({
  // A read (search) — cacheable by the client; the acting principal's own gif-search key is resolved
  // server-side (never on the wire). `limit` is clamped 1..50 at the schema (the gif-count DoS bound).
  searchGifs: authedProcedure
    .input(gifSearchParamsSchema)
    .query(({ ctx, input }) => ctx.services.hub.searchGifs({ principal: ctx.auth, ...input })),

  // Import one gif into the caller's gallery (optionally as a character's subject). The subject character
  // ownership is gated EARLY (leak-free NOT_FOUND before any fetch); the URL host is re-validated against
  // the Tenor allowlist and the bytes magic-validated before the store.
  importGif: authedProcedure
    .input(gifImportParamsSchema)
    .mutation(({ ctx, input }) => ctx.services.hub.importGif({ principal: ctx.auth, ...input })),
});

// transport/trpc/routers/connection — the model-catalog + capability surface (core/Tier-4-Transport.md). The
// browse reads are authed; `refreshCatalog` (fetch OR `/models` → write the KV snapshot) is admin-gated.
// Thin: validate → `ctx.services.connection.<verb>` → map errors. The turn-time `resolveRole`/`resolveChat`
// verbs are internal (chat's turn path, P5) — NOT exposed here. `source` derives from the credentials axis
// (`ChatSource` = `CredentialSource`).

import { credentialSourceSchema } from "@orb/contracts/credentials";
import { z } from "zod";
import { adminProcedure, authedProcedure, t } from "../trpc";

export const connectionRouter = t.router({
  getCatalog: authedProcedure.query(({ ctx, signal }) =>
    ctx.services.connection.getCatalog({ signal }),
  ),

  getModelCapability: authedProcedure
    .input(z.object({ model: z.string().min(1), source: credentialSourceSchema }))
    .query(({ ctx, input }) =>
      ctx.services.connection.getModelCapability({ model: input.model, source: input.source }),
    ),

  refreshCatalog: adminProcedure.mutation(({ ctx, signal }) =>
    ctx.services.connection.refreshCatalog({ signal }),
  ),

  // The max-pro-sub host-Claude health check (neo `testClaudeAuth` — Tier-4 maps it here). A MUTATION
  // despite being read-shaped: it spends a (tiny) generation, so it keeps tRPC's CSRF gate (the
  // credentials-router esoteric-#9 posture). authed at the transport; the D17 OWNER gate runs inside
  // credentials' max-pro-sub mint (the domain seam) — a non-owner rejects there, leak-free.
  testClaudeAuth: authedProcedure.mutation(({ ctx }) =>
    ctx.services.connection.testClaudeAuth({ principal: ctx.auth }),
  ),

  // The OpenRouter account reads (neo `orCredits` / the generation-cost settle) — queries against the
  // CALLER's own key (abuse spends OpenRouter's account-API quota upstream, not a $-generation; the neo
  // rate-limit note). A missing/revoked key is the domain's DomainNoCredentialError (the client banner).
  orCredits: authedProcedure.query(({ ctx, signal }) =>
    ctx.services.connection.getOrCredits({ principal: ctx.auth, signal }),
  ),

  orGenerationCost: authedProcedure
    // biome-ignore lint/plugin/no-raw-id: generationId is OpenRouter's UPSTREAM generation handle (their id namespace), not a branded orbweaver entity id.
    .input(z.object({ generationId: z.string().min(1) }))
    .query(({ ctx, input, signal }) =>
      ctx.services.connection.getGenerationCost({
        principal: ctx.auth,
        generationId: input.generationId,
        signal,
      }),
    ),
});

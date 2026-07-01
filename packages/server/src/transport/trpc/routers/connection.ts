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
});

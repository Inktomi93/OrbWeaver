// transport/trpc/routers/expressions — the character sprite-binding CRUD surface (Tier-4-Transport).
// authed; owner-scoped writes, owner-OR-chat-member read (the 01 §6 membership exception, gated inside the
// domain via the injected `assertCharacterVisible`). Thin: validate the wire schema → `caller: ctx.auth` →
// `ctx.services.expressions.<verb>` → the global error-mapping maps `SpriteNotFoundError` (a
// `DomainNotFoundError`) → NOT_FOUND. Input shapes derive from `@orb/contracts/expressions` (one wire home).
//
// The classify hook (`onTurnCompleted`) is called through the injected ChatContext op, never a router. The
// sheet-generation enqueue (`generateSheet` → E4's `generateSpriteSheet`) IS front-door: owner-gated on the
// characterId, returns the workload id (the async job reports progress on the workloads stream). On a deploy
// without imagery it maps `ExpressionsNotConfiguredError` → BAD_REQUEST (the client hides the CTA).

import { generateSpriteSheetSchema, listSpritesSchema, removeSpriteSchema, setSpriteSchema } from "@orb/contracts/expressions";
import { authedProcedure, t } from "../trpc";

export const expressionsRouter = t.router({
  set: authedProcedure.input(setSpriteSchema).mutation(({ ctx, input }) => ctx.services.expressions.setSprite({ caller: ctx.auth, ...input })),

  list: authedProcedure.input(listSpritesSchema).query(({ ctx, input }) => ctx.services.expressions.listSprites({ caller: ctx.auth, ...input })),

  remove: authedProcedure.input(removeSpriteSchema).mutation(({ ctx, input }) => ctx.services.expressions.removeSprite({ caller: ctx.auth, ...input })),

  generateSheet: authedProcedure
    .input(generateSpriteSheetSchema)
    .mutation(({ ctx, input }) => ctx.services.expressions.generateSpriteSheet({ caller: ctx.auth, ...input })),
});

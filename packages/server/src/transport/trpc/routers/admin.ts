// transport/trpc/routers/admin — the user-administration + ops surface (core/Tier-4-Transport.md). Every
// procedure is `adminProcedure` (LAYER-1, owner ∪ admin); the AdminService verbs re-check via
// `requireAdmin`/`requireOwner` (LAYER-2). Thin: validate → `ctx.services.admin.<verb>` → let the typed
// domain error map. The acting `Principal` is threaded as `params.principal` (the verb gates on it).
//
// PD-3: the admin vLLM engine-status surface (`vllmEngines`/`restartVllmEngine`) — a thin admin-gated
// shell over the injected `VllmSupervisorPort` (the supervisor + the engine-status vocab are sealed in
// `infra/providers`; admin owns the port shape, transport just delegates).

import { userRoleSchema } from "@orb/contracts/identity";
import type { CharacterId, ExternalId, Handle, SessionId, UserId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { adminProcedure, t } from "../trpc.ts";

export const adminRouter = t.router({
  listUsers: adminProcedure.query(({ ctx }) => ctx.services.admin.listUsers({ principal: ctx.auth })),

  setRole: adminProcedure
    .input(z.object({ userId: brandedId<UserId>(), role: userRoleSchema }))
    .mutation(({ ctx, input }) => ctx.services.admin.setRole({ principal: ctx.auth, userId: input.userId, role: input.role })),

  setEnabled: adminProcedure.input(z.object({ userId: brandedId<UserId>(), enabled: z.boolean() })).mutation(({ ctx, input }) =>
    ctx.services.admin.setEnabled({
      principal: ctx.auth,
      userId: input.userId,
      enabled: input.enabled,
    }),
  ),

  createUser: adminProcedure
    .input(
      z.object({
        handle: brandedId<Handle>(),
        password: z.string().min(1),
        role: userRoleSchema.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.admin.createUser({
        principal: ctx.auth,
        handle: input.handle,
        password: input.password,
        ...(input.role !== undefined ? { role: input.role } : {}),
      }),
    ),

  resetPassword: adminProcedure.input(z.object({ userId: brandedId<UserId>(), password: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    await ctx.services.admin.resetPassword({
      principal: ctx.auth,
      userId: input.userId,
      password: input.password,
    });
    return { ok: true } as const;
  }),

  // B5 — link an existing non-owner human row to a stable SSO subject (the db-surgery-free mode-switch
  // migration). `externalId` is the IdP-stable id (never an email); the verb refuses owner/agent targets and
  // a subject already bound elsewhere (bind-once, spine U1).
  linkSsoIdentity: adminProcedure
    .input(z.object({ userId: brandedId<UserId>(), externalId: brandedId<ExternalId>() }))
    .mutation(({ ctx, input }) => ctx.services.admin.linkSsoIdentity({ principal: ctx.auth, userId: input.userId, externalId: input.externalId })),

  listSessions: adminProcedure
    .input(z.object({ userId: brandedId<UserId>() }))
    .query(({ ctx, input }) => ctx.services.admin.listSessions({ principal: ctx.auth, userId: input.userId })),

  revokeSession: adminProcedure.input(z.object({ sessionId: brandedId<SessionId>() })).mutation(async ({ ctx, input }) => {
    await ctx.services.admin.revokeSession({ principal: ctx.auth, sessionId: input.sessionId });
    return { ok: true } as const;
  }),

  revokeUserSessions: adminProcedure
    .input(z.object({ userId: brandedId<UserId>() }))
    .mutation(({ ctx, input }) => ctx.services.admin.revokeUserSessions({ principal: ctx.auth, userId: input.userId })),

  // PD-3 — vLLM ops surface (admin-gated; delegates to the injected supervisor port).
  vllmEngines: adminProcedure.query(({ ctx }) => ctx.services.admin.vllmEngines({ principal: ctx.auth })),

  restartVllmEngine: adminProcedure
    .input(z.object({ engine: z.string().min(1) }))
    .mutation(({ ctx, input }) => ctx.services.admin.restartVllmEngine({ principal: ctx.auth, engine: input.engine })),

  // PD-90 — the inline single-card embed (adminProcedure, Tier-4 esoteric #10: only admins drive the GPU
  // embed engine inline; the bulk path is the admin-only index workload). The producer-ownership
  // check + the embeddings write live behind the AdminService verb (the composed EmbedProducerPort).
  embedCharacterCard: adminProcedure.input(z.object({ characterId: brandedId<CharacterId>() })).mutation(async ({ ctx, input }) => {
    await ctx.services.admin.embedCharacterCard({
      principal: ctx.auth,
      characterId: input.characterId,
    });
    return { ok: true } as const;
  }),
});

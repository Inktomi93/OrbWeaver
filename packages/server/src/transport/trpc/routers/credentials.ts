// transport/trpc/routers/credentials — the per-user credential surface (core/Tier-4-Transport.md). authed;
// owner-scoped (rows by `principal.userId`). Thin: validate → `ctx.services.credentials.<verb>` → map
// errors. The turn-time `resolve`/`maybeRevokeOnAuthFailed`, the runner-internal `markRevoked`, and the
// boot/connection mints are internal — NOT exposed. `provider`/`metadata` derive from
// `@orb/contracts/credentials`.
//
// Esoteric #9: `fetchModels`/`inspectEndpoint` are `.mutation()` despite being reads — they make an
// outbound call to a user-supplied `baseUrl` (an SSRF surface), so they keep the CSRF gate tRPC applies to
// mutations. Do NOT demote to `.query()`.

import { credentialProviderSchema, providerMetadataSchema } from "@orb/contracts/credentials";
import type { UserCredentialId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc";

const customEndpointDraft = z.object({
  baseUrl: z.string().min(1),
  key: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const credentialsRouter = t.router({
  list: authedProcedure.query(({ ctx }) => ctx.services.credentials.list({ principal: ctx.auth })),

  add: authedProcedure
    .input(
      z.object({
        provider: credentialProviderSchema,
        label: z.string().optional(),
        key: z.string().min(1),
        metadata: providerMetadataSchema.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.credentials.add({
        principal: ctx.auth,
        provider: input.provider,
        key: input.key,
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      }),
    ),

  setActive: authedProcedure
    .input(z.object({ credentialId: brandedId<UserCredentialId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.credentials.setActive({ principal: ctx.auth, credentialId: input.credentialId }),
    ),

  remove: authedProcedure
    .input(z.object({ credentialId: brandedId<UserCredentialId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.credentials.remove({ principal: ctx.auth, credentialId: input.credentialId }),
    ),

  testHealth: authedProcedure
    .input(z.object({ credentialId: brandedId<UserCredentialId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.credentials.testHealth({
        principal: ctx.auth,
        credentialId: input.credentialId,
      }),
    ),

  markRevokedByUser: authedProcedure
    .input(z.object({ credentialId: brandedId<UserCredentialId>(), reason: z.string().optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.credentials.markRevokedByUser({
        principal: ctx.auth,
        credentialId: input.credentialId,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      }),
    ),

  clearRevoked: authedProcedure
    .input(z.object({ credentialId: brandedId<UserCredentialId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.credentials.clearRevoked({
        principal: ctx.auth,
        credentialId: input.credentialId,
      }),
    ),

  // SSRF-surfaced reads — `.mutation()` to keep the CSRF gate (Esoteric #9).
  fetchModels: authedProcedure
    .input(
      z.object({
        credentialId: brandedId<UserCredentialId>().optional(),
        draft: customEndpointDraft.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.credentials.fetchModels({
        principal: ctx.auth,
        ...(input.credentialId !== undefined ? { credentialId: input.credentialId } : {}),
        ...(input.draft !== undefined ? { draft: input.draft } : {}),
      }),
    ),

  inspectEndpoint: authedProcedure
    .input(z.object({ credentialId: brandedId<UserCredentialId>(), model: z.string().optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.credentials.inspectEndpoint({
        principal: ctx.auth,
        credentialId: input.credentialId,
        ...(input.model !== undefined ? { model: input.model } : {}),
      }),
    ),
});

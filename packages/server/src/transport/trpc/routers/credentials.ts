// transport/trpc/routers/credentials — the per-user credential surface (docs/law/Tier-4-Transport.md). authed;
// owner-scoped (rows by `principal.userId`). Thin: validate → `ctx.services.credentials.<verb>` → map
// errors. The turn-time `resolve`/`maybeRevokeOnAuthFailed`, the runner-internal `markRevoked`, and the
// boot/connection mints are internal — NOT exposed. `provider`/`metadata` derive from
// `@orb/contracts/credentials`.
//
// A credential is a SEALED SECRET WITH A LABEL (§5.3): which key RESOLVES is the CONNECTION's decision, so there
// is no `setActive` here; health, endpoint model listing and inspection live on the connection router (a
// probe is a property of the row that dials, never of the key alone). `provider` is a registry id validated
// at the domain (the id is half the AAD — an unknown id would seal a key nothing can open).
//
// OUTPUT: `list` and `add` parse their result through the strict `credentialViewSchema`. The domain projection
// already drops every secret column; the parser is the second guard. A refused result fails the call as an
// INTERNAL_SERVER_ERROR, and the formatter answers with its fixed unclassified-fault message. The ladder logs
// the parse issues: paths, key names and fixed messages, never a value (zod omits input from its issues, and
// `typeIdSchema` emits a fixed message rather than the id library's echo of the rejected value).

import { credentialViewSchema, providerMetadataSchema } from "@orb/contracts/credentials";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc.ts";

export const credentialsRouter = t.router({
  list: authedProcedure.output(z.array(credentialViewSchema)).query(({ ctx }) => ctx.services.credentials.list({ principal: ctx.auth })),

  /** CREDENTIAL-STORAGE-SILENT-FAIL — "can this deployment keep a key at all?", asked BEFORE one is typed.
   *  Param-free and row-free (a deployment capability, identical for every caller), so it is `authed` with no
   *  owner scope to apply. */
  storageStatus: authedProcedure.query(({ ctx }) => ctx.services.credentials.storageStatus()),

  add: authedProcedure
    .input(
      z.object({
        provider: z.string().min(1),
        label: z.string().optional(),
        key: z.string().trim().min(1),
        metadata: providerMetadataSchema.optional(),
      }),
    )
    .output(credentialViewSchema)
    .mutation(({ ctx, input }) =>
      ctx.services.credentials.add({
        principal: ctx.auth,
        provider: input.provider,
        key: input.key,
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      }),
    ),

  /** The explicit rotation: the named row keeps its id and label and takes the new secret. `add` never rotates. */
  replace: authedProcedure
    .input(z.object({ credentialId: typeIdSchema(ID_PREFIX.userCredential), key: z.string().trim().min(1) }))
    .output(credentialViewSchema)
    .mutation(({ ctx, input }) => ctx.services.credentials.replace({ principal: ctx.auth, credentialId: input.credentialId, key: input.key })),

  remove: authedProcedure
    .input(z.object({ credentialId: typeIdSchema(ID_PREFIX.userCredential) }))
    .mutation(({ ctx, input }) => ctx.services.credentials.remove({ principal: ctx.auth, credentialId: input.credentialId })),

  markRevokedByUser: authedProcedure
    .input(z.object({ credentialId: typeIdSchema(ID_PREFIX.userCredential), reason: z.string().optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.credentials.markRevokedByUser({
        principal: ctx.auth,
        credentialId: input.credentialId,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      }),
    ),

  clearRevoked: authedProcedure.input(z.object({ credentialId: typeIdSchema(ID_PREFIX.userCredential) })).mutation(({ ctx, input }) =>
    ctx.services.credentials.clearRevoked({
      principal: ctx.auth,
      credentialId: input.credentialId,
    }),
  ),
});

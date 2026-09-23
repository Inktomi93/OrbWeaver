// transport/trpc/routers/connection — the connections + Model-roles + catalog + diagnostics surface
// (docs/law/Tier-4-Transport.md; inference program §3.3/§5.3a). Thin: validate → `ctx.services.connection.<verb>`
// → map errors. The turn-time `resolve`/`availability` verbs are internal (chat's turn path) — NOT exposed.
// Every row read or written is the CALLER's (`principal.userId` is the owner predicate at the domain).
//
// Esoteric #9: `listEndpointModels`, `probe`, `verifyAuth`, `inspectEndpoint` and `refreshCatalog` are
// `.mutation()` despite being read-shaped — each dials an endpoint (a user-supplied `baseUrl` is an SSRF
// surface; the F12 admission + the egress guard judge it) or spends a tiny generation, so they keep the
// CSRF gate tRPC applies to mutations. Do NOT demote to `.query()`.

import {
  connectionApiSchema,
  connectionExtrasSchema,
  connectionRefSchema,
  connectionTransportSchema,
  declaredCapabilitySchema,
  modelIdSchema,
  providerIdSchema,
  routableTaskSchema,
} from "@orb/contracts/inference";
import { verifyAuthResultSchema } from "@orb/contracts/providers";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { adminProcedure, authedProcedure, t } from "../trpc.ts";

const connectionId = connectionRefSchema.shape.connectionId;
/** A label is a short user-facing name (the pane auto-mints `<provider> · <model>`). */
const LABEL_MAX_CHARS = 120;

/** The writable fields of a row (`ConnectionFields` at the domain) — `create` takes them whole, `update` a
 *  FIELD-WISE patch (ground5 M6: never a GET→whole-blob PUT). */
const connectionFields = z.object({
  label: z.string().min(1).max(LABEL_MAX_CHARS).optional(),
  providerId: providerIdSchema,
  credentialId: typeIdSchema(ID_PREFIX.userCredential).nullable(),
  baseUrl: z.string().min(1).nullable(),
  model: modelIdSchema,
  api: connectionApiSchema.optional(),
  declared: declaredCapabilitySchema.nullable().optional(),
  extras: connectionExtrasSchema.nullable().optional(),
  transport: connectionTransportSchema.nullable().optional(),
  modelListed: z.boolean().optional(),
  allowBackground: z.boolean().optional(),
});

/** The actor a binding belongs to, from the caller's side; absent ⇒ the caller's own `user` bindings. */
const bindingActor = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("automation-rule"), ruleId: typeIdSchema(ID_PREFIX.automationRule) }),
  z.object({ kind: z.literal("plugin-grant"), pluginId: typeIdSchema(ID_PREFIX.plugin) }),
]);

export const connectionRouter = t.router({
  // ── the user's rows
  list: authedProcedure.query(({ ctx }) => ctx.services.connection.list({ principal: ctx.auth })),

  get: authedProcedure
    .input(z.object({ connectionId }))
    .query(({ ctx, input }) => ctx.services.connection.get({ principal: ctx.auth, connectionId: input.connectionId })),

  create: authedProcedure.input(connectionFields).mutation(({ ctx, input }) => ctx.services.connection.create({ principal: ctx.auth, ...input })),

  update: authedProcedure
    .input(z.object({ connectionId, patch: connectionFields.partial() }))
    .mutation(({ ctx, input }) => ctx.services.connection.update({ principal: ctx.auth, connectionId: input.connectionId, patch: input.patch })),

  remove: authedProcedure
    .input(z.object({ connectionId }))
    .mutation(({ ctx, input }) => ctx.services.connection.remove({ principal: ctx.auth, connectionId: input.connectionId })),

  // The caller's OWN chat connection end-to-end, credential-free — the params panel + rpg lite gate read it.
  resolveChatCapability: authedProcedure.query(({ ctx }) => ctx.services.connection.resolveChatCapability({ principal: ctx.auth })),

  capabilities: authedProcedure
    .input(z.object({ connectionId }))
    .query(({ ctx, input }) => ctx.services.connection.capabilities({ principal: ctx.auth, connectionId: input.connectionId })),

  // ── Model roles (`connection_bindings`; "binding" is a schema word — the pane says "Model roles", §5.3a)
  listBindings: authedProcedure
    .input(z.object({ actor: bindingActor.optional() }).optional())
    .query(({ ctx, input }) => ctx.services.connection.listBindings({ principal: ctx.auth, ...(input?.actor !== undefined ? { actor: input.actor } : {}) })),

  setBinding: authedProcedure
    .input(z.object({ task: routableTaskSchema, connectionId: connectionId.nullable(), actor: bindingActor.optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.connection.setBinding({
        principal: ctx.auth,
        task: input.task,
        connectionId: input.connectionId,
        ...(input.actor !== undefined ? { actor: input.actor } : {}),
      }),
    ),

  useForEverything: authedProcedure
    .input(z.object({ connectionId }))
    .mutation(({ ctx, input }) => ctx.services.connection.useForEverything({ principal: ctx.auth, connectionId: input.connectionId })),

  // ── catalogs
  catalogModels: authedProcedure
    .input(z.object({ connectionId }))
    .query(({ ctx, input }) => ctx.services.connection.catalogModels({ principal: ctx.auth, connectionId: input.connectionId })),

  // SERVER-SIDE `GET <baseUrl>/v1/models` for an endpoint row being AUTHORED (a browser cannot reach a user's
  // loopback box, §7.4) — a saved key by id (the caller's) or a raw draft key.
  listEndpointModels: authedProcedure
    .input(
      z.object({
        baseUrl: z.string().min(1),
        credentialId: typeIdSchema(ID_PREFIX.userCredential).optional(),
        key: z.string().optional(),
        headers: z.record(z.string(), z.string()).optional(),
      }),
    )
    .mutation(({ ctx, input }) => ctx.services.connection.listEndpointModels({ principal: ctx.auth, ...input })),

  refreshCatalog: adminProcedure
    .input(z.object({ providerId: providerIdSchema }))
    .mutation(({ ctx, input, signal }) => ctx.services.connection.refreshCatalog({ providerId: input.providerId, signal })),

  // ── diagnostics (each against ONE of the caller's rows)
  probe: authedProcedure
    .input(z.object({ connectionId }))
    .mutation(({ ctx, input, signal }) => ctx.services.connection.probe({ principal: ctx.auth, connectionId: input.connectionId, signal })),

  accountCredits: authedProcedure
    .input(z.object({ connectionId }))
    .query(({ ctx, input, signal }) => ctx.services.connection.accountCredits({ principal: ctx.auth, connectionId: input.connectionId, signal })),

  generationCost: authedProcedure
    .input(
      z.object({
        connectionId,
        // @orb-waive no-raw-id(generationId): the provider's UPSTREAM generation handle (their id namespace), not a branded orbweaver entity id.
        generationId: z.string().min(1),
      }),
    )
    .query(({ ctx, input, signal }) =>
      ctx.services.connection.generationCost({ principal: ctx.auth, connectionId: input.connectionId, generationId: input.generationId, signal }),
    ),

  // The `claude-sub` row's runtime auth check: a tiny generation, so a mutation (§8.4-6).
  verifyAuth: authedProcedure
    .input(z.object({ connectionId }))
    .output(verifyAuthResultSchema)
    .mutation(({ ctx, input, signal }) => ctx.services.connection.verifyAuth({ principal: ctx.auth, connectionId: input.connectionId, signal })),

  inspectEndpoint: authedProcedure
    .input(z.object({ connectionId }))
    .mutation(({ ctx, input, signal }) => ctx.services.connection.inspectEndpoint({ principal: ctx.auth, connectionId: input.connectionId, signal })),

  // ── providers: what the picker may offer (every registry row with its wire's build state, §5.3a)
  providersAvailable: authedProcedure.query(({ ctx }) => ctx.services.connection.providersAvailable({ principal: ctx.auth })),
});

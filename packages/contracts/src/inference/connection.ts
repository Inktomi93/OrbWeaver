// The user's CONNECTION row and the per-actor BINDING row as they cross the boundary — the pane renders
// them, the runtime's `ConnectionStore`/`BindingStore` ports carry them, `@orb/db`'s tables mirror them
// (`schema/connection.ts`, producer `domain/connection`). Secrets never ride here: a row references its
// credential by id; the runtime resolves the secret through its own port at call time.

import type { UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { z } from "zod";
import { chatApiSchema } from "./apis.ts";
import { declaredCapabilitySchema } from "./capability/override.ts";
import { bindingActorKindSchema } from "./connection-ref.ts";
import { modelIdSchema } from "./model-schema.ts";
import { providerIdSchema } from "./provider-schema.ts";
import { routableTaskSchema } from "./tasks.ts";

/** A custom endpoint's REQUEST/RESPONSE transforms — a CLOSED object (four fields), one owner, never queried
 *  by field (§5.3's JSON-column defence). Shown only on `auth: endpoint` rows. */
export const responseMapSchema = z.object({
  contentPath: z.string().optional(),
  reasoningPath: z.string().optional(),
  finishReasonPath: z.string().optional(),
  promptTokensPath: z.string().optional(),
  completionTokensPath: z.string().optional(),
  errorMessagePath: z.string().optional(),
  errorCodePath: z.string().optional(),
  toolCallsPath: z.string().optional(),
});

export const connectionTransportSchema = z.object({
  headers: z.record(z.string(), z.string()).optional(),
  includeBody: z.record(z.string(), jsonValueSchema).optional(),
  excludeBody: z.array(z.string()).optional(),
  responseMap: responseMapSchema.optional(),
});
export type ConnectionTransportDoc = z.infer<typeof connectionTransportSchema>;

/** `extras` — the connection's extra BODY fields (today's preset `customParameters`, re-homed where the
 *  quirk lives, §8.1c). Open by definition; its ratchet is the belt denylist applied on write AND read. */
export const connectionExtrasSchema: z.ZodType<Record<string, JsonValue>> = z.record(z.string(), jsonValueSchema);
export type ConnectionExtrasDoc = z.infer<typeof connectionExtrasSchema>;

/** `"auto"` ⇒ the provider's first api; anything else must be ∈ `PROVIDER.apis` (validated at the domain). */
export const connectionApiSchema = z.union([chatApiSchema, z.literal("auto")]);
export type ConnectionApi = z.infer<typeof connectionApiSchema>;

export const userConnectionSchema = z.object({
  id: typeIdSchema(ID_PREFIX.userConnection),
  ownerId: brandedId<UserId>(),
  label: z.string().min(1),
  providerId: providerIdSchema,
  credentialId: typeIdSchema(ID_PREFIX.userCredential).nullable(),
  /** For `auth: endpoint` providers; `null` when the provider row fixes it. */
  baseUrl: z.string().nullable(),
  /** The picked model id — NEVER defaulted (F16); the picker is the only way it gets set. */
  model: modelIdSchema,
  api: connectionApiSchema,
  declared: declaredCapabilitySchema.nullable(),
  extras: connectionExtrasSchema.nullable(),
  transport: connectionTransportSchema.nullable(),
  /** `true` when `model` came from the provider's list; `false` = typed fallback — the pane says why. */
  modelListed: z.boolean(),
  /** May a `spend: "background"` task (summaries, captions, digests) run on this row unattended? (F5) */
  allowBackground: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type UserConnection = z.infer<typeof userConnectionSchema>;

/** One actor's pick of a connection for ONE routable task. Exactly one of the three actor ids is set,
 *  matching `actorKind` (the `chat_participants` kind-shape idiom); `connectionId` is `null` after the row it
 *  pointed at was deleted (SET NULL) — the binding survives as `no-connection`, never a dangling id. */
export const connectionBindingSchema = z.object({
  id: typeIdSchema(ID_PREFIX.connectionBinding),
  actorKind: bindingActorKindSchema,
  userId: brandedId<UserId>().nullable(),
  ruleId: typeIdSchema(ID_PREFIX.automationRule).nullable(),
  pluginId: typeIdSchema(ID_PREFIX.plugin).nullable(),
  task: routableTaskSchema,
  connectionId: typeIdSchema(ID_PREFIX.userConnection).nullable(),
});
export type ConnectionBinding = z.infer<typeof connectionBindingSchema>;

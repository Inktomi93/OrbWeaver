// `@orb/contracts/debug` — the JSON the host-gated `/api/_debug/*` routes answer with. These are Hono routes with
// no tRPC procedure, so the schema is the only place the shape is written down; the server builds against the
// inferred types and its readers (the e2e harness) parse with the schemas.

import type { UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { participantKindSchema, participantRoleSchema } from "#chat";
import { rpgTraceRecordSchema } from "#rpg";

const chatIdSchema = typeIdSchema(ID_PREFIX.chat);

/** One captured provider request. `body` is the backend's own wire vocabulary, an opaque JSON object that is never
 *  normalized across wires; `api` is the protocol axis, `wire` and `providerId` the runtime's provenance axes. */
export const wireCaptureSchema = z.strictObject({
  chatId: chatIdSchema.optional(),
  api: z.string(),
  wire: z.string(),
  // @orb-waive no-raw-id(providerId): the inference capture sink hands the recorder a plain string label; branding it reaches the inference sink contract. Ends when WireCaptureSink carries a ProviderId.
  providerId: z.string(),
  model: z.string(),
  at: z.number(),
  body: z.record(z.string(), z.unknown()),
  /** The provider's response headers, lower-cased and secret-scrubbed. Absent on a transport failure and on agent-sdk. */
  responseHeaders: z.record(z.string(), z.string()).optional(),
  /** The reply as literal wire text, head-capped; present only with `WIRE_CAPTURE_REPLY=on`. */
  responseBody: z.string().optional(),
});
export type WireCapture = z.infer<typeof wireCaptureSchema>;

/** The `GET /api/_debug/wire/captures` response. */
export const wireCapturesResponseSchema = z.strictObject({
  enabled: z.boolean(),
  count: z.number().int(),
  captures: z.array(wireCaptureSchema),
});

/** The `GET /api/_debug/rpg/traces` response: the recorder ring, oldest first. */
export const rpgTracesResponseSchema = z.strictObject({ count: z.number().int(), events: z.array(rpgTraceRecordSchema) });

const inspectedParticipantSchema = z.strictObject({
  id: z.string(),
  kind: participantKindSchema,
  role: participantRoleSchema,
  userId: brandedId<UserId>().nullable(),
  characterId: typeIdSchema(ID_PREFIX.character).nullable(),
  characterName: z.string().nullable(),
});

const inspectedMessageSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.message),
  seq: z.number().int(),
  role: z.string(),
  authorUserId: brandedId<UserId>().nullable(),
  characterId: typeIdSchema(ID_PREFIX.character).nullable(),
  personaId: typeIdSchema(ID_PREFIX.persona).nullable(),
  selectedVariantId: typeIdSchema(ID_PREFIX.messageVariant).nullable(),
  excludedFromPrompt: z.boolean(),
  content: z.string().nullable(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
});

/** The `GET /api/_debug/db/chat/:id` response: a deep dump of one chat's stored state. `chat` and `recentEvents`
 *  are the raw table rows (whole-row dumps by design, every column of `chats` and `chat_events`), so they are
 *  loose objects naming only their key columns; `@orb/db` owns the column shapes and contracts cannot import it. */
export const chatInspectionSchema = z.strictObject({
  found: z.boolean(),
  chat: z.looseObject({ id: chatIdSchema }).nullable(),
  participants: z.array(inspectedParticipantSchema),
  messages: z.array(inspectedMessageSchema),
  sessionFrameCount: z.number().int(),
  recentEvents: z.array(z.looseObject({ seq: z.number().int(), type: z.string() })),
});
export type ChatInspection = z.infer<typeof chatInspectionSchema>;

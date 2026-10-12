// `@orb/contracts/debug` — the JSON the host-gated `/api/_debug/*` routes answer with. These are Hono routes with
// no tRPC procedure, so the schema is the only place the shape is written down; the server builds against the
// inferred types and its readers (the e2e harness) parse with the schemas.

import type { UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { participantKindSchema, participantRoleSchema } from "#chat";
import { providerIdSchema } from "#inference";
import { rpgTraceRecordSchema } from "#rpg";

const chatIdSchema = typeIdSchema(ID_PREFIX.chat);

/** One captured provider request. `body` is the backend's own wire vocabulary, an opaque JSON object that is never
 *  normalized across wires; `api` is the protocol axis, `wire` and `providerId` the runtime's provenance axes. */
export const wireCaptureSchema = z.strictObject({
  chatId: chatIdSchema.optional(),
  api: z.string(),
  wire: z.string(),
  providerId: providerIdSchema,
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
  captures: z.array(wireCaptureSchema).readonly(),
});
export type WireCapturesResponse = z.infer<typeof wireCapturesResponseSchema>;

/** The `GET /api/_debug/rpg/traces` response: the recorder ring, oldest first. */
export const rpgTracesResponseSchema = z.strictObject({ count: z.number().int(), events: z.array(rpgTraceRecordSchema).readonly() });
export type RpgTracesResponse = z.infer<typeof rpgTracesResponseSchema>;

/** The `GET /api/_debug/errors` response: the error ring, whose lines are opaque to the harness (it asserts emptiness). */
export const debugErrorsResponseSchema = z.strictObject({ errors: z.array(z.unknown()).readonly() });
export type DebugErrorsResponse = z.infer<typeof debugErrorsResponseSchema>;

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

/** The chat row as the debug dump projects it: the identity, lifecycle and fork columns a reader checks to answer
 *  "did it land". A null `startedAt` is a husk. The server maps the `chats` row into this; `@orb/db` owns the table. */
const inspectedChatSchema = z.strictObject({
  id: chatIdSchema,
  title: z.string().nullable(),
  starred: z.boolean(),
  archived: z.boolean(),
  temporary: z.boolean(),
  startedAt: z.number().nullable(),
  parentChatId: chatIdSchema.nullable(),
  forkedAt: z.number().nullable(),
  streamSeq: z.number().int(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/** One durable bus event as the debug dump projects it: its replay cursor and discriminant, never the payload. */
const inspectedEventSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.chatEvent),
  seq: z.number().int(),
  type: z.string(),
  createdAt: z.number(),
});

/** The `GET /api/_debug/db/chat/:id` response: a deep dump of one chat's stored state. */
export const chatInspectionSchema = z.strictObject({
  found: z.boolean(),
  chat: inspectedChatSchema.nullable(),
  participants: z.array(inspectedParticipantSchema),
  messages: z.array(inspectedMessageSchema),
  sessionFrameCount: z.number().int(),
  recentEvents: z.array(inspectedEventSchema),
});
export type ChatInspection = z.infer<typeof chatInspectionSchema>;

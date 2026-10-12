// The rpg flight-recorder record, as `/api/_debug/rpg/traces` serialises it: one stamped event of the per-turn
// trace stream. The recorder's sink, filter and ring stay in `domain/rpg/contract/trace.ts`.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { RPG_BUS_EVENT_TYPES } from "./bus.ts";
import { RPG_DELIVERY_PATHS, RPG_FOLD_FALLBACK_REASONS } from "./config.ts";
import type { RpgRecordedToolCall } from "./extraction.ts";
import { RPG_TOOL_CALL_VERDICTS } from "./extraction.ts";

/** How a state round ended; the settle event's and the settle hook's shared vocabulary.
 *  `dropped` carries the refused field in `droppedReason`; `readonly` means no round ran at all. */
export const RPG_FLUSH_OUTCOMES = ["wrote", "no-writes", "dropped", "cancelled", "readonly", "failed"] as const;
export type RpgFlushOutcome = (typeof RPG_FLUSH_OUTCOMES)[number];

const chatIdSchema = typeIdSchema(ID_PREFIX.chat);
const turnIdSchema = typeIdSchema(ID_PREFIX.chatTurn);

const rpgRecordedToolCallSchema = z.strictObject({
  name: z.string(),
  args: z.string(),
  verdict: z.enum(RPG_TOOL_CALL_VERDICTS),
  issues: z.array(z.string()).readonly(),
}) satisfies z.ZodType<RpgRecordedToolCall>;

/** The per-turn trace event, discriminated on `phase`. `flush` is the delivery-path fork raised at dispatch;
 *  `flushed` is the write boundary's own settle event and the only one a barrier may poll. */
export const rpgTraceEventSchema = z.discriminatedUnion("phase", [
  z.strictObject({ phase: z.literal("mount"), chatId: chatIdSchema, toolNames: z.array(z.string()).readonly() }),
  z.strictObject({
    phase: z.literal("tool"),
    chatId: chatIdSchema,
    turnId: turnIdSchema,
    calls: z.array(rpgRecordedToolCallSchema).readonly(),
    vehicle: z.string(),
  }),
  z.strictObject({
    phase: z.literal("flush"),
    chatId: chatIdSchema,
    turnId: turnIdSchema,
    path: z.enum(RPG_DELIVERY_PATHS),
    fallbackReason: z.enum(RPG_FOLD_FALLBACK_REASONS).nullable(),
  }),
  z.strictObject({
    phase: z.literal("flushed"),
    chatId: chatIdSchema,
    turnId: turnIdSchema,
    outcome: z.enum(RPG_FLUSH_OUTCOMES),
    droppedReason: z.string().nullable(),
  }),
  z.strictObject({ phase: z.literal("bus"), chatId: chatIdSchema, type: z.enum(RPG_BUS_EVENT_TYPES) }),
]);
export type RpgTraceEvent = z.infer<typeof rpgTraceEventSchema>;

/** A recorded event stamped with its monotonic sequence and wall-clock time. */
export const rpgTraceRecordSchema = z.strictObject({ seq: z.number().int(), at: z.number(), event: rpgTraceEventSchema });
export type RpgTraceRecord = z.infer<typeof rpgTraceRecordSchema>;

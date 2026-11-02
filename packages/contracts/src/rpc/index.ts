// Shared RPC batching limits, the page direction and resume token the tRPC client adds, and terminal subscription wire data.

import { z } from "zod";

/** Maximum procedure calls in one HTTP request; client splitting and server admission share this value. */
export const TRPC_BATCH_MAX_ITEMS = 22;

/** Maximum encoded URL characters passed to the HTTP batch link, measured with the relative API base. */
export const TRPC_BATCH_MAX_URL_LENGTH = 1334;

// A modelled subscription fault is terminal data, not an instruction to retry the source.
const subscriptionErrorFrameSchema = z.strictObject({
  __subscriptionError: z.literal(true),
  code: z.string(),
  message: z.string(),
});

/** The transport can retain its native code vocabulary while clients consume the string wire field. */
export type SubscriptionErrorFrame<Code extends string = string> = Readonly<z.infer<typeof subscriptionErrorFrameSchema>> & { readonly code: Code };

/** Tells a subscription's terminal error frame from a data frame. Every consumer narrows through this, so the sentinel key has one spelling. */
export function isSubscriptionErrorFrame(frame: unknown): frame is SubscriptionErrorFrame {
  return typeof frame === "object" && frame !== null && "__subscriptionError" in frame && frame.__subscriptionError === true;
}

// The page directions TanStack Query hands an infinite query's page function.
const INFINITE_QUERY_DIRECTIONS = ["forward", "backward"] as const;

/**
 * The page direction tRPC's infinite-query client adds beside `cursor` to every paged input.
 *
 * @remarks A strict paged input spreads this shape so the call is admitted. No procedure pages by direction, so none
 * reads it.
 */
export const pageDirectionShape = { direction: z.enum(INFINITE_QUERY_DIRECTIONS).optional() };

/**
 * The resume token tRPC's subscription client adds to a tracked subscription's input when it reconnects.
 *
 * @remarks A strict subscription input spreads this shape so a reconnect is admitted; each procedure decides
 * whether it resumes from the token.
 */
export const trackedEventIdShape = {
  // eslint-disable-next-line orb/no-raw-id -- Opaque SSE resume token the tRPC client mints from the last tracked frame id; it names no entity.
  lastEventId: z.string().optional(),
};

/** The acknowledgement a procedure returns when the write itself is the whole answer. */
export const okResultSchema = z.strictObject({ ok: z.literal(true) });

// Shared RPC batching limits and terminal subscription wire data.

import { z } from "zod";

/** Maximum procedure calls in one HTTP request; client splitting and server admission share this value. */
export const TRPC_BATCH_MAX_ITEMS = 22;

/** Maximum encoded URL characters passed to the HTTP batch link, measured with the relative API base. */
export const TRPC_BATCH_MAX_URL_LENGTH = 1334;

// A modelled subscription fault is terminal data, not an instruction to retry the source.
const subscriptionErrorFrameSchema = z.object({
  __subscriptionError: z.literal(true),
  code: z.string(),
  message: z.string(),
});

/** The transport can retain its native code vocabulary while clients consume the string wire field. */
export type SubscriptionErrorFrame<Code extends string = string> = Readonly<z.infer<typeof subscriptionErrorFrameSchema>> & { readonly code: Code };

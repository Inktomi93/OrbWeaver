import type { SubscriptionErrorFrame as SubscriptionWireErrorFrame } from "@orb/contracts/rpc";
import type { TRPCError } from "@trpc/server";

/** Preserve the transport's native code precision without importing tRPC into the wire contract. */
export type SubscriptionErrorFrame = SubscriptionWireErrorFrame<TRPCError["code"]>;

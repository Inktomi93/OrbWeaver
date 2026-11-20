// The member-safe, present-tense connection selected for this room's next chat turn, and whether that turn can run.
// A non-host member may see the provider label but never the host's custom label.

import { z } from "zod";
import type { UnavailableCause } from "../inference/resolved.ts";
import { sendAvailabilitySchema } from "../inference/resolved.ts";
import { TURN_HOST_UNAVAILABLE_OP_CODE } from "./bus.ts";

export type NextTurnConnectionView =
  | { readonly state: "unset" }
  | {
      readonly state: "configured";
      readonly connectionLabel: string | null;
      readonly providerLabel: string;
    };

export const nextTurnConnectionViewSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("unset") }),
  z.strictObject({
    state: z.literal("configured"),
    connectionLabel: z.string().nullable(),
    providerLabel: z.string(),
  }),
]) satisfies z.ZodType<NextTurnConnectionView>;

/** Why the room's next turn cannot run: the host connection's own cause, or the host is outside the room's consent
 *  set. The host cause is the same code a refused send carries and names no account state. */
export type RoomUnavailableCause = UnavailableCause | typeof TURN_HOST_UNAVAILABLE_OP_CODE;

/** The room's pre-send verdict, which any present member reads. */
export type RoomSendAvailability = { readonly available: true } | { readonly available: false; readonly cause: RoomUnavailableCause };

export const roomSendAvailabilitySchema = z.union([
  sendAvailabilitySchema,
  z.strictObject({ available: z.literal(false), cause: z.literal(TURN_HOST_UNAVAILABLE_OP_CODE) }),
]) satisfies z.ZodType<RoomSendAvailability>;

// The member-safe, present-tense connection selected for this room's next chat turn.
// A non-host member may see the provider label but never the host's custom label.

import { z } from "zod";

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

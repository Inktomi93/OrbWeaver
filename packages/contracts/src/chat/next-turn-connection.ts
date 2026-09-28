// The member-safe, present-tense connection selected for this room's next chat turn.
// A non-host member may see provider/model but never the host's custom label.

import type { ModelId } from "@orb/kit/ids";
import type { ProviderId } from "../inference/provider-schema.ts";

export type NextTurnConnectionView =
  | { readonly state: "unset" }
  | {
      readonly state: "configured";
      readonly connectionLabel: string | null;
      readonly provider: ProviderId;
      readonly providerLabel: string;
      readonly model: ModelId;
    };

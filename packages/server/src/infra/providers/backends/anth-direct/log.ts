// infra/providers/backends/anth-direct/log — the anth-direct backend's `provider.*` event WRAPPERS. The
// thin tagged-`getLog()` sink core (`providerLog`, `logProviderCache`) lives in the shared
// `backends/kit/provider-log` (hoisted for this second backend, part 05 §2); this file holds the
// anth-direct-SPECIFIC event shapes + wrappers, each passing this backend's `BACKEND` tag to the kit core.
// Every call emits ONE pino line tagged `provider: true` + `backend: "anth-direct"` + an `event` string,
// greppable as `provider:true`, filterable per-backend + per-event.
//
// DOCTRINE (Tier-2-Foundation esoteric #12 / part 05 §5): logs are METADATA — ids, counts,
// classifications, model names, timings, and the credentialSource VOCAB. NEVER the OAuth token / api key
// (the belt keeps it off the wire; the key rides ONLY the outbound Bearer header), NEVER prompt / RP /
// system-prompt content. Every field below is metadata.

import type { CredentialSource } from "@orb/contracts/credentials";
import type { ProviderTurnUsage } from "@orb/server/infra/providers/backends/kit";
import { providerLog } from "@orb/server/infra/providers/backends/kit";
import type { NormalizedFinishReason, ProviderError } from "../../contract";

/** This backend's tag on every taxonomy line, passed to the shared kit sink per-call. */
const BACKEND = "anth-direct";

/** The one-line-per-turn anchor (`provider.turn`, info) — success OR failure (part 05 §3e). anth-direct is
 *  STATELESS (no session/heal): it carries the turn's identity (chat/model), the DIRECT transport + the
 *  credentialSource VOCAB (the sub-vs-key canary, NEVER the secret), the normalized finish, timing, and
 *  usage economics. `undefined` fields are dropped by pino. */
export interface AnthDirectTurnLog {
  /** the per-turn correlation id (part 05 §4) — the same `resolveChat` id this turn's `provider.cache`
   *  line carries. */
  readonly turnId: string;
  readonly chatId?: string;
  /** The part 01 §4c transport axis — always `"direct"` here (vs the agent-sdk `"cli"`). */
  readonly transport: "direct";
  /** The SOURCE vocab (`openrouter` v1; `anthropic` when W11 lands) — the sub-vs-key canary. NEVER the
   *  secret material (part 05 §3e/§5). */
  readonly credentialSource: CredentialSource;
  readonly requestedModel: string;
  readonly finishReason?: NormalizedFinishReason | null;
  readonly durationMs?: number;
  readonly ttftMs?: number | null;
  readonly ok: boolean;
  readonly usage?: ProviderTurnUsage;
}

/** ONE line per completed turn (success or failure) — the debug anchor. */
export function logAnthDirectTurn(entry: AnthDirectTurnLog): void {
  providerLog(BACKEND, "info", "provider.turn", { ...entry });
}

/** A classified `ProviderError` (`provider.error`, error) via its full provenance (`toLog()`). The
 *  sanitize kit already scrubbed any upstream body off the message (part 02 §5e); `toLog()` carries no
 *  secret. */
export function logAnthDirectError(err: ProviderError): void {
  providerLog(BACKEND, "error", "provider.error", { ...err.toLog() });
}

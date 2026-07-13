// anth-direct `provider.*` event wrappers over the shared kit sink (`providerLog`). Doctrine: logs are
// METADATA only — NEVER the OAuth token/api key (it rides ONLY the outbound Bearer header) or
// prompt/RP/system-prompt content (Tier-2-Foundation esoteric #12).

import type { CredentialSource } from "@orb/contracts/credentials";
import type { ProviderTurnUsage } from "@orb/server/infra/providers/backends/kit";
import { providerLog } from "@orb/server/infra/providers/backends/kit";
import type { NormalizedFinishReason, ProviderError } from "../../contract";

/** This backend's tag on every taxonomy line, passed to the shared kit sink per-call. */
const BACKEND = "anth-direct";

/** One-line-per-turn anchor (`provider.turn`, info) — success or failure. anth-direct is STATELESS. */
export interface AnthDirectTurnLog {
  readonly turnId: string;
  readonly chatId?: string;
  /** Always `"direct"` here (vs the agent-sdk `"cli"`). */
  readonly transport: "direct";
  /** Sub-vs-key canary vocab. NEVER the secret material. */
  readonly credentialSource: CredentialSource;
  readonly requestedModel: string;
  readonly finishReason?: NormalizedFinishReason | null;
  readonly durationMs?: number;
  readonly ttftMs?: number | null;
  readonly ok: boolean;
  readonly usage?: ProviderTurnUsage;
}

export function logAnthDirectTurn(entry: AnthDirectTurnLog): void {
  providerLog(BACKEND, "info", "provider.turn", { ...entry });
}

/** `provider.error` via `toLog()`; the sanitize kit already scrubbed any upstream body off the message. */
export function logAnthDirectError(err: ProviderError): void {
  providerLog(BACKEND, "error", "provider.error", { ...err.toLog() });
}

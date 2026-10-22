// The shared `provider.*` structured-log sink. Every call emits ONE line tagged `provider: true` plus a
// per-call wire/provider + event string, so the whole provider trail is greppable. Logs are metadata only —
// never prompt/RP/system-prompt content. A FACTORY over the injected `InferenceLog` (no `getLog()` global:
// the package never imports the server's logger).

import type { InferenceLog } from "#src/deps.ts";
import type { ProviderLogger } from "../../contract/http.ts";

/** Bind the sink to one wire/provider pair — every line the backend emits carries both. */
export function providerLogger(log: InferenceLog, wire: string, providerId: string): ProviderLogger {
  const emit: ProviderLogger["emit"] = (level, event, fields = {}) => {
    log[level]({ provider: true, wire, providerId, event, ...fields }, event);
  };
  return {
    emit,
    cache: (entry) => emit("info", "provider.cache", { ...entry }),
    sampling: (entry) =>
      emit("debug", "provider.sampling", { turnId: entry.turnId, requested: entry.requested, applied: entry.applied, dropped: [...entry.dropped] }),
    capability: (entry) =>
      emit("debug", "provider.capability", {
        turnId: entry.turnId,
        api: entry.api,
        providerId: entry.providerId,
        requestedModel: entry.requestedModel,
        ...(entry.servedModel !== undefined ? { servedModel: entry.servedModel } : {}),
        turns: entry.turns,
        droppedWarnings: [...entry.droppedWarnings],
      }),
    summarizeItem: (entry) =>
      // The event name carries the task so a grep filters cleanly: `provider.summarize-item` vs `provider.structured-item`.
      emit(entry.ok ? "info" : "warn", `provider.${entry.task}-item`, {
        task: entry.task,
        model: entry.model,
        index: entry.index,
        durationMs: entry.durationMs,
        ok: entry.ok,
        tokensIn: entry.tokensIn,
        tokensOut: entry.tokensOut,
        finishReason: entry.finishReason,
        hasResponseFormat: entry.hasResponseFormat,
        ...(entry.errorKind !== undefined ? { errorKind: entry.errorKind } : {}),
      }),
  };
}

export type { ProviderLogger } from "../../contract/http.ts";

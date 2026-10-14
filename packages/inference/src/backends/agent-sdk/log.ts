// agent-sdk `provider.*` event lines over the shared `providerLogger` sink. Doctrine: logs are METADATA only —
// never prompt/RP/system-prompt content. Bound ONCE per backend (`createAgentSdkLog`) — no global logger.
import type { InferenceLog } from "#src/deps.ts";
import type { AgentSdkLog } from "../../contract/agent-sdk-backend.ts";
import { providerLogger } from "../http/provider-log.ts";

const WIRE = "agent-sdk";

export function createAgentSdkLog(log: InferenceLog, providerId: string): AgentSdkLog {
  const base = providerLogger(log, WIRE, providerId);
  return {
    base,
    turn: (entry) => base.emit("info", "provider.turn", { ...entry }),
    session: (entry) => base.emit("debug", "provider.session", { ...entry }),
    error: (err, extra) =>
      base.emit("error", "provider.error", {
        ...err.toLog(),
        ...(extra?.stderrTail !== undefined ? { stderrTail: extra.stderrTail } : {}),
        ...(extra?.label !== undefined ? { label: extra.label } : {}),
      }),
    rateLimit: (banRisk, fields) => base.emit(banRisk ? "warn" : "debug", "provider.rate_limit", fields),
    retry: (fields) => base.emit("warn", "provider.retry", fields),
    drift: (entry) => base.emit("warn", "provider.drift", { ...entry }),
    refusal: (entry) => base.emit("warn", "provider.refusal", { ...entry }),
    leak: (entry) => base.emit("error", "provider.leak", { ...entry }),
    terminalTools: (entry) => base.emit(entry.mounted ? "debug" : "warn", "provider.terminal_tools", { ...entry }),
    compaction: (fields) => base.emit("warn", "provider.compaction", fields),
    dialog: (entry) => base.emit("warn", "provider.dialog", { ...entry }),
    capability: (entry) => base.capability(entry),
    mcp: (entry) => base.emit(entry.unhealthy ? "warn" : "debug", "provider.mcp", { ...entry }),
    info: (fields, message) => log.info({ wire: WIRE, providerId, ...fields }, message),
    warn: (fields, message) => log.warn({ wire: WIRE, providerId, ...fields }, message),
    debug: (fields, message) => log.debug({ wire: WIRE, providerId, ...fields }, message),
  };
}

export type { AgentSdkLog } from "../../contract/agent-sdk-backend.ts";

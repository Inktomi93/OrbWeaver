// domain/plugin/substrate/failure-log — the ONE operator-visible line for a plugin failure: which plugin
// (`pluginSlug`), what kind of failure (`kind`), and why (`cause`). Each failure is logged at exactly one site;
// a caller that already logged it must not log it again higher up the stack.

import { getLog } from "#foundation/observability";

type PluginFailureKind = "activation-failed" | "guest-error" | "host-deadline" | "broker-unavailable" | "display-deadline" | "ui-crash" | "auto-disabled";

/** Kinds that leave the plugin unusable log at error; a failed single call logs at warn. */
const ERROR_KINDS: ReadonlySet<PluginFailureKind> = new Set<PluginFailureKind>(["activation-failed", "auto-disabled"]);

export function logPluginFailure(pluginSlug: string, kind: PluginFailureKind, cause: string): void {
  getLog()[ERROR_KINDS.has(kind) ? "error" : "warn"]({ pluginSlug, kind, cause }, "plugin: failure");
}

/** Classify a rejected guest invocation by the typed error name, which crosses the sandbox and broker intact. */
export function invokeFailureKind(error: unknown): PluginFailureKind {
  if (error instanceof Error) {
    if (error.name === "PluginHostDeadlineError") {
      return "host-deadline";
    }
    if (error.name === "PluginHostUnavailable") {
      return "broker-unavailable";
    }
  }
  return "guest-error";
}

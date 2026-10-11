// domain/plugin/substrate/failure-log — the ONE operator-visible line for a plugin failure: which plugin
// (`pluginSlug`), what kind of failure (`kind`), and why (`cause`). Each failure is logged at exactly one site;
// a caller that already logged it must not log it again higher up the stack.

import { getLog } from "#foundation/observability";

type PluginFailureKind =
  | "activation-failed"
  | "guest-error"
  | "host-deadline"
  | "broker-unavailable"
  | "display-deadline"
  | "macro-deadline"
  | "ui-crash"
  | "auto-disabled";

/** Kinds that leave the plugin unusable log at error; a failed single call logs at warn. */
const ERROR_KINDS: ReadonlySet<PluginFailureKind> = new Set<PluginFailureKind>(["activation-failed", "auto-disabled"]);

/** A guest controls its error text, so the logged cause is cut the way `reportUiCrash` cuts its reason. */
const CAUSE_MAX_CHARS = 200;
const TRUNCATION_MARK = "…[truncated]";

export function logPluginFailure(pluginSlug: string, kind: PluginFailureKind, cause: string): void {
  const bounded = cause.length > CAUSE_MAX_CHARS ? `${cause.slice(0, CAUSE_MAX_CHARS)}${TRUNCATION_MARK}` : cause;
  getLog()[ERROR_KINDS.has(kind) ? "error" : "warn"]({ pluginSlug, kind, cause: bounded }, "plugin: failure");
}

/** Classify a rejected guest invocation by the typed error name, which crosses the sandbox and broker intact. */
export function invokeFailureKind(error: unknown): PluginFailureKind {
  if (error instanceof Error) {
    if (error.name === "PluginHostDeadlineError") {
      return "host-deadline";
    }
    // Host-side teardown ("stale, crashed, or disposed runtime id") is the broker going away, not the guest failing.
    if (error.name === "PluginHostUnavailable" || error.message.startsWith("plugin broker:")) {
      return "broker-unavailable";
    }
  }
  return "guest-error";
}

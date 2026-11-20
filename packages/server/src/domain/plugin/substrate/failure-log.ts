// domain/plugin/substrate/failure-log — the ONE operator-visible line for a plugin failure: which plugin
// (`pluginSlug`), what kind of failure (`kind`), and why (`cause`). Each failure is logged at exactly one site;
// a caller that already logged it must not log it again higher up the stack.

import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import type { PluginFailureLine } from "#infra/plugin-host";

const PLUGIN_FAILURE_KINDS = [
  "activation-failed",
  "guest-error",
  "host-deadline",
  "host-busy",
  "broker-unavailable",
  "display-deadline",
  "macro-deadline",
  "prompt-deadline",
  "ui-crash",
  "auto-disabled",
] as const;
type PluginFailureKind = (typeof PLUGIN_FAILURE_KINDS)[number];

/** Kinds that leave the plugin unusable log at error; a failed single call logs at warn. */
const ERROR_KINDS: ReadonlySet<PluginFailureKind> = new Set<PluginFailureKind>(["activation-failed", "auto-disabled"]);

/** A guest controls its error text, so the logged cause is cut the way `reportUiCrash` cuts its reason. */
const CAUSE_MAX_CHARS = 200;
const TRUNCATION_MARK = "…[truncated]";

/** The failure line, for a caller whose guest can repeat it per call: it goes to {@link PluginHostPort.logFailure}. */
export function pluginFailureLine(pluginSlug: string, kind: PluginFailureKind, cause: string): PluginFailureLine {
  const bounded = cause.length > CAUSE_MAX_CHARS ? `${cause.slice(0, CAUSE_MAX_CHARS)}${TRUNCATION_MARK}` : cause;
  return { level: ERROR_KINDS.has(kind) ? "error" : "warn", fields: { pluginSlug, kind, cause: bounded }, message: "plugin: failure" };
}

export function logPluginFailure(pluginSlug: string, kind: PluginFailureKind, cause: string, logger: Logger): void {
  const line = pluginFailureLine(pluginSlug, kind, cause);
  getLog(logger)[line.level](line.fields, line.message);
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

// The log-level Select options for the System-settings surface. Split out of `system-settings-model` so
// that model stays DOM-free (node-testable): the `@orb/ui/select` type surface drags the Select
// component's browser TSX into the dom-less typecheck:graph, and this presentation list is the only thing
// in the model that referenced it.

import type { LogLevel } from "@orb/contracts/settings";
import { LOG_LEVELS } from "@orb/contracts/settings";
import type { SelectItems } from "@orb/ui/select";

const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  fatal: "Fatal",
  error: "Error",
  warn: "Warn",
  info: "Info",
  debug: "Debug",
  trace: "Trace",
  silent: "Silent",
};

/** The log-level Select options (derived from the ONE `LOG_LEVELS` tuple — never a hand-kept mirror). */
export const LOG_LEVEL_ITEMS: SelectItems<string> = LOG_LEVELS.map((value) => ({
  value,
  label: LOG_LEVEL_LABELS[value],
}));

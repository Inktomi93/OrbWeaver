// The log-level Select options for the Operations admin section. Moved here with the section (SET-SEAMS
// stage 4 — the System pane decomposed into user-admin contributions); it stays split from the section body
// so the label map has one home and the list DERIVES from the `LOG_LEVELS` tuple rather than mirroring it.

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

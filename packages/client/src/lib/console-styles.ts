import { TOKENS } from "@orb/ui/tokens";

/** Shared DevTools channel colours derive from the UI palette. */
export const CONSOLE_STYLES = {
  prefix: `color:${TOKENS["color.muted-foreground"].value};font-weight:bold`,
  muted: `color:${TOKENS["color.muted-foreground"].value}`,
  path: `color:${TOKENS["color.info"].value}`,
  event: `color:${TOKENS["color.success"].value};font-weight:bold`,
  warning: `color:${TOKENS["color.warning"].value};font-weight:bold`,
  error: `color:${TOKENS["color.destructive"].value};font-weight:bold`,
};

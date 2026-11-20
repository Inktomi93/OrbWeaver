// The control kinds the disabled-signal CT renders enabled and disabled, one per state home in `packages/ui/src/lib/disabled-state.ts`.

export const SIGNAL_STATES = ["enabled", "disabled"] as const;

export const SIGNAL_CASES = [
  "outline button",
  "ghost button",
  "list row",
  "option strip",
  "text field",
  "number field",
  "number field digits",
  "select trigger",
  "checked switch",
  "checked checkbox",
  "checked radio",
  "slider",
] as const;

export type SignalCase = (typeof SIGNAL_CASES)[number];

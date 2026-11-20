// The anchored floats of ui-surface-and-interaction-rules §1.1 that `@orb/ui` seals, and the options their lists hold.

export const ANCHORED_FLOATS = ["select", "combobox", "autocomplete", "popover", "menu", "tooltip"] as const;

export type AnchoredFloat = (typeof ANCHORED_FLOATS)[number];

export const FLOAT_OPTIONS = ["Ember", "Moss"] as const;

/** Each float's painted popup, by the slot its seal stamps. */
export const FLOAT_POPUP_SLOTS: Record<AnchoredFloat, string> = {
  select: "select-popup",
  combobox: "combobox-popup",
  autocomplete: "autocomplete-popup",
  popover: "popover-popup",
  menu: "menu-popup",
  tooltip: "tooltip-popup",
};

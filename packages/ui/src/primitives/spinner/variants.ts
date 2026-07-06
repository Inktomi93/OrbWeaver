import { tv } from "#lib";

// The spinner skin — an inline status wrapper, a spinning glyph, and a visually-hidden label
// (ui-package-design §6.1). Icon SIZE is a number prop (see icons/icon.tsx), so it is NOT a class
// variant here — the size union lives in the component beside the ICON_* consts.
export const spinnerVariants = tv({
  slots: {
    root: "inline-flex items-center justify-center",
    icon: "animate-spin",
    label: "sr-only",
  },
});

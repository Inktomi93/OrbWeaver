import { FOCUS_RING, tv } from "#lib";

// The settings-surface row skin: label docked left, control docked right, an optional
// info-glyph tooltip trigger, and an optional disabled-with-reason note (ui-package-design §6.1;
// work-order item 20 — every settings surface composes this: themes, automation budget, crew
// knobs, plugin/admin).
export const settingRowVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-field",
    main: "flex w-full flex-row items-center justify-between gap-row",
    labelBlock: "flex min-w-0 flex-col gap-field",
    labelGroup: "flex min-w-0 flex-row items-center gap-field",
    label: "truncate text-label font-medium leading-label text-foreground",
    description: "text-micro leading-label text-muted-foreground",
    hintTrigger: `inline-flex shrink-0 items-center justify-center rounded-control text-muted-foreground hover:text-foreground focus-visible:outline-none ${FOCUS_RING}`,
    // The RIGHT control column — a fixed ~200px so every settings row (SettingRow AND Field horizontal)
    // aligns its control, and a select can't stretch to 100% (UIP-404).
    control: "flex w-(--width-control-col) shrink-0 items-center justify-end",
    disabledReason: "text-label leading-label text-muted-foreground",
  },
});

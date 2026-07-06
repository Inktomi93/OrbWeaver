import { tv } from "#lib";

// The settings-surface row skin: label docked left, control docked right, an optional
// info-glyph tooltip trigger, and an optional disabled-with-reason note (ui-package-design §6.1;
// work-order item 20 — every settings surface composes this: themes, automation budget, crew
// knobs, plugin/admin).
export const settingRowVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-field",
    main: "flex w-full flex-row items-center justify-between gap-row",
    labelGroup: "flex min-w-0 flex-row items-center gap-field",
    label: "truncate text-label font-medium leading-label text-foreground",
    hintTrigger:
      "inline-flex shrink-0 items-center justify-center rounded-control text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    control: "flex shrink-0 items-center",
    disabledReason: "text-label leading-label text-muted-foreground",
  },
});

import { tv } from "#lib";

/** `<BarList>` wrapper skin — just the heading rhythm above the `<Chart>` canvas. */
export const barListVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-field",
    heading: "text-label font-medium leading-label text-foreground",
  },
});

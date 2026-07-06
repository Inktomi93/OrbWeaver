import { tv } from "#lib";

/** The `<Chart>` wrapper skin — a plain sized box; ECharts owns everything painted inside it. */
export const chartVariants = tv({
  slots: {
    root: "relative w-full",
  },
});

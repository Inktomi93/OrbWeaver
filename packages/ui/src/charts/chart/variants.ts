import { tv } from "#lib";

/** The `<Chart>` wrapper skin — a plain sized box; ECharts owns everything painted inside it. */
export const chartVariants = tv({
  slots: {
    root: "relative w-full",
  },
  variants: {
    /** The wrapper CARRIES a percentage height instead of passing it inward (see `chart.tsx`'s `fill`
     *  block): `h-full` for a block host, `flex-1 min-h-0` for the flex-column hosts every chart in this
     *  family actually sits in (`LabeledChartFrame`). Both are spelled because the primitive cannot see
     *  which one it was mounted into, and they compose — `flex-1` resolves the basis in a flex parent and
     *  is inert in a block one. */
    // Slot-keyed, not a bare string: a `tv()` with `slots` ignores a variant value that is not a
    // per-slot record, silently and without a type error.
    fill: {
      true: { root: "h-full min-h-0 flex-1" },
      false: { root: "" },
    },
  },
  defaultVariants: { fill: false },
});

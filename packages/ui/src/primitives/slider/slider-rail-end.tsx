import type { ComponentProps, ReactElement } from "react";
import { cn } from "#lib";
import { SLIDER_RAIL_END } from "./variants.ts";

/** The cluster that ends where a slider's rail ends: the value and what resets it, beside the rail's name once the grid folds. */
export function SliderRailEnd({ className, ...props }: ComponentProps<"div">): ReactElement {
  return <div data-slot="slider-rail-end" {...props} className={cn(SLIDER_RAIL_END, className)} />;
}

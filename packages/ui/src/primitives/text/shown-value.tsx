import { NO_VALUE } from "@orb/kit/strings";
import type { ReactNode } from "react";
import { NoValue } from "./no-value.tsx";

/** A formatted value as a node: the empty-value glyph carries its name, any other value is its own text. */
export function shownValue(value: string): ReactNode {
  return value === NO_VALUE ? <NoValue /> : value;
}

// The CONTEXT tab body template: the one column a context pane's body lays its content in. Layout only; the body
// owns its reads, its gone state and its boundary, and the host owns the tier.

import type { StackProps } from "@orb/ui/layout";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

const CONTEXT_TAB_KINDS = ["sections", "rows"] as const;

export interface ContextTabBodyProps extends Omit<StackProps, "className" | "gap" | "padding"> {
  /** `sections`: titled sections at the section step, inset by the block step. `rows`: a tight run of rows or cards the host already insets. */
  readonly kind?: (typeof CONTEXT_TAB_KINDS)[number];
}

export function ContextTabBody({ kind = "sections", ...stack }: ContextTabBodyProps): ReactElement {
  return kind === "sections" ? <Stack {...stack} gap="section" padding="block" /> : <Stack {...stack} gap="tight" />;
}

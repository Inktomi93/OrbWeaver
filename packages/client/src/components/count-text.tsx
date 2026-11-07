// A census beside a name uses the readable label voice, muted and tabular so changing counts keep their columns; it never squeezes or wraps.

import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

export interface CountTextProps {
  readonly children: ReactNode;
  /** Sets the count at the line's end. */
  readonly push?: "inlineEnd" | undefined;
  readonly "data-slot"?: string;
}

export function CountText({ children, push, "data-slot": dataSlot }: CountTextProps): ReactElement {
  return (
    <Text as="span" className="shrink-0" data-slot={dataSlot} ink="muted" voice="label" numeric={true} push={push} whitespace="nowrap">
      {children}
    </Text>
  );
}

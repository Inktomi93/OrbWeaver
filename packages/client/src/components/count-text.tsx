// The one spelling of a census figure beside a name: the label step, muted, regular weight, the title's
// sans family with tabular figures so it does not jitter as it changes. List headers, band censuses and
// library facts all print their number through this.

import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

export interface CountTextProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly "data-slot"?: string;
}

export function CountText({ children, className, "data-slot": dataSlot }: CountTextProps): ReactElement {
  return (
    <Text
      as="span"
      className={className === undefined ? "tabular-nums" : `${className} tabular-nums`}
      data-slot={dataSlot}
      size="label"
      tone="muted"
      weight="regular"
    >
      {children}
    </Text>
  );
}

// A census beside a name uses the readable label voice, muted and tabular so changing counts keep their columns.

import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

export interface CountTextProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly "data-slot"?: string;
}

export function CountText({ children, className, "data-slot": dataSlot }: CountTextProps): ReactElement {
  return (
    <Text as="span" className={className} data-slot={dataSlot} tone="muted" voice="label" numeric={true}>
      {children}
    </Text>
  );
}

import { CtIsolation } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { WaystoneProps } from "@orb/ui/meter";
import { Waystone } from "@orb/ui/meter";
import type { ReactElement } from "react";

export function WaystoneStory({ width, ...props }: WaystoneProps & { readonly width?: number }): ReactElement {
  return (
    <CtIsolation subject="Waystone" isolates="Domain-free clock and weather rendering through the public meter component">
      <Container style={width === undefined ? undefined : { inlineSize: width }}>
        <Waystone {...props} />
      </Container>
    </CtIsolation>
  );
}

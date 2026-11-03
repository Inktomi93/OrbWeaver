import { CtIsolation } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { WaystoneProps } from "@orb/ui/meter";
import { Waystone } from "@orb/ui/meter";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";

export function WaystoneStory({
  width,
  outerTheme,
  background,
  ...props
}: WaystoneProps & { readonly width?: number; readonly outerTheme?: "light" | "mocha"; readonly background?: string }): ReactElement {
  return (
    <CtIsolation subject="Waystone" isolates="Domain-free clock and weather rendering through the public meter component">
      <Container data-theme={outerTheme} style={width === undefined ? undefined : { inlineSize: width }}>
        <ThemeScope tokens={background === undefined ? {} : { background }} className="contents">
          <Waystone {...props} />
        </ThemeScope>
      </Container>
    </CtIsolation>
  );
}

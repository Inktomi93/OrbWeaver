import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Checkbox } from "@orb/ui/checkbox";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** Real consumers of the square and stretched touch-target recipes. */
export function UtilityFallbackStory(): ReactElement {
  return (
    <CtIsolation subject="Utility fallback" isolates="Utility state over the browser-specific property initialization layer">
      <Stack align="start" gap="section" padding="section">
        <Button intent="ghost" size="glyph-lg" aria-label="Square control">
          A
        </Button>
        <Button intent="ghost" size="inline">
          Stretched control
        </Button>
        <Checkbox aria-label="Selection control" />
      </Stack>
    </CtIsolation>
  );
}

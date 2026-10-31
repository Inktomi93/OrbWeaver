import { CtIsolation } from "@orb/testkit/browser";
import { Checkbox } from "@orb/ui/checkbox";
import { GlyphButton } from "@orb/ui/glyph-button";
import { InlineAction } from "@orb/ui/inline-action";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** Real consumers of the square and stretched touch-target recipes. */
export function UtilityFallbackStory(): ReactElement {
  return (
    <CtIsolation subject="Utility fallback" isolates="Utility state over the browser-specific property initialization layer">
      <Stack align="start" gap="section" padding="section">
        <GlyphButton variant="ghost" glyph="lg" aria-label="Square control">
          A
        </GlyphButton>
        <InlineAction variant="ghost" step="label">
          Stretched control
        </InlineAction>
        <Checkbox aria-label="Selection control" />
      </Stack>
    </CtIsolation>
  );
}

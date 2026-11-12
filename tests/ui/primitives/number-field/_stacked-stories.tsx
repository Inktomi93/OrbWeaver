import { CtIsolation } from "@orb/testkit/browser";
import { Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import type { ReactElement } from "react";

/** The stepped field in a column of a given width, where its steppers take their own line when the column is narrow. */
export function StackedNumberFieldStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtIsolation subject="NumberField" isolates="The stacked stepped field's hit areas, without the editor around it">
      {/* The page's own inset, so a hit area reaching past the column's edge is still on the screen. */}
      <Stack paddingInline="section">
        <Stack container={true} style={{ inlineSize: width }}>
          <NumberField aria-label="Count under test" defaultValue={4} min={0} />
        </Stack>
      </Stack>
    </CtIsolation>
  );
}

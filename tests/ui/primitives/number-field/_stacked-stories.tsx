import { CtIsolation } from "@orb/testkit/browser";
import { Row, Stack } from "@orb/ui/layout";
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

/** Two stepped fields side by side in columns of a given width, as a two-column form lays them: a tap on one's edge is the other's to take. */
export function TwoFieldRowStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtIsolation subject="NumberField" isolates="Two neighbouring stacked stepped fields' hit areas, without the editor around them">
      <Stack paddingInline="section">
        <Row>
          <Stack container={true} style={{ inlineSize: width }}>
            <NumberField aria-label="First count" defaultValue={4} min={0} />
          </Stack>
          <Stack container={true} style={{ inlineSize: width }}>
            <NumberField aria-label="Second count" defaultValue={4} min={0} />
          </Stack>
        </Row>
      </Stack>
    </CtIsolation>
  );
}

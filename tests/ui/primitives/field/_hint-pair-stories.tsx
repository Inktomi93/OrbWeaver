import { CtIsolation } from "@orb/testkit/browser";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Grid } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** A hinted and an unhinted field side by side in one row of a two-column grid. */
export function HintPairStory({ hinted, plain }: { readonly hinted: string; readonly plain: string }): ReactElement {
  return (
    <CtIsolation subject="Field hint" isolates="Whether a hinted label row stands the height of a plain one, without a feature around it">
      <Grid cols="auto" gap="block">
        <Field label={hinted} hint="Make words more or less likely.">
          <Input defaultValue="0" />
        </Field>
        <Field label={plain}>
          <Input defaultValue="0" />
        </Field>
      </Grid>
    </CtIsolation>
  );
}

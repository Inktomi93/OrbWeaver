import { CtIsolation } from "@orb/testkit/browser";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Container, Grid, Section, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

const SIZE_BOX_PX = 200;

/** Each box declares its own container; the `pair` grid inside it answers to that box's width. */
export function ContainerPropsStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtIsolation subject="Layout container boxes" isolates="The container written by Container, Section and Stack, and nothing from a shell">
      <div style={{ width }}>
        <Container>
          <Grid cols="pair" data-probe="container">
            <span>a</span>
            <span>b</span>
          </Grid>
        </Container>
        <Section container={true} heading="Section box">
          <Grid cols="pair" data-probe="section">
            <span>a</span>
            <span>b</span>
          </Grid>
        </Section>
        <Section container={true} heading="Settings box">
          <Field label="Row" orientation="horizontal">
            <Input aria-label="Row value" />
          </Field>
        </Section>
        <Stack container={true}>
          <Grid cols="pair" data-probe="stack">
            <span>a</span>
            <span>b</span>
          </Grid>
        </Stack>
        <Stack container="size" style={{ height: SIZE_BOX_PX, width: SIZE_BOX_PX }}>
          <Stack data-probe="size" style={{ height: "50cqh" }} />
        </Stack>
      </div>
    </CtIsolation>
  );
}

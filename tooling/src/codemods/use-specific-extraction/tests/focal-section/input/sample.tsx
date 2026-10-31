import { Section, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

declare const focal: boolean;

// A literal `focal={true}` moves; a computed value and a section that names no focal stay Sections.
export function Sample(): ReactElement {
  return (
    <Stack>
      <Section heading="Literal" focal={true}>
        moves
      </Section>
      <Section heading="Computed" focal={focal}>
        stays
      </Section>
      <Section heading="Plain">stays</Section>
    </Stack>
  );
}

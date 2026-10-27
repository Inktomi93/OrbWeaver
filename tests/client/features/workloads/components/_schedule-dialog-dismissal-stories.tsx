import { CtClientProviders, CtConfigGroupBody, configSections, isolationRegistry } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** Mount the registered production schedule section with its normal client providers. */
export function ScheduleDialogDismissalStory({ width }: { readonly width: number }): ReactElement {
  const section = configSections.get("workloads-schedules");
  const sections = isolationRegistry("configSections", "isolates schedule-dialog checks from unrelated settings sections", [section]);
  return (
    <CtClientProviders>
      <Container style={{ inlineSize: width }}>
        <CtConfigGroupBody anchor={section.anchor} sections={sections} />
      </Container>
    </CtClientProviders>
  );
}

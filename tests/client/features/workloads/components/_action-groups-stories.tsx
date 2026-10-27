import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppearanceChannels, CtClientProviders, CtConfigGroupBody, configSections, isolationRegistry } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** Keep each registered section in its actual composition, with an explicit pane boundary. */
export function WorkloadActionGroupsStory({
  sectionId,
  width,
  appearance,
}: {
  readonly sectionId: "backup-import" | "workloads-schedules" | "workloads-jobs";
  readonly width: number;
  readonly appearance: AppearanceSettings;
}): ReactElement {
  const section = configSections.get(sectionId);
  const sections = isolationRegistry("configSections", "isolates workload action geometry from unrelated settings sections", [section]);
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container role="group" aria-label="Workload action host" style={{ inlineSize: width }}>
          <CtConfigGroupBody anchor={section.anchor} sections={sections} />
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}

import { useActiveSection, useSelectedDocumentId } from "@orb/client/state";
import { CtClientProviders, CtConfigGroupBody, configSections, isolationRegistry } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** What the Open button on a failed document wrote: the section the rail moved to and the document it selected. */
function NavigationProbe(): ReactElement {
  const section = useActiveSection();
  const documentId = useSelectedDocumentId();
  return <Text data-slot="navigation-probe">{`${section} ${documentId ?? ""}`}</Text>;
}

/** The Jobs section in its real composition, beside a readout of the navigation its rows trigger. */
export function FailedDocumentsStory(): ReactElement {
  const section = configSections.get("workloads-jobs");
  const sections = isolationRegistry("configSections", "isolates the jobs list from unrelated settings sections", [section]);
  return (
    <CtClientProviders>
      <Container role="group" aria-label="Jobs host">
        <CtConfigGroupBody anchor={section.anchor} sections={sections} />
      </Container>
      <NavigationProbe />
    </CtClientProviders>
  );
}

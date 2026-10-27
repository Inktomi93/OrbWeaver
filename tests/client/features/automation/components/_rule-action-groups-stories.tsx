import { useSessionRecovery } from "@orb/client/data";
import { automationLibraryRulesSection } from "@orb/client/features/automation";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppearanceChannels, CtClientProviders, CtConfigGroupBody, isolationRegistry } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

const sections = isolationRegistry("configSections", "isolates the real owner rule list and its editor from the independent budget section", [
  automationLibraryRulesSection,
]);

function ReadyRuleList(): ReactElement | null {
  const recovery = useSessionRecovery();
  return recovery.status === "ready" ? <CtConfigGroupBody anchor={automationLibraryRulesSection.anchor} sections={sections} /> : null;
}

export function RuleActionGroupsStory({ width, appearance }: { readonly width: number; readonly appearance: AppearanceSettings }): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container aria-label="Rule action host" className="h-screen" role="group" style={{ inlineSize: width }}>
          <Stack className="overflow-y-auto overscroll-contain px-section py-section block-full min-block-0">
            <ReadyRuleList />
          </Stack>
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}

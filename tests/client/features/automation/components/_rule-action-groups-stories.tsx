import { useSessionRecovery } from "@orb/client/data";
import { automationLibraryRulesSection, automationRulesSection } from "@orb/client/features/automation";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { ChatId } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders, CtConfigGroupBody, isolationRegistry } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

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
          {/* The settings pane's own inline inset prop, so the rule card sits as far in as it does on the page. */}
          <Stack className="overflow-y-auto overscroll-contain py-section block-full min-block-0" paddingInline="section">
            <ReadyRuleList />
          </Stack>
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}

function ReadyChatRules({ chatId }: { readonly chatId: ChatId }): ReactNode {
  const recovery = useSessionRecovery();
  return recovery.status === "ready" ? automationRulesSection.body({ chatId }) : null;
}

/** The production Rules section of one room, as its host sees it. */
export function ChatRulesStory({ chatId, appearance }: { readonly chatId: ChatId; readonly appearance: AppearanceSettings }): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container aria-label="Chat rules host" className="h-screen" role="group" style={{ inlineSize: 960 }}>
          <Stack className="overflow-y-auto overscroll-contain px-section py-section block-full min-block-0">
            <ReadyChatRules chatId={chatId} />
          </Stack>
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}

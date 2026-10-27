import { CtClientProviders, CtConfigGroupBody, configSections, isolationRegistry } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** Mount the registered production message-style section and picker. */
export function AppearanceChatStylePickerStory({ width }: { readonly width: number }): ReactElement {
  const section = configSections.get("appearance-message-style");
  const sections = isolationRegistry("configSections", "isolates the message-style picker from unrelated settings sections", [section]);
  return (
    <CtClientProviders>
      <Container style={{ inlineSize: width }}>
        <CtConfigGroupBody anchor={section.anchor} sections={sections} />
      </Container>
    </CtClientProviders>
  );
}

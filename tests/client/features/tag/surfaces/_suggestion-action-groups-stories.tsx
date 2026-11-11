import { labelsCorpusMode } from "@orb/client/features/tag";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppearanceChannels, CtClientProviders, CtUserBus } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

export function SuggestionActionGroupsStory({ width, appearance }: { readonly width: number; readonly appearance: AppearanceSettings }): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container aria-label="Suggestion action host" role="group" style={{ inlineSize: width }}>
          <Stack className="px-section">
            <CtUserBus>{labelsCorpusMode.content()}</CtUserBus>
          </Stack>
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}

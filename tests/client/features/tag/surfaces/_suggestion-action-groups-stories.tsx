import { useInvalidation, useOrbSocket, useUserBus } from "@orb/client/data";
import { labelsCorpusMode } from "@orb/client/features/tag";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

function LiveSuggestions(): ReactElement {
  const invalidation = useInvalidation();
  useOrbSocket();
  useUserBus({ invalidateUser: invalidation.invalidateUser, invalidateAllUserRoots: invalidation.invalidateAllUserRoots });
  return <>{labelsCorpusMode.content()}</>;
}

export function SuggestionActionGroupsStory({ width, appearance }: { readonly width: number; readonly appearance: AppearanceSettings }): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container aria-label="Suggestion action host" role="group" style={{ inlineSize: width }}>
          <Stack className="px-section">
            <LiveSuggestions />
          </Stack>
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}

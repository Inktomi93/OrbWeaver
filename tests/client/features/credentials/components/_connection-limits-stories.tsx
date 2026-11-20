import { connectionsListSection } from "@orb/client/features/credentials";
import { requestConnectionEditor } from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { UserConnectionId } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useEffect } from "react";

/** A door outside the list asking for one connection's editor with its Advanced tier open, as the preset deck's does. */
function RequestEditor({ connectionId }: { readonly connectionId: UserConnectionId }): null {
  useEffect(() => {
    requestConnectionEditor(connectionId, { openAdvanced: true });
  }, [connectionId]);
  return null;
}

/** The real Connections list contribution at a pane width and appearance, optionally asked to open one editor. */
export function ConnectionLimitsStory({
  width,
  appearance,
  requested,
}: {
  readonly width: number;
  readonly appearance: AppearanceSettings;
  readonly requested?: UserConnectionId;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        {requested === undefined ? null : <RequestEditor connectionId={requested} />}
        <Container style={{ inlineSize: width }}>{connectionsListSection.body("connection-limits-subject")}</Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}

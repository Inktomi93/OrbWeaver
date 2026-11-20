import { connectionsListSection } from "@orb/client/features/credentials";
import type { ConnectionEditorFact } from "@orb/client/state";
import { requestConnectionEditor } from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { UserConnectionId } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useEffect } from "react";

/** A door outside the list asking for one connection's editor with its Advanced tier open, as the preset deck's does. */
function RequestEditor({ connectionId, fact }: { readonly connectionId: UserConnectionId; readonly fact?: ConnectionEditorFact }): null {
  useEffect(() => {
    requestConnectionEditor(connectionId, fact === undefined ? { openAdvanced: true } : { fact });
  }, [connectionId, fact]);
  return null;
}

/** The real Connections list contribution at a pane width and appearance, optionally asked to open one editor. */
export function ConnectionLimitsStory({
  width,
  appearance,
  requested,
  fact,
}: {
  readonly width: number;
  readonly appearance: AppearanceSettings;
  readonly requested?: UserConnectionId;
  readonly fact?: ConnectionEditorFact;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        {requested === undefined ? null : <RequestEditor connectionId={requested} {...(fact === undefined ? {} : { fact })} />}
        <Container style={{ inlineSize: width }}>{connectionsListSection.body("connection-limits-subject")}</Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}

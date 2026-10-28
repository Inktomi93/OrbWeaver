import { selectRefinerySession, useSectionRegistry } from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { RefinerySessionId } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

function Workbench({ sessionId }: { readonly sessionId: RefinerySessionId }): ReactNode {
  useState(() => selectRefinerySession(sessionId));
  const content = useSectionRegistry().get("refinery").content;
  if (typeof content !== "function") {
    throw new Error("Refinery has no content contribution");
  }
  return content();
}

/** The registry's complete workbench reads its manual rewrite and decision sheet from the real session. */
export function RefineryActionGroupsStory({
  sessionId,
  width,
  appearance,
}: {
  readonly sessionId: RefinerySessionId;
  readonly width: number;
  readonly appearance: AppearanceSettings;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container role="group" aria-label="Refinery action host" style={{ inlineSize: width }}>
          <Workbench sessionId={sessionId} />
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}

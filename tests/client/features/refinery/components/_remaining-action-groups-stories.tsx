import type { ResolvedContextTabs } from "@orb/client/lib";
import { selectRefinerySession, useSectionRegistry } from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { RefinerySessionId } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { Suspense, useState } from "react";

const PLANES = ["content", "runs", "versions"] as const;
type Plane = (typeof PLANES)[number];

function ResolvedTab({ useResolved, tab }: { readonly useResolved: () => ResolvedContextTabs | null; readonly tab: Exclude<Plane, "content"> }): ReactNode {
  return useResolved()?.tabs.find((entry) => entry.id === tab)?.node ?? null;
}

function SelectedContribution({ sessionId, plane }: { readonly sessionId: RefinerySessionId; readonly plane: Plane }): ReactNode {
  useState(() => selectRefinerySession(sessionId));
  const definition = useSectionRegistry().get("refinery");
  if (plane === "content") {
    if (typeof definition.content !== "function") {
      throw new Error("Refinery has no content contribution");
    }
    return definition.content();
  }
  if (definition.context.kind !== "tabs") {
    throw new Error("Refinery has no context tabs");
  }
  return <ResolvedTab useResolved={definition.context.useResolved} tab={plane} />;
}

/** The real registry's workbench or context contribution, not a copied action row. */
export function RefineryRemainingActionsStory({
  sessionId,
  plane,
  width,
  appearance,
}: {
  readonly sessionId: RefinerySessionId;
  readonly plane: Plane;
  readonly width: number;
  readonly appearance: AppearanceSettings;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container role="group" aria-label="Refinery remaining-action host" style={{ inlineSize: width }}>
          <Suspense>
            <SelectedContribution sessionId={sessionId} plane={plane} />
          </Suspense>
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}

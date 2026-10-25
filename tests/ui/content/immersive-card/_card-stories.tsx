import { CtIsolation } from "@orb/testkit/browser";
import { ImmersiveCard } from "@orb/ui/immersive-card";
import type { ReactElement } from "react";

export function ImmersiveCardChromeStory(): ReactElement {
  return (
    <CtIsolation subject="ImmersiveCard chrome" isolates="The header's icon-only controls keep a pointer hint without a native title">
      <ImmersiveCard html="<p>card</p>" origin="lenient" title="Chrome" />
    </CtIsolation>
  );
}

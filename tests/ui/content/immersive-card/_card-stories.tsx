import { CtIsolation } from "@orb/testkit/browser";
import { ImmersiveCard } from "@orb/ui/immersive-card";
import type { ReactElement } from "react";

// Authored card CSS: one rem-sized and one px-sized line, so the frame's text-scale contract is observable on both.
const SCALE_CARD_CSS = "#rem { font-size: 1rem; margin: 0; } #px { font-size: 16px; margin: 0; }";
const SCALE_CARD_HTML = '<p id="rem">rem text</p><p id="px">px text</p>';

export function ImmersiveCardTextScaleStory(): ReactElement {
  return (
    <CtIsolation subject="ImmersiveCard text scale" isolates="The user's appearance font scale reaching the isolated card document, without application state">
      <ImmersiveCard html={SCALE_CARD_HTML} css={SCALE_CARD_CSS} origin="lenient" title="Scale" />
    </CtIsolation>
  );
}

export function ImmersiveCardChromeStory(): ReactElement {
  return (
    <CtIsolation subject="ImmersiveCard chrome" isolates="The header's icon-only controls keep a pointer hint without a native title">
      <ImmersiveCard html="<p>card</p>" origin="lenient" title="Chrome" />
    </CtIsolation>
  );
}

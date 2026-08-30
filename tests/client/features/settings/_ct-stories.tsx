// Settings feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). What is
// LEFT of the feature after the config revamp (#866 S1): the THEME picker, and the two `sections`-skimmer
// group definitions (Appearance · Chat behavior) — which mount ONLY through the config host, so their
// stories delegate to `ConfigHostStory` (the shell's LIST + CONTENT over the real registries).

import { ThemePickerSurface } from "@orb/client/features/settings";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";
import { ConfigHostStory } from "../config/_ct-stories.tsx";

/** The real theme picker/library (D44 §12.1) — wrapped in the data layer (its `listThemes` +
 *  `getUserSettings` reads are stubbed per-test via routeTrpc) + TooltipProvider for the row chrome. */
export function ThemePickerStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ width: 560 }}>
          <ThemePickerSurface />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The picker in the NARROWEST REAL HOST — the `size="md"` settings dialog's inner content box at a 320px
 *  viewport, measured live at ~206px. The prior CT for this defect concluded a CT could not reproduce the
 *  clip; it was right about ITS mount, which was content-sized and simply grew to fit the over-wide band.
 *  A FIXED width is what makes the overflow real, and `overflow: visible` is what keeps it MEASURABLE
 *  (a hidden/clip container would swallow the very geometry the assertion reads). */
export function ThemePickerNarrowStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ width: 206, overflow: "visible" }} data-testid="theme-dialog-body">
          <ThemePickerSurface />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The REAL appearance group, driven through the config host — the ONLY way to mount it since SET-SEAMS
 *  stage 1 made it a `{kind:"sections"}` skimmer with no surface of its own. Deep-linked so it lands cold on
 *  appearance with the REAL door-ordered section registry, the host's aggregate save-status footer
 *  (`SaveStatusHostContext`) and the derived LIST rows — the production path. A tall/wide box: the group
 *  stacks eight sections and would clip in a short one. */
export function AppearanceGroupStory(): ReactElement {
  return <ConfigHostStory target="appearance" height={900} width={1160} />;
}

/** The REAL chat-behavior group, driven through the config host — the ONLY way to mount it since SET-SEAMS
 *  stage 2 made it a `{kind:"sections"}` skimmer with no surface of its own. Deep-linked so it lands cold on
 *  chat-behavior with the REAL door-ordered section registry, the host's aggregate save-status footer and
 *  the derived LIST rows — the production path. A tall/wide box: the group stacks six sections. */
export function ChatBehaviorGroupStory(): ReactElement {
  return <ConfigHostStory target="chat-behavior" height={900} width={1160} />;
}

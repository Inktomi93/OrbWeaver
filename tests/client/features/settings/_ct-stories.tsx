// Settings feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). What is
// LEFT of the feature after the config revamp (#866 S1+S4): the LOOKS section (the theme picker + builder,
// folded into Appearance from the retired `theme` modal), and the two `sections`-skimmer group definitions
// (Appearance · Chat behavior) — which mount ONLY through the config host, so their stories delegate to
// `ConfigHostStory` (the shell's LIST + CONTENT over the real registries).

import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useState } from "react";
import { AppearanceLooksSection } from "../../../../packages/client/src/features/settings/components/appearance-looks-section.tsx";
import { CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";
import { ConfigHostStory } from "../config/_ct-stories.tsx";

/** The LOOKS section alone (its `listThemes` + `getUserSettings` reads stubbed per-test via routeTrpc) —
 *  the picker cards, Your-themes rows, and the inline builder, at the CONTENT pane's comfortable width. */
export function LooksSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ width: 760 }}>
          <AppearanceLooksSection />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The narrowest REAL host — the pushed phone pane (~430px). FIXED width + `overflow: visible` so an
 *  over-wide row genuinely overflows and containment assertions can fire (the content-sized-mount lesson
 *  from the retired theme-picker narrow story, carried forward). */
export function LooksSectionNarrowStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div data-testid="looks-narrow-host" style={{ overflow: "visible", width: 430 }}>
          <AppearanceLooksSection />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The LOOKS section OPENED TWICE (#1100). `reopen` re-keys the provider stack, so the second open gets a
 *  FRESH QueryClient and genuinely re-reads `listThemes` — the shape of a user leaving the Appearance group
 *  and coming back. The tail sentinel sits directly under the section: whatever the section does while its
 *  read is in flight, it does to that sentinel's y. */
export function LooksSectionReopenStory(): ReactElement {
  const [open, setOpen] = useState(0);
  return (
    <>
      <button type="button" onClick={(): void => setOpen((n) => n + 1)}>
        reopen
      </button>
      <CtDataProviders key={open}>
        <TooltipProvider>
          <div style={{ width: 760 }}>
            <AppearanceLooksSection />
            <div data-testid="looks-tail" style={{ height: 8 }} />
          </div>
        </TooltipProvider>
      </CtDataProviders>
    </>
  );
}

/** The REAL appearance group, driven through the config host — the ONLY way to mount the skimmer since
 *  SET-SEAMS stage 1. Deep-linked so it lands cold on appearance with the REAL door-ordered section
 *  registry, the aggregate save-status footer and the derived LIST rows — the production path. */
export function AppearanceGroupStory(): ReactElement {
  return <ConfigHostStory target="appearance" height={900} width={1160} />;
}

/** The REAL chat-behavior group, same posture. */
export function ChatBehaviorGroupStory(): ReactElement {
  return <ConfigHostStory target="chat-behavior" height={900} width={1160} />;
}

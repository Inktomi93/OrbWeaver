// config feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
//
// The stories mount the REAL config host panes (LIST · CONTENT · CONTEXT) over the REAL door registries: the
// 13-group `config-groups` registry (`ctRealConfigGroups`, total over CONFIG_GROUP_IDS — the nine settings
// skimmers + the four collections) and the REAL door-ordered config-section registry
// (`CtRealConfigSectionRegistry`), so the CTs drive the production seam end to end: host frame → shelves +
// bands → contributed sections / collection rows → kinded selection → member editor → context. Nothing
// here is a test double.
//
// The `reset groups` button is determinism, not product: the disclosure store is device-local
// (localStorage), and a CT that inherited another run's expanded set would assert the wrong first frame.
//
// THE LOOKS + GROUP-SKIMMER STORIES AT THE FOOT arrived with #2447, when `features/settings` folded into
// this feature (owner ruling 2026-09-19). They kept their posture exactly: the LOOKS section (the theme
// picker + builder) mounts DIRECTLY because it is a section body, while the two `sections`-skimmer group
// definitions (Appearance · Chat behavior) mount ONLY through `ConfigHostStory` — a skimmer has no surface
// of its own. Their old home, `tests/client/features/settings/_ct-stories.tsx`, reached `ConfigHostStory`
// across a directory; here it is a local function.

import { AppShell } from "@orb/client/features/app-shell";
import { CommandPaletteSurface } from "@orb/client/features/chat";
import { bindConfigPaletteGroups, configPaletteSource } from "@orb/client/features/config";
import type { CommandPaletteSource } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import type { ConfigGroupId } from "@orb/client/state";
import {
  __resetConfigGroupOpen,
  __resetConfigNav,
  CommandPaletteSourceRegistryProvider,
  clearCollectionSelection,
  openConfigTo,
  setActiveSection,
  setMobileViewport,
  useActiveSection,
} from "@orb/client/state";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { SectionContextHost } from "../../../../packages/client/src/features/app-shell/components/section-context-host.tsx";
import { AppearanceLooksSection } from "../../../../packages/client/src/features/config/components/appearance-looks-section.tsx";
import { makeConfigSection } from "../../../../packages/client/src/features/config/lib/config-section.tsx";
import { ConfigContentSurface } from "../../../../packages/client/src/features/config/surfaces/config-content-surface.tsx";
import { ConfigListSurface } from "../../../../packages/client/src/features/config/surfaces/config-list-surface.tsx";
import { placeholderConfigGroups, realConfigGroups } from "../../../support/browser/ct-config-groups.ts";
import { CtDataProviders, CtRealConfigSectionRegistry, CtRealSectionRegistry } from "../../../support/browser/ct-data-providers.tsx";

/** The determinism button every story carries: the disclosure memory, the nav and the selection all reset. */
function ResetGroupsButton(): ReactElement {
  return (
    <button
      type="button"
      onClick={(): void => {
        __resetConfigGroupOpen();
        __resetConfigNav();
        clearCollectionSelection();
      }}
    >
      reset groups
    </button>
  );
}

/** The DEFAULT docked LIST pane, measured on the live app at 307px (CONTEXT collapsed, LIST docked) — the
 *  state a reader arrives in. */
const DEFAULT_LIST_PX = 307;

export interface ConfigHostStoryProps {
  /** Seed a deep link BEFORE first render (the `openConfigTo` seam): the lazy `useState` initializer runs
   *  exactly once, synchronously, so `useConfigTarget()` reads the target on the first render — reproducing
   *  a cold `__orb.nav.openConfig(target)` where the `sessions.me` probe is still in flight. */
  readonly target?: ConfigGroupId;
  /** The SUB-level deep link (SET-SEAMS §10 Q4): the jump to `configAnchorId(target, sub)` lands once the
   *  group's DOM has the anchor. */
  readonly sub?: string;
  readonly width?: number;
  readonly height?: number;
  /** The #696 placeholder registry (connections → `{ placeholder: true }`) in place of the real one. */
  readonly placeholder?: boolean;
  /** Publish the MOBILE viewport regime BEFORE first render (#925 ruling 4). The arrival default is
   *  desktop-only — on a phone the LIST is the whole screen and an auto-selected group would push CONTENT
   *  over the map the reader arrived for — so the phone arm has to be the regime the FIRST render sees, not
   *  a switch flipped afterwards. `setMobileViewport` in the lazy initializer is the one place that is true. */
  readonly mobile?: boolean;
  /** Extra provider-nested children (a socket host, a probe) — rendered under the data layer. */
  readonly children?: ReactNode;
}

/** The config HOST: the LIST and CONTENT panes side by side over the real registries, in a fixed box, the
 *  way the shell mounts them (LIST docked at its default width, CONTENT filling the rest). The ONLY way to
 *  mount a `sections` skimmer since config-revamp-design.md §6.8 — a group has no surface of its own. */
export function ConfigHostStory({ target, sub, width = 900, height = 560, placeholder = false, mobile = false, children }: ConfigHostStoryProps): ReactElement {
  useState(() => {
    __resetConfigNav();
    setMobileViewport(mobile);
    if (target !== undefined) {
      openConfigTo(target, sub);
    }
    return null;
  });
  const groups = placeholder ? placeholderConfigGroups : realConfigGroups;
  return (
    <CtDataProviders>
      <CtRealConfigSectionRegistry>
        <TooltipProvider>
          <ResetGroupsButton />
          {children}
          {/* `minHeight: 0` on BOTH flex items is load-bearing: a row's items default to `min-height: auto`,
              so a tall CONTENT child would GROW the box past `height` instead of scrolling inside it — and
              the region's own `overflow-y-auto` (the one scroller the spy listens to) would never engage. */}
          <div style={{ display: "flex", height, width }}>
            <div style={{ minHeight: 0, overflow: "auto", width: DEFAULT_LIST_PX }}>
              <ConfigListSurface groups={groups} />
            </div>
            <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
              <ConfigContentSurface groups={groups} />
            </div>
          </div>
        </TooltipProvider>
      </CtRealConfigSectionRegistry>
    </CtDataProviders>
  );
}

/** The host inside the RUNNING APP'S containing-block topology: a POSITIONED, height-capped,
 *  `overflow-y:auto` host around the CONTENT pane. That is what the shell's CONTENT region resolves to live
 *  (the settings-modal era measured `[data-slot=dialog-popup]` clientHeight 1014 / scrollHeight 2900 with
 *  the pane's `sr-only` Base UI boxes landing on the popup). The plain host story cannot see this: in the
 *  CT harness a bare flex box computes `position: static`, so the escaping boxes land on the viewport and
 *  inflate nothing. This story restores the one property the harness drops (a positioned scrolling host)
 *  and nothing else. */
export function ConfigHostInScrollingHostStory({ target = "appearance" }: { readonly target?: ConfigGroupId }): ReactElement {
  useState(() => {
    __resetConfigNav();
    openConfigTo(target);
    return null;
  });
  const groups = realConfigGroups;
  return (
    <CtDataProviders>
      <CtRealConfigSectionRegistry>
        <TooltipProvider>
          <div data-testid="scrolling-host" style={{ height: 560, overflowY: "auto", position: "relative", width: 600 }}>
            <div style={{ height: "100%" }}>
              <ConfigContentSurface groups={groups} />
            </div>
          </div>
        </TooltipProvider>
      </CtRealConfigSectionRegistry>
    </CtDataProviders>
  );
}

/** The roster's content box at the NARROWEST real docked LIST pane: `--dimension-panel` clamps at 17rem
 *  (272px) and the panel body pays its own inline padding out of that. Measured, not guessed — the band's
 *  longest kicker ("Regex scripts", on the one collection that also draws all three trailing verbs) needed
 *  273px of this box and the pane gives 271, which is the two pixels the sweep saw go to an ellipsis. The
 *  shared workspace story runs a roomier 330px and cannot see it. */
const NARROW_ROSTER_PX = 271;

export function ConfigListNarrowStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealConfigSectionRegistry>
        <ResetGroupsButton />
        <div style={{ overflow: "hidden", width: NARROW_ROSTER_PX }}>
          <ConfigListSurface groups={realConfigGroups} />
        </div>
      </CtRealConfigSectionRegistry>
    </CtDataProviders>
  );
}

/** The roster's content box at the DEFAULT docked LIST pane — the state a reader arrives in (CONTEXT
 *  collapsed, LIST docked), measured on the live app at 307px. The narrow story above is the OTHER end of
 *  the range (both panes open); a row-width fix has to hold at BOTH, because a point measurement never
 *  proves a range property. */
export function ConfigListDefaultStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealConfigSectionRegistry>
        <ResetGroupsButton />
        <div style={{ overflow: "hidden", width: DEFAULT_LIST_PX }}>
          <ConfigListSurface groups={realConfigGroups} />
        </div>
      </CtRealConfigSectionRegistry>
    </CtDataProviders>
  );
}

/** ARRIVING IN THE WHOLE SECTION — the LIST roster and the CONTENT region mounting TOGETHER on a BOUNCE,
 *  which is what a rail switch does. `useFocusOnMount` deliberately declines on a COLD load (activeElement
 *  is `<body>`), so a plain mount cannot see this at all; and a roster-only mount has no competitor, so it
 *  cannot see it either. CONTENT mounts second here, exactly as the shell mounts it — the one arrangement
 *  in which "the content pane steals the section's arrival focus" exists. (The corpus
 *  `CorpusSectionArrivalStory` precedent, re-spelled for this workspace.) */
export function ConfigSectionArrivalStory(): ReactElement {
  const [inConfig, setInConfig] = useState(true);
  const groups = realConfigGroups;
  return (
    <CtDataProviders>
      <CtRealConfigSectionRegistry>
        <button type="button" onClick={(): void => setInConfig((here) => !here)}>
          {inConfig ? "Leave Configuration" : "Back to Configuration"}
        </button>
        <div style={{ display: "flex", height: 640, width: 900 }}>
          {inConfig ? (
            <>
              <div style={{ width: 330 }}>
                <ConfigListSurface groups={groups} />
              </div>
              <div style={{ flex: 1 }}>
                <ConfigContentSurface groups={groups} />
              </div>
            </>
          ) : (
            <p>Another section</p>
          )}
        </div>
      </CtRealConfigSectionRegistry>
    </CtDataProviders>
  );
}

/** The narrowest real PHONE the app is measured at (side-eye's own mobile arm) — the width where the LIST
 *  is the whole screen and CONTENT is unreachable until a member is selected. */
const PHONE_PX = 430;

/** The mobile LIST as a phone gets it: the roster at 430px with the shell's viewport regime published as
 *  MOBILE. The regime is a store fact, not a media query — `useMobileViewport` reads what app-shell
 *  publishes at 48rem, and a CT has no app-shell — so the story ships the two buttons the `#state` CTs
 *  already use for this, and the spec drives the arm it means (the settled state, never a first frame). */
export function ConfigMobileListStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealConfigSectionRegistry>
        <ResetGroupsButton />
        <button onClick={(): void => setMobileViewport(true)} type="button">
          go mobile
        </button>
        <button onClick={(): void => setMobileViewport(false)} type="button">
          go desktop
        </button>
        <div style={{ display: "flex", height: 700, width: PHONE_PX }}>
          <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
            <ConfigListSurface groups={realConfigGroups} />
          </div>
        </div>
      </CtRealConfigSectionRegistry>
    </CtDataProviders>
  );
}

/** THE CONFIG SECTION INSIDE THE REAL APP SHELL, at a phone (#1747) — the ONE mount in which the mobile
 *  ONE-SHELL rule and its BACK STACK exist at all.
 *
 *  WHY NOT `ConfigHostStory mobile`: that story publishes the viewport REGIME and then renders both panes
 *  side by side in a fixed flex box, so "the LIST is the screen" and "Back pops one rung" are not properties
 *  it can have — the shell owns both (`use-shell-layout.ts`: `listIsPrimaryContent`, and `backToList`, which
 *  is the config section's OWN declared `selection.clear`, `config-section.tsx`'s three-rung stack). This
 *  story mounts the production `AppShell` over the REAL section registry, so the rungs under test are the
 *  ones the phone actually pops.
 *
 *  IT CARRIES NO DRIVER ANY MORE (#1741 closed). It used to ship a `show the list` button that put the
 *  store into "nothing selected, no active group, the LIST docked", because a cold mount could not reach
 *  the LIST-is-the-screen arm at all: the shell published its viewport regime from a PASSIVE effect, which
 *  runs after the subtree's layout effects, so the config LIST's arrival default read a stale desktop
 *  regime and auto-selected a group on a phone. The seed in `use-shell-layout.ts` fixed the ordering, and a
 *  driver that stayed would be a story hiding a regression in the very state it exists to mount. */
export function ConfigMobileShellStory(): ReactElement {
  useState(() => {
    __resetConfigNav();
    clearCollectionSelection();
    setActiveSection("config");
    return null;
  });
  // THE SECTION IS ACTIVE BEFORE `AppShell` EVER RENDERS, which is the whole arrival under test (#1741).
  // `router.tsx`'s `/config` alias calls `setActiveSection` in `beforeLoad` and only THEN renders the app,
  // so the config LIST is in the shell's very FIRST commit. A story that landed the section from a mounted
  // effect instead (`useEffect(() => setActiveSection("config"))`) mounted the LIST one commit LATER — by
  // which time the shell's own viewport publish had already run, and the story silently measured an arrival
  // no reader can perform. Holding the shell back for one render is what makes the two orders agree.
  if (useActiveSection() !== "config") {
    return <CtDataProviders>{null}</CtDataProviders>;
  }
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <AppShell />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The whole Configuration workspace: LIST roster · CONTENT · CONTEXT, over the real registries. */
export function ConfigWorkspaceStory(): ReactElement {
  const groups = realConfigGroups;
  return (
    <CtDataProviders>
      <CtRealConfigSectionRegistry>
        <ResetGroupsButton />
        <div style={{ display: "flex", height: 700, width: 1100 }}>
          <div style={{ overflow: "auto", width: 330 }}>
            <ConfigListSurface groups={groups} />
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            <ConfigContentSurface groups={groups} />
          </div>
          {/* The CONTEXT pane through the PRODUCTION resolve (#866 S3): the section definition's `tabs`
              context — the teacher — rendered by the same `SectionContextHost` the shell mounts, so the
              band, the foot rail and the tab bodies are the real bracket, never a hand-assembled pair (a
              CT fixture hand-authoring a state the shell can't produce ratifies nothing). */}
          <div data-slot="ct-config-context-pane" style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "auto", width: 360 }}>
            <SectionContextHost definition={makeConfigSection(groups)} />
          </div>
        </div>
      </CtRealConfigSectionRegistry>
    </CtDataProviders>
  );
}

/** The ⌘K palette with the SETTINGS source over the REAL group registry (§3.3 — one index, two hosts). The
 *  bind is the door's own delivery, performed here exactly as `compose/authed-app.tsx` performs it. */
export function ConfigPaletteStory(): ReactElement {
  bindConfigPaletteGroups(realConfigGroups);
  const registry = createContributorRegistry<CommandPaletteSource>("command-palette-sources", [configPaletteSource]);
  return (
    <CtDataProviders>
      <CtRealConfigSectionRegistry>
        <CommandPaletteSourceRegistryProvider value={registry}>
          <div style={{ height: 480, width: 560 }}>
            <CommandPaletteSurface goToSections={[]} />
          </div>
        </CommandPaletteSourceRegistryProvider>
      </CtRealConfigSectionRegistry>
    </CtDataProviders>
  );
}

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

// Story module for the app-shell CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// The stories compose the shell through its FRONT DOOR (@orb/client/features/app-shell) with plain
// text content in the section slots, and the Rail leaf via a relative package path (a story may reach
// feature internals the front door doesn't re-export).
//
// DATA PROVIDERS (Query + tRPC): required since AppShell reads the synced density pref via
// `useDensity` (a non-suspense `useQuery(settings.getUserSettings)` — the §11.0 sanctioned cross-cutting
// display read). The query is UNSTUBBED here (no backend in CT): the hook is designed to degrade — a
// pending/errored read falls back to `DEFAULT_APPEARANCE_SETTINGS.density`, so the shell renders
// immediately with the default density and never suspends. Without the provider AppShell throws
// "No QueryClient set" and renders nothing (the beforeMount chrome only stacks Toast/Tooltip/Theme).
// The Rail leaf alone needs no data layer (RailStory stays bare).
//
// SHELL.CSS (L6/J12): the rail is now ONE DOM list that shell.css's `@media` reflows — the desktop icon
// column vs the mobile bottom tab bar — with `[data-mobile="sheet"]` entries + the desktop-only chrome
// hidden (`display:none`, which also removes them from the a11y tree). AppShell imports shell.css itself,
// but the bare RailStory does not, so import it HERE too — otherwise the reflow rules are absent and the
// desktop label spans render inline (doubling each section's visible text). At the CT's desktop viewport
// (1280px > 48rem) the desktop icon column shows, matching production.

import { AppShell, YouSheet } from "@orb/client/features/app-shell";
import type { ResolvedContextTab } from "@orb/client/lib";
import { createContributorRegistry, defineContextTabs, VOID_STATE } from "@orb/client/lib";
import type { ChromeEntry, SectionDefinition, SectionId } from "@orb/client/state";
import { ChromeRegistryProvider } from "@orb/client/state";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Crown, Drama, Eye, Flag, FlaskConical, Gauge, MessagesSquare, Settings, Users } from "@orb/ui/icons";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";
import { ContextTabsPanel } from "../../../../packages/client/src/features/app-shell/components/context-tabs-panel";
import { CustomThemeStyle } from "../../../../packages/client/src/features/app-shell/components/custom-theme-style";
import { Rail } from "../../../../packages/client/src/features/app-shell/components/rail";
import { SectionContextHeader } from "../../../../packages/client/src/features/app-shell/components/section-context-host";
import "../../../../packages/client/src/features/app-shell/surfaces/shell.css";
import type { ModalSlotId } from "../../../../packages/client/src/state/shell-store";
import { openModal, setActiveSection, useActiveSection } from "../../../../packages/client/src/state/shell-store";
import "../../../../packages/client/src/styles/globals.css";
import {
  CtDataProviders,
  CtFakeModalRegistry,
  CtFakeSectionRegistry,
  CtRealSectionRegistry,
  CtStandInChromeRegistry,
} from "../../../support/ct/ct-data-providers";

/** Lands the shell on a section before the assertions run. The BORN default is now `home` (owner
 *  decision H1 = D-1), but most shell CTs are about the FRAME's mechanics over a section that has panes —
 *  so they say which section they mean instead of leaning on whatever the default happens to be. The
 *  default-lands-on-home fact has its own assertions (shell-store.ct.tsx + app-root.ct.tsx). */
function LandOn({ section }: { readonly section: SectionId }): null {
  useEffect(() => {
    setActiveSection(section);
  }, [section]);
  return null;
}

/** The full shell with chats CONTENT+CONTEXT slots + a corpus LIST/CONTENT slot; other sections fall
 *  back. The chats `context` slot backs the CONTEXT-follows-section CT (§4.2 rule 1). */
export function AppShellStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry
        sections={{
          chats: {
            content: <p>chats content pane</p>,
            context: <p>chats context pane</p>,
          },
          // Characters is a mobile-bar tab (Home · Chats · Characters · You after the H2 curation), so it
          // carries real content for the bar-navigation CT.
          characters: { content: <p>characters content pane</p> },
          corpus: { list: <p>corpus list pane</p>, content: <p>corpus content pane</p> },
        }}
      >
        <LandOn section="chats" />
        {/* The real "You" bottom-sheet body arrives via the modal registry (CtFakeSectionRegistry nests
            the real modal registry), so the mobile CT exercises the real sheet, not a placeholder. */}
        <AppShell />
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** `AppShellStory` + a `--width-shell-content`-capped probe in the chats CONTENT slot (the SAME
 *  `max-w-(--width-shell-content)` utility `chat-landing-surface.tsx`/`composer.tsx` use — real
 *  production wiring, not a re-implementation of the clamp formula) — for asserting the §11.1
 *  chatWidthPct root var reaches a real rendered `max-width`, not just the CSS custom property string. */
export function AppShellWidthProbeStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry
        sections={{
          chats: {
            content: (
              <div style={{ width: "100%" }}>
                <div className="w-full max-w-(--width-shell-content)" data-testid="width-probe" />
              </div>
            ),
          },
        }}
      >
        <LandOn section="chats" />
        <AppShell />
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** Opens ONE modal id (via the store action) over the shell with a DELIBERATELY TALL body injected, so
 *  the no-window-scroll invariant CT can assert the DOCUMENT never scrolls (the shell-tier html/body
 *  `overflow: clip` lock + globals.css imported here) while the modal's own region absorbs the overflow.
 *  Registry-driven: the CT loops MODAL_SLOT_IDS, so a NEW modal is covered for free (registry-pairing
 *  keystone spirit). The tall body uses an inline height (a test story is not a compose-only feature). */
export function ModalScrollStory({ modalId }: { readonly modalId: ModalSlotId }): ReactElement {
  useEffect(() => {
    openModal(modalId);
  }, [modalId]);
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry sections={{ chats: { content: <p>chats content pane</p> } }}>
        <LandOn section="chats" />
        {/* A fake modal registry injects a deliberately-tall body for every id (the inner provider wins
            over CtFakeSectionRegistry's real one), so the scroll invariant is exercised per placement.
            `flexShrink: 0` so the drawer's flex-column scroll region can't shrink this EMPTY probe to fit
            (real drawer content has intrinsic height that resists shrink; an empty div would not) — we
            want it to genuinely overflow so the scroll assertion measures a real scroll region. */}
        <CtFakeModalRegistry body={(): ReactElement => <div data-testid="tall-modal-body" style={{ height: 3000, flexShrink: 0 }} />}>
          <AppShell />
        </CtFakeModalRegistry>
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** A real `FileDropzone` inside the shell's chats CONTENT slot + a marker for what it imported — the
 *  stray-drop guard's counter-arm: the guard must swallow a drop that misses this zone while a drop ON it
 *  still imports. The zone is the production primitive, so the guard is tested against the real
 *  preventDefault behaviour it has to stay out of the way of. */
function DropZonePane(): ReactElement {
  const [imported, setImported] = useState<readonly string[]>([]);
  return (
    <div>
      <p>chats content pane</p>
      <FileDropzone multiple={true} instructions="Drop cards here" onFilesSelected={(result): void => setImported(result.accepted.map((file) => file.name))} />
      <p data-testid="imported">{imported.join(",")}</p>
    </div>
  );
}

/** The shell with a real import zone in CONTENT — for the stray-file-drop guard CT (both arms). */
export function AppShellDropGuardStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry sections={{ chats: { content: <DropZonePane /> } }}>
        <LandOn section="chats" />
        <AppShell />
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** The Rail in isolation — a11y + keyboard nav over real <button>s, registry-driven. The persona identity
 *  is now a `rail.end` chrome widget (`personaChrome`, §E-6, no more `railFoot` prop); `CtStandInChromeRegistry`
 *  swaps a bare "Account" button for its data-backed body so the footer-slot a11y baseline stays covered
 *  without pulling the persona feature (and its queries) into this dataless mount. */
export function RailStory(): ReactElement {
  return (
    <CtFakeSectionRegistry>
      <CtStandInChromeRegistry>
        <Rail activeSection="chats" onSelectSection={(): void => undefined} onOpenModal={(): void => undefined} />
      </CtStandInChromeRegistry>
    </CtFakeSectionRegistry>
  );
}

/** The Rail with the BRAND cell ACTIVE (home-section-spec §4.1) — the glyph is home's rail affordance, so
 *  it must carry `aria-current="page"` when home is the active section, exactly as any rail button does. */
export function RailBrandActiveStory(): ReactElement {
  return (
    <CtFakeSectionRegistry>
      <CtStandInChromeRegistry>
        <Rail activeSection="home" onSelectSection={(): void => undefined} onOpenModal={(): void => undefined} />
      </CtStandInChromeRegistry>
    </CtFakeSectionRegistry>
  );
}

/** The Rail wired to the REAL `setActiveSection` + a probe of the shell store — so the glyph CT asserts
 *  the STORE ACTION FIRED, never a rendered echo. */
export function RailBrandNavStory(): ReactElement {
  return (
    <CtFakeSectionRegistry>
      <CtStandInChromeRegistry>
        <LandOn section="chats" />
        <RailWithStore />
      </CtStandInChromeRegistry>
    </CtFakeSectionRegistry>
  );
}

function RailWithStore(): ReactElement {
  const activeSection = useActiveSection();
  return (
    <>
      <output>section={activeSection}</output>
      <Rail activeSection={activeSection} onSelectSection={setActiveSection} onOpenModal={openModal} />
    </>
  );
}

/** The REAL shell landed on a caller-chosen section (real registry) — for the LIST-pane CAPABILITY CT
 *  (home declares `panels.list = "unavailable"`, so its topbar renders NO list toggle; chats still does). */
export function AppShellOnSectionStory({ section }: { readonly section: SectionId }): ReactElement {
  useEffect(() => {
    setActiveSection(section);
  }, [section]);
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <AppShell />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The YouSheet projection in isolation (§E-5): a custom chrome registry with a fake `rail.end` widget
 *  whose `body("sheet")` renders a marker + a `mobile:"sheet"` overflow section — proof the sheet is a
 *  BLIND PROJECTION over the resolved chrome list (a widget's sheet lens + an overflow section both appear),
 *  not a second hand-maintained derivation. */
export function YouSheetProjectionStory(): ReactElement {
  const chrome = createContributorRegistry<ChromeEntry>("chrome", [
    {
      id: "fake-identity",
      label: "Fake identity",
      zone: "rail.end",
      mobile: "sheet",
      behavior: { kind: "widget", body: (presentation): ReactElement => <div data-testid="sheet-lens">lens:{presentation}</div> },
    },
    {
      id: "fake-overflow",
      label: "Fake overflow section",
      zone: "rail.nav",
      mobile: "sheet",
      order: 0,
      behavior: { kind: "section", sectionId: "analytics" },
    },
  ]);
  return (
    <ChromeRegistryProvider value={chrome}>
      <YouSheet />
    </ChromeRegistryProvider>
  );
}

/** A minimal fake SectionDefinition for exercising `SectionContextHeader` (N4) in isolation — real
 *  rail/placeholder vocabulary, a caller-supplied `context` arm. */
function fakeHeaderSection(context: SectionDefinition["context"]): SectionDefinition {
  return {
    id: "chats",
    rail: { label: "Chats", icon: MessagesSquare, group: "primary", mobile: "tab" },
    panelDefaults: { list: "docked", context: "docked" },
    placeholder: { title: "Chats", description: "Fake section for the header-channel CT." },
    content: { planned: "ct" },
    context,
  };
}

// Minted at MODULE scope (like every production section) so `useResolved` has a stable identity.
const FAKE_HEADER_CONTEXT = defineContextTabs<void>({
  useContextState: () => VOID_STATE,
  tabs: [{ id: "t", label: "T", body: (): ReactNode => null }],
  header: (): ReactNode => <span>Fake identity</span>,
});

/** The definition-owned CONTEXT header channel (N4): a fake section mints a `header` through
 *  `defineContextTabs`; `SectionContextHeader` renders it blind in the band (no per-section switch). */
export function SectionContextHeaderChannelStory(): ReactElement {
  return (
    <CtDataProviders>
      <SectionContextHeader definition={fakeHeaderSection(FAKE_HEADER_CONTEXT)} />
    </CtDataProviders>
  );
}

/** A section supplying NO header (a `none` context) falls back to the neutral "Details" band label. */
export function SectionContextHeaderDefaultStory(): ReactElement {
  return (
    <CtDataProviders>
      <SectionContextHeader definition={fakeHeaderSection({ kind: "none" })} />
    </CtDataProviders>
  );
}

// ── The container-responsive CONTEXT tab strip (context-tabs-panel.tsx, CP-1) ───────────────────────
// Mounts the real ContextTabsPanel inside a FIXED-width container the `.ct.tsx` sets, so the shell.css
// `.ctx-tab-strip` @container query resolves against a known width — narrow ⇒ icon-mode (labels hidden,
// no clip), wide ⇒ label-mode (words shown). Proves both forms render + the accessible NAME survives in
// BOTH (aria-label). A `showTrackers` flag adds the 5th tab (the Trackers-ceiling headroom pin); a fake
// icon-LESS contributor tab proves an icon-less tab keeps its word unconditionally (never a nameless tab).

/** A resolved-tab builder that fills the §4.11 defaults (strip "meta", no badge, enabled) so a story only
 *  spells the axis it exercises — mirrors `resolveContextTabs`'s own defaulting. */
function resolvedTab(partial: Partial<ResolvedContextTab> & Pick<ResolvedContextTab, "id" | "label" | "node">): ResolvedContextTab {
  return { strip: "meta", badge: null, disabledReason: null, defaultTab: false, ...partial };
}

const CTX_STRIP_TABS: readonly ResolvedContextTab[] = [
  resolvedTab({ id: "members", label: "Members", icon: Users, node: <div data-testid="ctx-body-members">members</div> }),
  resolvedTab({ id: "settings", label: "Settings", icon: Settings, node: <div>settings</div> }),
  resolvedTab({ id: "preview", label: "Preview", icon: Eye, node: <div>preview</div> }),
  resolvedTab({ id: "injections", label: "Injections", icon: FlaskConical, node: <div>injections</div> }),
];
const CTX_TRACKERS_TAB: ResolvedContextTab = resolvedTab({ id: "trackers", label: "Trackers", icon: MessagesSquare, node: <div>trackers</div> });
// A contributor that set NO icon — must keep its word label at every container width (can't compress).
const CTX_ICONLESS_TAB: ResolvedContextTab = resolvedTab({ id: "iconless", label: "Iconless", node: <div>iconless</div> });

export interface ContextTabStripStoryProps {
  /** The container width (px) the strip's @container resolves against. */
  readonly width: number;
  /** Add the 5th (Trackers) tab — the CP-1 ceiling headroom pin. @defaultValue false */
  readonly showTrackers?: boolean;
  /** Append an icon-LESS tab — proves it keeps its word unconditionally. @defaultValue false */
  readonly withIconless?: boolean;
}

export function ContextTabStripStory({ width, showTrackers = false, withIconless = false }: ContextTabStripStoryProps): ReactElement {
  const tabs: ResolvedContextTab[] = [...CTX_STRIP_TABS];
  if (showTrackers) {
    tabs.push(CTX_TRACKERS_TAB);
  }
  if (withIconless) {
    tabs.push(CTX_ICONLESS_TAB);
  }
  return (
    <div style={{ width }} data-testid="ctx-strip-container">
      <ContextTabsPanel tabs={tabs} />
    </div>
  );
}

// ── The two-strip bracket (context-tabs-panel.tsx, Context-Panel-Program §4.2/§4.6 — W3a) ────────────
// A synthetic GAME+META tab set proves the generic bracket: two `.ctx-tab-strip` TabsLists (one root, one
// selection crossing both), the §4.6 badge (dot + count, never on the active tab), and the §4.6 PHASE
// disable-with-reason (aria-disabled + title, focusable-discoverable). No rpg import — the mechanism is
// generic (W3b/W3c graft the real rpg tabs). A meta-only variant re-proves the single-strip backward-compat.

const CTX_BRACKET_TABS: readonly ResolvedContextTab[] = [
  // GAME strip (state, above the viewport).
  resolvedTab({ id: "rpg.status", label: "Status", icon: Gauge, node: <div data-testid="ctx-body-status">status</div>, strip: "game" }),
  // A game tab carrying a boolean badge (the 6px changed-dot).
  resolvedTab({ id: "rpg.scene", label: "Scene", icon: Drama, node: <div data-testid="ctx-body-scene">scene</div>, strip: "game", badge: true }),
  // A game tab carrying a COUNT badge (pending-proposals idiom).
  resolvedTab({ id: "rpg.game", label: "Game", icon: Crown, node: <div data-testid="ctx-body-game">game</div>, strip: "game", badge: 3 }),
  // A PHASE-disabled game tab (the OSRS locked-tab pattern — the Map/MA-3 shape).
  resolvedTab({
    id: "rpg.map",
    label: "Map",
    icon: Flag,
    node: <div data-testid="ctx-body-map">map</div>,
    strip: "game",
    disabledReason: "Maps unlock with the map arc (MA-3)",
  }),
  // META strip (administration, below the viewport).
  resolvedTab({ id: "members", label: "Members", icon: Users, node: <div data-testid="ctx-body-members">members</div>, strip: "meta" }),
  resolvedTab({ id: "settings", label: "Settings", icon: Settings, node: <div data-testid="ctx-body-settings">settings</div>, strip: "meta" }),
];

/** The bracket at a fixed width — two strips, one selection, badges + a disabled tab. */
export function ContextBracketStory({ width = 291 }: { readonly width?: number }): ReactElement {
  return (
    <div style={{ width }} data-testid="ctx-strip-container">
      <ContextTabsPanel tabs={CTX_BRACKET_TABS} />
    </div>
  );
}

// A production-shaped game set: the META `members` tab is FIRST in declared order (chat's own tab, before
// the rpg contributor game tabs), and `rpg.status` carries the §4.1 `defaultTab` flag. This is exactly the
// shape that regresses without the flag — a fresh panel (no stored contextTab) would land on `members`.
const CTX_DEFAULT_TAB_TABS: readonly ResolvedContextTab[] = [
  resolvedTab({ id: "members", label: "Members", icon: Users, node: <div data-testid="ctx-body-members">members</div>, strip: "meta" }),
  resolvedTab({ id: "rpg.status", label: "Status", icon: Gauge, node: <div data-testid="ctx-body-status">status</div>, strip: "game", defaultTab: true }),
  resolvedTab({ id: "rpg.scene", label: "Scene", icon: Drama, node: <div data-testid="ctx-body-scene">scene</div>, strip: "game" }),
];

/** The §4.1 preferred-default landing: `members` is the declared-order first, but `rpg.status` flags
 *  `defaultTab`, so a fresh panel (no stored contextTab) must land on Status, not Members. */
export function ContextDefaultTabStory({ width = 291 }: { readonly width?: number }): ReactElement {
  return (
    <div style={{ width }} data-testid="ctx-strip-container">
      <ContextTabsPanel tabs={CTX_DEFAULT_TAB_TABS} />
    </div>
  );
}

/** CustomThemeStyle in isolation — the owner's custom-CSS injection (Layer 1). The css prop is injected
 *  unlayered + last-in-<head>; the probes prove it wins: `.shell-rail` (shell.css already styles it) and
 *  `.bg-primary` (a `@layer utilities` class reading `var(--color-primary)`, which a `:root` redefine in
 *  the injected CSS overrides). */
export function CustomThemeStyleStory({ css }: { readonly css: string }): ReactElement {
  return (
    <div>
      <CustomThemeStyle css={css} />
      <div className="shell-rail" data-testid="rail-probe" style={{ width: 20, height: 20 }} />
      <div className="bg-primary" data-testid="primary-probe" style={{ width: 20, height: 20 }} />
    </div>
  );
}

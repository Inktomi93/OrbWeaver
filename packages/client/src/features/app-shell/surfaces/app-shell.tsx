// AppShell — the four-region rail frame (UI-Arch §4.1): RAIL | LIST | CONTENT | CONTEXT. The shell
// tier — the ONE viewport-@media site (§4b axis 2) and the ONE compose-only-exempt painter (it paints
// the FRAME: raw grid/panel elements + token utilities are legal HERE, per §11.0). All the layout
// MECHANICS live in shell.css: the CSS-grid tracks, the §11.1 clamp-overlay (a panel's data-panel-mode
// drives docked/overlay/collapsed — a collapsed panel is `-translate-x-full`, zero width, no reflow),
// and the one @media (desktop columns ⇄ mobile top-bar + sheets). This file wires store → data attrs.
//
// DOMAIN-AGNOSTIC (the seam): AppShell knows RAIL/LIST/CONTENT/CONTEXT, never `Chat`/`Character`. It
// accepts a `sections` slot map keyed by SectionId; the ROUTE (home-page.tsx) composes the chat into
// the `chats` CONTENT slot (route→feature is legal; feature→feature is not). An unwired section falls
// back to an honest <SectionPlaceholder>, never a fabricated surface. The `header`/`contextHeader`
// ReactNode slots (UIP-202/204) are route-composed too — the topbar identity + the CONTEXT detail
// header are domain data the ROUTE supplies; the shell only forwards the node (falls back to the
// section name / "Details").

import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { ModalSlotId, SectionId } from "#state";
import { closeModal, openModal, setActiveSection } from "#state";
import { RegionAnchor } from "../anchors/region-anchor";
import { CustomThemeStyle } from "../components/custom-theme-style";
import { ModalHost } from "../components/modal-host";
import { PanelChrome } from "../components/panel-chrome";
import { Rail } from "../components/rail";
import { SectionPlaceholder } from "../components/section-placeholder";
import { ShellTopbar } from "../components/shell-topbar";
import { ThemeBackgroundLayer } from "../components/theme-background-layer";
import { useAppearance } from "../hooks/use-appearance";
import { useAppearanceRootEffects } from "../hooks/use-appearance-root-effects";
import { useSelectedTheme } from "../hooks/use-selected-theme";
import { useShellLayout } from "../hooks/use-shell-layout";
import { resolveBackgroundUrl } from "../lib/resolve-theme-background";
import { SECTION_PLACEHOLDER_COPY } from "../lib/section-placeholder-copy";
import "./shell.css";

/** A section's content for the two slots it can fill: the LIST panel and the CONTENT hero. */
export interface SectionSlot {
  readonly list?: ReactNode;
  readonly content?: ReactNode;
}

export interface AppShellProps {
  /** Per-section slots. Only `chats.content` is wired today (the chat pane); the rest fall back. */
  readonly sections: Partial<Record<SectionId, SectionSlot>>;
  /** Route-composed topbar identity header (UIP-202) — the active chat's avatar + title. Undefined ⇒
   *  the topbar shows the active section name (the draft/none fallback). */
  readonly header?: ReactNode;
  /** The CONTEXT (right detail) panel body — undefined today (no entity-detail surface wired yet). */
  readonly contextPanel?: ReactNode;
  /** Route-composed CONTEXT panel header (UIP-204) — the active entity's detail header. Undefined ⇒
   *  the "Details" fallback. */
  readonly contextHeader?: ReactNode;
  /** Route-composed modal bodies (id-keyed), rendered over the `MODAL_SLOTS` placeholders. The shell
   *  stays domain-agnostic: it forwards a ReactNode slot, never importing a feature (§4.1). */
  readonly modals?: Partial<Record<ModalSlotId, ReactNode>>;
}

export function AppShell({
  sections,
  header,
  contextPanel,
  contextHeader,
  modals,
}: AppShellProps): ReactElement {
  const layout = useShellLayout();
  // The synced appearance prefs + the resolved active theme (D44 §12.1). All display axes stamp from
  // these; the shell degrades to defaults (never suspends) if unauth/pending.
  const appearance = useAppearance();
  // Layer 1 — the viewer's OWN global theme (fetched for THIS user only; never pushed to other viewers).
  const theme = useSelectedTheme();
  // A SEED palette also stamps [data-theme] on <html> (full-palette + color-scheme reflow, portals
  // included); a custom/Hearth theme uses none and layers its override on the Hearth base via ThemeScope.
  const dataTheme = theme?.isSeed === true ? theme.name.toLowerCase() : null;
  useAppearanceRootEffects({
    fontScale: appearance.fontScale,
    dataTheme,
    blurSurfaces: appearance.blurSurfaces,
    shadowEffects: appearance.shadowEffects,
  });
  // The theme's optional density/chatStyle WIN over the appearance base (themes-design §3.4 overlap LEAN);
  // resolve density here (shell.css consumes data-density). A compact override tightens spacing tokens
  // for the whole subtree. chatStyle stays appearance-owned at the root (the message render reads it).
  const density = theme?.override.density ?? appearance.density;
  // D63 (amends D49 §3) — the app background image is now an `appearance` setting (palette-independent),
  // resolved from its flat fields to the URL the dedicated root layer paints.
  const bgUrl = resolveBackgroundUrl(appearance);
  // `.shell-grid`'s own opaque `--color-background` paint must step aside for the image to show through
  // ANYWHERE (gaps + any opted-in glass surface) — gated on the SAME resolved outcome the layer uses.
  const hasBgImage = bgUrl !== null;
  // chatWidthPct → the §11.1 reading-column clamp var (stamped for the thread to consume).
  const shellVars: CSSProperties = {
    "--width-shell-content": `clamp(680px, ${appearance.chatWidthPct}dvw, 100dvw)`,
  } as CSSProperties;
  const slot = sections[layout.activeSection];
  // The active section's distinct placeholder copy (J10 — one home in SECTION_PLACEHOLDER_COPY); the
  // Weave decoration marks it as the sanctioned teaching moment. Route-composed sections (chats/characters)
  // never fall through to these; the three unbuilt hubs (corpus/refinery/analytics) read distinct now.
  const placeholderCopy = SECTION_PLACEHOLDER_COPY[layout.activeSection];
  // Weave rides the CONTENT placeholder only (DESIGN.md: at most ONE Weave per screen) — the LIST
  // placeholder keeps the muted sparkle so a user-docked LIST never paints a second glyph.
  const listContent = slot?.list ?? <SectionPlaceholder title={`${placeholderCopy.title} list`} />;
  const content = slot?.content ?? (
    <SectionPlaceholder
      title={placeholderCopy.title}
      description={placeholderCopy.description}
      weave={true}
    />
  );

  // Dismiss whichever panel is floating (desktop overlay OR a mobile sheet — both resolve to "overlay").
  // Routed through the mobile-aware `collapsePanel` so a tap on the scrim closes the mobile sheet too.
  const dismissOverlays = (): void => {
    if (layout.listMode === "overlay") {
      layout.collapsePanel("list");
    }
    if (layout.contextMode === "overlay") {
      layout.collapsePanel("context");
    }
  };

  return (
    <TooltipProvider>
      {/* D49 §3 — the fixed-position background-image root layer, mounted OUTSIDE `<ThemeScope>` (a
          nested per-speaker scope must never spawn a second one) and BEFORE `.shell-grid` in DOM order
          so it paints underneath (shell-grid's own `isolation:isolate` stacking context wins by
          source order, not z-index). Renders nothing when no image is set. */}
      <ThemeBackgroundLayer
        url={bgUrl}
        fit={appearance.backgroundFit}
        dim={appearance.backgroundDim}
      />
      {/* Layer 1 — the viewer's own theme override, applied at the app root via the ONE sanctioned path
          (<ThemeScope>, which clamps every value). `display:contents` so it adds no box: custom
          properties still inherit down to the shell. A seed's full palette rides [data-theme] on <html>
          (above); this scope carries the RP subset + the derived neutral ramp for custom themes. */}
      <ThemeScope tokens={theme?.override ?? {}} className="contents">
        <div
          className="shell-grid"
          data-list-mode={layout.listMode}
          data-context-mode={layout.contextMode}
          data-density={density}
          data-elevation={appearance.elevation}
          data-reduced-motion={appearance.reducedMotion}
          {...(hasBgImage ? { "data-has-bg-image": true } : {})}
          style={shellVars}
        >
          {/* Layer 1 (cont.) — the owner's custom CSS, injected unlayered + last so it wins. Own-client only. */}
          <CustomThemeStyle css={theme?.css ?? null} />
          <Rail
            activeSection={layout.activeSection}
            onSelectSection={setActiveSection}
            onOpenModal={openModal}
          />

          {/* LIST panel — no PanelChrome header (UIP-202): the list surface owns its title, the topbar
            toggle owns the collapse. */}
          <PanelChrome panel="list" label={layout.activeSectionLabel} mode={layout.listMode}>
            <RegionAnchor region="list">{listContent}</RegionAnchor>
          </PanelChrome>

          <div className="shell-main">
            <ShellTopbar
              title={layout.activeSectionLabel}
              header={header}
              listMode={layout.listMode}
              contextMode={layout.contextMode}
              immersive={layout.immersive}
              onToggleList={(): void => layout.togglePanel("list")}
              onToggleContext={(): void => layout.togglePanel("context")}
              onToggleFocus={layout.toggleFocus}
              onOpenCommand={(): void => openModal("command")}
            />
            {/* CONTENT is the ONE `main` landmark (a11y + Playwright/agent nav: "jump to main",
              `getByRole("main")`) — the topbar banner is its sibling, never inside it. */}
            <main className="shell-content">
              <RegionAnchor region="content">{content}</RegionAnchor>
            </main>
          </div>

          <PanelChrome
            panel="context"
            label="Details"
            header={
              contextHeader ?? (
                <Text size="label" weight="medium" tone="muted">
                  Details
                </Text>
              )
            }
            collapseLabel="Collapse detail panel"
            mode={layout.contextMode}
            onCollapse={(): void => layout.collapsePanel("context")}
          >
            <RegionAnchor region="context">
              {contextPanel ?? (
                <SectionPlaceholder
                  title="Details"
                  description="Select something to see its details here."
                  weave={true}
                />
              )}
            </RegionAnchor>
          </PanelChrome>

          {layout.scrimVisible ? (
            <button
              type="button"
              className="shell-scrim"
              aria-label="Dismiss panel"
              onClick={dismissOverlays}
            />
          ) : null}

          <ModalHost openModal={layout.openModalId} modals={modals} onClose={closeModal} />
        </div>
      </ThemeScope>
    </TooltipProvider>
  );
}

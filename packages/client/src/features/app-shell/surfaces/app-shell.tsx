// AppShell — the four-region rail frame: RAIL | LIST | CONTENT | CONTEXT. Layout mechanics live in
// shell.css; this file wires store state to data attrs. Domain-agnostic: it knows RAIL/LIST/CONTENT/
// CONTEXT, never a specific feature — sections ride the registry (`useSectionRegistry`), assembled at
// the main.tsx door.

import { Button } from "@orb/ui/button";
import { Kbd } from "@orb/ui/kbd";
import { PortalContainerContext } from "@orb/ui/lib";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "@orb/ui/tooltip";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { preload } from "react-dom";
import type { ChromeEntry, ModalSlotId, SectionId } from "#state";
import { closeModal, openModal, setActiveSection, useChromeRegistry, useModalRegistry, useSectionRegistry } from "#state";
import { RegionAnchor } from "../anchors/region-anchor.tsx";
import { CustomThemeStyle } from "../components/custom-theme-style.tsx";
import { ModalHost } from "../components/modal-host.tsx";
import { PanelChrome } from "../components/panel-chrome.tsx";
import { Rail } from "../components/rail.tsx";
import { SectionContent } from "../components/section-content.tsx";
import { SectionContextHeader, SectionContextHost } from "../components/section-context-host.tsx";
import { SectionPlaceholder } from "../components/section-placeholder.tsx";
import { SectionTopbarTitle } from "../components/section-topbar-title.tsx";
import { ShellTopbar } from "../components/shell-topbar.tsx";
import { ThemeBackgroundLayer } from "../components/theme-background-layer.tsx";
import { ThemeBackgroundVideoLayer } from "../components/theme-background-video-layer.tsx";
import { useAppearance } from "../hooks/use-appearance.ts";
import { useAppearanceRootEffects } from "../hooks/use-appearance-root-effects.ts";
import { useChatBackground } from "../hooks/use-chat-background.ts";
import { useSelectedTheme } from "../hooks/use-selected-theme.ts";
import type { ShellLayout } from "../hooks/use-shell-layout.ts";
import { useShellLayout } from "../hooks/use-shell-layout.ts";
import { useStrayFileDropGuard } from "../hooks/use-stray-file-drop-guard.ts";
import { appearanceBackgroundSource, resolveThemeBackgroundUrl } from "../lib/resolve-theme-background.ts";
import { resolveThemeScopeTokens } from "../lib/resolve-theme-scope-tokens.ts";
import "./shell.css";

/** Collapse whichever panels are currently AUTO-OVERLAYS (the scrim's dismiss, shared by its click and the
 *  Escape key). Module-scope + `layout`-taking so it is never an effect dependency (D54: no manual memo). */
function dismissOverlays(layout: ShellLayout): void {
  if (layout.listMode === "overlay") {
    layout.collapsePanel("list");
  }
  if (layout.contextMode === "overlay") {
    layout.collapsePanel("context");
  }
}

/** Renders the `topbar.trail` zone's chrome widgets — the registry list is frozen at the door, so
 *  calling each entry's `useVisible` unconditionally, in a fixed loop, is legal (the `contentBySection`
 *  precedent). `false` ⇒ render NOTHING (no gap — preserves the bell's no-flash rule). */
function TopbarTrailChrome({ mobile }: { readonly mobile: boolean }): ReactElement {
  const chrome = useChromeRegistry();
  // The per-zone order is owned by assembleChrome (canonical `(order, id)` sort at the door), so this
  // consumer only filters — no re-sort.
  //
  // A phone drops the entries curated `mobile: "sheet"` (the You sheet projects them instead) — the same
  // curation the rail has always obeyed, finally consumed for this zone. That is the topbar BUDGET: at
  // 320px every trail control is 48px of a row whose job is to say where you are (side-eye leg-4 P2).
  const entries = chrome.list().filter((e) => e.zone === "topbar.trail" && !(mobile && e.mobile === "sheet"));
  return (
    <>
      {entries.map((entry) => (
        <TrailWidget key={entry.id} entry={entry} />
      ))}
    </>
  );
}

function TrailWidget({ entry }: { readonly entry: ChromeEntry }): ReactNode {
  const visible = entry.useVisible?.() ?? true;
  // topbar.trail carries only WIDGET entries this wave; modal/section rendering in the trail lands with
  // the §E-3 rail cutover + the ⌘K skin pass.
  if (!visible || entry.behavior.kind !== "widget") {
    return null;
  }
  return entry.behavior.body("bar");
}

/** The rail in the DOM slot its REGIME paints it in (side-eye a11y rec · WCAG 1.3.2 meaningful sequence).
 *  On the desktop it is the leftmost column and must read FIRST; on a phone the SAME rail is the bottom tab
 *  bar, and hearing global navigation before "where am I" is exactly backwards. ONE definition, rendered
 *  from one of two slots — a component rather than a variable so each slot is a literal JSX branch. */
function RailSlot({ show, activeSection }: { readonly show: boolean; readonly activeSection: SectionId }): ReactNode {
  if (!show) {
    return null;
  }
  return <Rail activeSection={activeSection} onSelectSection={setActiveSection} onOpenModal={openModal} />;
}

/** The ⌘K chip — DESKTOP-SHAPED (side-eye P1's budget): a phone has no ⌘K key, and at 320px this chip plus
 *  its divider was ~60px of a row that had none to give. Nothing is lost: the You sheet carries the same
 *  command modal as a named row (you-sheet.tsx), which is where every other overflow affordance lives. */
function CommandChip({ modalId, show }: { readonly modalId: ModalSlotId | undefined; readonly show: boolean }): ReactNode {
  if (!show) {
    return null;
  }
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              intent="secondary"
              size="sm"
              // WCAG 2.5.3 Label in Name (UI-Primitives-and-Reuse §13.10): the button READS "⌘K jump", so
              // "jump" must be in the name — "Command menu" alone made the one word on the button
              // unspeakable. Both vocabularies are carried, stable-first, so
              // `getByRole("button", { name: "Command menu" })` still resolves it.
              aria-label="Jump to… — the command menu"
              onClick={(): void => {
                if (modalId !== undefined) {
                  openModal(modalId);
                }
              }}
            >
              <Kbd>⌘K</Kbd>
              <Text as="span" size="micro" tone="muted" className="shell-topbar-jump-label">
                jump
              </Text>
            </Button>
          }
        />
        <TooltipPopup side="bottom">Jump to…</TooltipPopup>
      </Tooltip>
      <div className="shell-topbar-divider" aria-hidden="true" />
    </>
  );
}

export function AppShell(): ReactElement {
  const registry = useSectionRegistry();
  // The ⌘K affordance opens the single `topbar.trail`-placed modal — derived, never hardcoded.
  const commandModalId = useModalRegistry()
    .list()
    .find((m) => m.trigger.placement === "topbar.trail")?.id;
  const layout = useShellLayout();
  const appearance = useAppearance();
  const theme = useSelectedTheme();
  // Overlays portal to a themed root inside <ThemeScope> instead of <body>, so every float inherits the active theme's tokens.
  const portalRootRef = useRef<HTMLDivElement>(null);
  const dataTheme = theme?.isSeed === true ? theme.name.toLowerCase() : null;
  useAppearanceRootEffects({
    fontScale: appearance.fontScale,
    dataTheme,
    blurSurfaces: appearance.blurSurfaces,
    shadowEffects: appearance.shadowEffects,
    blurStrength: appearance.blurStrength,
    reading: {
      lineHeight: appearance.readingLineHeight,
      letterSpacing: appearance.readingLetterSpacing,
      paragraphSpacing: appearance.readingParagraphSpacing,
      nameScale: appearance.readingNameScale,
      bodyScale: appearance.readingBodyScale,
      justify: appearance.justifyBodyText,
    },
    themeColorization: appearance.enableThemeColorization,
    surfaceTexture: appearance.surfaceTexture,
  });
  // A seed theme paints from its generated [data-theme] block (keyed by `dataTheme` above), NOT its stored
  // override — see resolve-theme-scope-tokens for the shadowing bug this prevents.
  const { tokens: scopeTokens, density } = resolveThemeScopeTokens(theme, appearance.density);
  // BG-C: the active chat's carried background (per-chat > card-carried) wins over the viewer's own appearance
  // ONLY in a true-solo room; `undefined` (any other composition, landing, an unresolved read) ⇒ the viewer's
  // appearance source. fit/dim/blur always stay the viewer's own treatment (source-only carry).
  // A file dropped anywhere but a dropzone would navigate the tab to that file and take the session with it.
  useStrayFileDropGuard();
  const chatBg = useChatBackground();
  const effectiveBg = chatBg ?? appearanceBackgroundSource(appearance);
  const bgUrl = resolveThemeBackgroundUrl(effectiveBg);
  // BG-V: a `video/*` own-upload background renders through the native `<video>` layer, not the image div.
  const bgIsVideo = effectiveBg.kind === "asset" && effectiveBg.mime.startsWith("video/");
  // Warms the fetch during render so ThemeBackgroundLayer paints from cache instead of popping in (image only —
  // `preload(..., {as:'image'})` is wrong for a video source; the <video> element does its own preload).
  if (bgUrl !== null && !bgIsVideo) {
    preload(bgUrl, { as: "image" });
  }
  const hasBgImage = bgUrl !== null;
  const shellVars: CSSProperties = {
    "--width-shell-content": `clamp(680px, ${appearance.chatWidthPct}dvw, 100dvw)`,
  } as CSSProperties;
  const activeDef = registry.get(layout.activeSection);
  const placeholderCopy = activeDef.placeholder;
  // At most one Weave decoration per screen — it rides the content placeholder only.
  // A section that declares NO list pane renders nothing into the (zero-width, toggle-less) track — the
  // "isn't wired yet" placeholder is for a section that HAS a list and hasn't built it (H3 / arm L-b).
  const listContent = activeDef.list?.() ?? (layout.listAvailable ? <SectionPlaceholder title={`${placeholderCopy.title} list`} /> : null);
  // A section that declares NO context pane renders nothing into the (zero-width, toggle-less) track —
  // the LIST twin above. Without this the pane-less front door still built a detail-panel body ("Select
  // something to see its details here") that nothing could ever reach.
  const contextPane = layout.contextAvailable
    ? {
        header: <SectionContextHeader key={layout.activeSection} definition={activeDef} />,
        body: (
          <RegionAnchor region="context">
            <SectionContextHost key={layout.activeSection} definition={activeDef} />
          </RegionAnchor>
        ),
      }
    : { header: null, body: null };
  const contentFallback = <SectionPlaceholder title={placeholderCopy.title} description={placeholderCopy.description} weave={true} />;
  // Every section's content, from the registry, so <Activity> keeps recently-visited panes mounted-but-
  // hidden across a rail switch. The DECLARED-PLANNED arm renders the section's own placeholder as its
  // content (the refinery founding member).
  const contentBySection: Partial<Record<SectionId, ReactNode>> = {};
  for (const def of registry.list()) {
    contentBySection[def.id] =
      typeof def.content === "function" ? (
        def.content()
      ) : (
        <SectionPlaceholder title={def.placeholder.title} description={def.placeholder.description} weave={true} />
      );
  }
  const mainRef = useRef<HTMLElement>(null);

  // Escape dismisses an open narrow/mobile auto-overlay slide-over (the scrim's keyboard equivalent) —
  // but ONLY when no modal is open. An open Dialog/Drawer owns Escape itself (Base UI); stealing it here
  // would race the modal's own close and could double-fire onOpenChange.
  useEffect(() => {
    if (!layout.scrimVisible || layout.openModalId !== null) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        dismissOverlays(layout);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return (): void => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [layout]);

  return (
    <TooltipProvider>
      {/* Mounted before .shell-grid in DOM order so it paints underneath; renders nothing when no image is set. */}
      {bgIsVideo ? (
        <ThemeBackgroundVideoLayer url={bgUrl} fit={appearance.backgroundFit} dim={appearance.backgroundDim} appReducedMotion={appearance.reducedMotion} />
      ) : (
        <ThemeBackgroundLayer url={bgUrl} fit={appearance.backgroundFit} dim={appearance.backgroundDim} blur={appearance.backgroundBlur} />
      )}
      <ThemeScope tokens={scopeTokens} className="contents">
        <PortalContainerContext value={portalRootRef}>
          <div
            className="shell-grid"
            data-section={layout.activeSection}
            data-list-mode={layout.listMode}
            data-context-mode={layout.contextMode}
            data-focus-mode={layout.focusMode}
            data-density={density}
            data-elevation={appearance.elevation}
            data-reduced-motion={appearance.reducedMotion}
            {...(hasBgImage ? { "data-has-bg-image": true } : {})}
            style={shellVars}
          >
            <CustomThemeStyle css={theme?.css ?? null} />
            <RailSlot activeSection={layout.activeSection} show={!layout.mobileViewport} />

            <PanelChrome panel="list" label={`${layout.activeSectionLabel} list`} header={activeDef.listHeader?.()} mode={layout.listMode}>
              <RegionAnchor region="list">{listContent}</RegionAnchor>
            </PanelChrome>

            <div className="shell-main">
              {/* KEYED on the active section: `useSelectionTitle` is a per-section hook, so the component
                  that calls it must remount when the section does (the SectionContextHost idiom). */}
              <SectionTopbarTitle key={layout.activeSection} definition={activeDef} fallback={layout.activeSectionLabel}>
                {(compactTitle): ReactElement => (
                  <ShellTopbar
                    screenTitle={compactTitle}
                    title={layout.activeSectionLabel}
                    header={activeDef.header?.()}
                    trail={
                      <>
                        <CommandChip modalId={commandModalId} show={!layout.mobileViewport} />
                        <TopbarTrailChrome mobile={layout.mobileViewport} />
                      </>
                    }
                    listAvailable={layout.listAvailable}
                    listMode={layout.listMode}
                    onToggleList={(): void => layout.togglePanel("list")}
                    // The mobile ONE-SHELL rule's back row. The label is DERIVED from the section's own rail
                    // label ("Back to Configuration", the mock's own words), so it cannot drift per section and
                    // no section authors a second vocabulary for it.
                    onBack={layout.backToList}
                    backLabel={`Back to ${layout.activeSectionLabel}`}
                  />
                )}
              </SectionTopbarTitle>
              {/* A11y (side-eye R3): the scroll container is tabbable, so name it from the active section's
                  visible label — the `main` landmark otherwise announces as an unnamed region.
                  INERT BEHIND AN OPEN SHEET (item 22): whenever the scrim is up it already swallows every
                  pointer event aimed at this column, but a keyboard user could still Tab into controls
                  behind the sheet and act on a surface they cannot see — the pointer and the keyboard have
                  to agree (the house Dialog/Drawer inert their background for exactly this reason). Scoped
                  to the CONTENT column, not the whole frame, because the sheet's own close control is the
                  topbar toggle ABOVE the scrim: inerting the frame would strand the user in it. */}
              <main
                className="shell-content"
                ref={mainRef}
                tabIndex={-1}
                aria-label={`${layout.activeSectionLabel} content`}
                // …and the SAME rule for the mobile LIST-as-screen, which carries no scrim but is still a
                // full-viewport pane over this column (`contentInert` folds both — one flag, one truth).
                inert={layout.contentInert}
              >
                <SectionContent activeSection={layout.activeSection} contentBySection={contentBySection} fallback={contentFallback} focusAnchorRef={mainRef} />
              </main>
            </div>

            <PanelChrome panel="context" label={`${layout.activeSectionLabel} details`} header={contextPane.header} mode={layout.contextMode}>
              {contextPane.body}
            </PanelChrome>

            <RailSlot activeSection={layout.activeSection} show={layout.mobileViewport} />

            {/* Stays mounted and fades via data-visible so it fades WITH the panel instead of hard-cutting on close. */}
            <button
              type="button"
              className="shell-scrim"
              data-visible={layout.scrimVisible}
              aria-hidden={!layout.scrimVisible}
              tabIndex={layout.scrimVisible ? 0 : -1}
              aria-label="Dismiss panel"
              onClick={(): void => dismissOverlays(layout)}
            />

            <ModalHost openModal={layout.openModalId} container={portalRootRef} onClose={closeModal} />
          </div>
          {/* Themed portal root for every overlay — sibling of .shell-grid but inside <ThemeScope>. */}
          <div ref={portalRootRef} className="contents" data-slot="portal-root" />
        </PortalContainerContext>
      </ThemeScope>
    </TooltipProvider>
  );
}

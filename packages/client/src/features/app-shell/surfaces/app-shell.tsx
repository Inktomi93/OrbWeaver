// AppShell — the four-region rail frame: RAIL | LIST | CONTENT | CONTEXT. Layout mechanics live in
// shell.css; this file wires store state to data attrs. Domain-agnostic: it knows RAIL/LIST/CONTENT/
// CONTEXT, never a specific feature — sections ride the registry (`useSectionRegistry`), assembled at
// the main.tsx door.

import { Button } from "@orb/ui/button";
import { LIVE_TOKEN_ROOT_ATTRIBUTE, PortalContainerContext } from "@orb/ui/lib";
import { ThemeScope } from "@orb/ui/theme-scope";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { preload } from "react-dom";
import { resolveThemeScopeTokens } from "#lib";
import type { SectionId } from "#state";
import { closeModal, openModal, setActiveSection, useChromeRegistry, useSectionRegistry } from "#state";
import { RegionAnchor } from "../anchors/region-anchor.tsx";
import { CustomThemeStyle } from "../components/custom-theme-style.tsx";
import { ModalHost } from "../components/modal-host.tsx";
import { NoticeBand } from "../components/notice-band.tsx";
import { PanelChrome } from "../components/panel-chrome.tsx";
import { Rail } from "../components/rail.tsx";
import { SectionContent } from "../components/section-content.tsx";
import type { SectionContextHostProps } from "../components/section-context-host.tsx";
import { SectionContextHeader, SectionContextHost } from "../components/section-context-host.tsx";
import { SectionPlaceholder } from "../components/section-placeholder.tsx";
import { SectionTopbarTitle } from "../components/section-topbar-title.tsx";
import { ShellTopbar } from "../components/shell-topbar.tsx";
import { ThemeBackgroundLayer } from "../components/theme-background-layer.tsx";
import { ThemeBackgroundVideoLayer } from "../components/theme-background-video-layer.tsx";
import { TopbarTrailChrome } from "../components/topbar-trail.tsx";
import { useAppearance } from "../hooks/use-appearance.ts";
import { useAppearanceRootEffects } from "../hooks/use-appearance-root-effects.ts";
import { useChatBackground } from "../hooks/use-chat-background.ts";
import { useCommandShortcut } from "../hooks/use-command-shortcut.ts";
import { useShellContentPrimacyObserver } from "../hooks/use-is-mobile-viewport.ts";
import { useKeyboardInsetVar } from "../hooks/use-keyboard-inset-var.ts";
import { useShellTrackFlip } from "../hooks/use-list-track-flip.ts";
import { useSelectedTheme } from "../hooks/use-selected-theme.ts";
import type { ShellLayout } from "../hooks/use-shell-layout.ts";
import { useShellLayout } from "../hooks/use-shell-layout.ts";
import { useStrayFileDropGuard } from "../hooks/use-stray-file-drop-guard.ts";
import { appearanceBackgroundSource, resolveThemeBackgroundUrl } from "../lib/resolve-theme-background.ts";

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

/** A FLOATING context pane's own way out, handed to the bracket to seat inside its head band (side-eye
 *  2026-08-06 P2 — the close sits where the thing it closes is; a phone cannot reach the scrim under a 100dvw
 *  sheet). Docked/collapsed panes carry none: the topbar toggle is the ONE detail-panel control there. The
 *  label is the same one `PanelChrome` would print, so a reader hears one name for one control. */
function contextDismiss(layout: ShellLayout): Pick<SectionContextHostProps, "dismissLabel" | "onDismiss"> {
  if (layout.contextMode !== "overlay") {
    return {};
  }
  return { dismissLabel: `Close ${layout.activeSectionLabel} details`, onDismiss: (): void => layout.collapsePanel("context") };
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

export function AppShell(): ReactElement {
  const registry = useSectionRegistry();
  // The ⌘K ACCELERATOR's target, read off the SAME chrome entry the trail draws (#1789). It used to be a
  // second `useModalRegistry()` lookup for the `topbar.trail` placement; the shortcut and the chip must open
  // the same modal, so they read one resolved list rather than two derivations of it.
  // The entry's own `behavior.modalId` is the id (its `id` field is a plain string — the behavior arm is
  // where the typed `ModalSlotId` lives), so the narrowing is real rather than a cast.
  const trailModalBehavior = useChromeRegistry()
    .list()
    .find((e) => e.zone === "topbar.trail" && e.behavior.kind === "modal")?.behavior;
  const commandModalId = trailModalBehavior?.kind === "modal" ? trailModalBehavior.modalId : undefined;
  const primacySentinelRef = useRef<HTMLDivElement>(null);
  useShellContentPrimacyObserver(primacySentinelRef);
  const layout = useShellLayout();
  useCommandShortcut(commandModalId, layout.openModalId);
  const appearance = useAppearance();
  // `dataTheme` comes from the hook, NOT from the row here (#231): while the two chained theme reads are
  // in flight it must answer with this device's remembered palette — the one `main.tsx` already stamped
  // before React mounted — or the shell's first commit clobbers the replay and a Light user cold-boots
  // dark, then swaps. The derivation itself lives in the hook, its one home.
  const { theme, dataTheme } = useSelectedTheme();
  // Overlays portal to a themed root inside <ThemeScope> instead of <body>, so every float inherits the active theme's tokens.
  const portalRootRef = useRef<HTMLDivElement>(null);
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
    reducedMotion: appearance.reducedMotion,
  });
  // A seed theme paints from its generated [data-theme] block (keyed by `dataTheme` above), NOT its stored
  // override — see resolve-theme-scope-tokens for the shadowing bug this prevents.
  // `ambientBackground` is the ROOT of the #236 ambient chain: the surface the active theme paints, so a
  // carried card that picks inks and no base gets judged against what it actually lands on. `ambientAccent`
  // is its #692 sibling — the accent the active theme paints, so a carried palette that picks a background
  // and no accent gets its inherited fill judged against the card that palette derives.
  const { tokens: scopeTokens, density, ambientBackground, ambientAccent } = resolveThemeScopeTokens(theme, appearance.density);
  // Density is orthogonal to a theme's palette source, but it belongs on the same carrier: the shell grid
  // and every portal root are siblings below ThemeScope. Compose the already-resolved value here so seed
  // themes still withhold their stored palette override while both branches inherit one density contract.
  const resolvedScopeTokens = { ...scopeTokens, density };
  // BG-C: the active chat's carried background (per-chat > card-carried) wins over the viewer's own appearance
  // ONLY in a true-solo room; `undefined` (any other composition, landing, an unresolved read) ⇒ the viewer's
  // appearance source. fit/dim/blur always stay the viewer's own treatment (source-only carry).
  // A file dropped anywhere but a dropzone would navigate the tab to that file and take the session with it.
  useKeyboardInsetVar();
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
  // THE DIAL'S FLOOR IS A TOKEN, NOT A LITERAL (#1204). It was `680px` here, sized before `ed55bf193`
  // shipped Geist — after which 65 CSS `ch` stepped 557.7 -> 650px and the narrowest dial position held
  // 592px of flat prose / 628px of echo, i.e. under the transcript's own band floor for EVERY skin. The
  // floor is now derived from that measure (dimension.shell-content-floor's $description carries the
  // arithmetic) and lives in the vault, because a portable value is not a feature's to spell
  // (client-architecture-lockdown.md §4). The middle term stays here: it is the reader's own percentage.
  const shellVars: CSSProperties = {
    "--width-shell-content": `clamp(var(--dimension-shell-content-floor), ${appearance.chatWidthPct}dvw, 100dvw)`,
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
            <SectionContextHost key={layout.activeSection} definition={activeDef} {...contextDismiss(layout)} />
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
  // #1349: on the ONE-SHELL phone screen the LIST pane IS the main landmark, so it is also what the skip
  // link has to reach — `.shell-content` is display:none behind it and focusing it moved nothing.
  const listPaneRef = useRef<HTMLElement>(null);
  // The FLIP that keeps the docked-panel push compositor-only (shell.css "THE PANEL PUSH IS A FLIP"):
  // stamps each moving track's direction on the grid in the same commit that resizes it. BOTH tracks, one
  // hook (#2456): the focus door moves them together, and their contributions compose into ONE keyframe
  // per moving element — two hooks would be two attributes racing one `animation` property.
  const gridRef = useRef<HTMLDivElement>(null);
  useShellTrackFlip(gridRef, layout.listMode, layout.contextMode);

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
      <ThemeScope tokens={resolvedScopeTokens} className="contents" ambientBackground={ambientBackground} ambientAccent={ambientAccent}>
        <PortalContainerContext value={portalRootRef}>
          {/* The grid is the app's LIVE-TOKEN ROOT (#504): canvas + foreign-realm consumers (ECharts chrome,
              the sandbox card frame) resolve their concrete token values from HERE rather than from <html>,
              because a custom theme's palette is inline on <ThemeScope> above and the colorization rule
              redeclares --color-border on both the grid and its themed portal-root sibling below that inline
              carrier — neither custom branch is visible to a documentElement read. */}
          <div
            ref={gridRef}
            className="shell-grid"
            {...{ [LIVE_TOKEN_ROOT_ATTRIBUTE]: "" }}
            data-section={layout.activeSection}
            data-list-mode={layout.listMode}
            data-context-mode={layout.contextMode}
            data-focus-mode={layout.focusMode}
            data-elevation={appearance.elevation}
            {...(hasBgImage ? { "data-has-bg-image": true } : {})}
            style={shellVars}
          >
            <CustomThemeStyle css={theme?.css ?? null} />
            {/* shell.css owns the prospective both-docked geometry. Its zero-or-deficit inline size is the
                rendered signal observed by useShellLayout; hidden and out of flow, so it cannot affect the
                geometry it reports. */}
            <div ref={primacySentinelRef} className="shell-content-primacy-sentinel" aria-hidden="true" />
            {/* THE SKIP (side-eye 2026-08-16 F9 — filed against home, fixed here because a skip link after
                the rail skips nothing). The rail plus the topbar is a FIXED ~15-stop preamble in front of
                every section's first real control: on home the resume hero — the one thing the landing
                surface exists to offer — was tab stop 16. None of those stops is droppable (they are the
                app's whole navigation), so the honest fix is the standard skip posture, exactly as the
                assembly rack does it one level down: rest-invisible, revealed on focus-visible, costing the
                pointer user nothing and the keyboard user one press.
                FIRST IN DOM ORDER inside the grid, which is the whole contract — a skip control that is not
                the first focusable is a second tab stop, not a skip. It moves focus to the `<main>` scroll
                container (already `tabIndex={-1}` and already named by the active section) rather than to a
                control inside it, so the next Tab lands on the section's first real affordance whatever
                that section is. `absolute` keeps it out of the shell grid's track flow when revealed.

                …AND ON THE PHONE LANDING IT TARGETS THE ROSTER, BECAUSE THAT IS WHAT `main` IS THERE
                (#1349). The ONE-SHELL rule makes the LIST pane the screen and shell.css `display:none`s
                `.shell-content` behind it, so this control was pointing at an unrendered, inert, zero-wide
                node: measured on live main 2026-09-04 at `--mobile`, Tab reached "Skip to content" and
                Enter left focus exactly where it was. The skip does not learn about phones — it follows
                the SAME flag that decides which region carries the landmark
                (`ShellLayout.listIsPrimaryContent`), so the two can never disagree.

                `not-focus-visible:sr-only`, NOT `sr-only focus-visible:not-sr-only` (side-eye rail-home
                P3-7, 2026-08-22). The pair reads right and renders wrong: Tailwind's `not-sr-only` is a
                RESET, and its reset includes `padding: 0` and `height: auto` — which land in the same layer
                at the same specificity as the Button's own `h-control-sm px-block` and beat them, so the
                REVEALED control measured 94x18 with a computed padding of "0px", i.e. bare text with a
                border and no box, under the WCAG 2.5.8 24x24 floor on its block axis. The `not-*` variant
                removes the fight instead of trying to win it: at rest the clip applies, and on focus NOTHING
                from `sr-only` applies at all, so the control is simply the `sm` Button it already declares
                itself to be. The rest posture is unchanged and the CT still reads it through the resolved
                `clip-path: inset(50%)`. */}
            <Button
              className="not-focus-visible:sr-only focus-visible:absolute focus-visible:start-row focus-visible:top-row focus-visible:z-(--z-overlay)"
              intent="secondary"
              onClick={(): void => (layout.listIsPrimaryContent ? listPaneRef : mainRef).current?.focus()}
              size="sm"
              type="button"
            >
              Skip to content
            </Button>
            <RailSlot activeSection={layout.activeSection} show={!layout.mobileViewport} />

            <PanelChrome
              panel="list"
              label={`${layout.activeSectionLabel} list`}
              available={layout.listAvailable}
              header={activeDef.listHeader?.()}
              mode={layout.listMode}
              onDismiss={(): void => layout.collapsePanel("list")}
              primaryContent={layout.listIsPrimaryContent}
              ref={listPaneRef}
            >
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
                    trail={<TopbarTrailChrome mobile={layout.mobileViewport} />}
                    listAvailable={layout.listAvailable}
                    listMode={layout.listMode}
                    // The phone arm's VOCABULARY switch, not a behaviour switch — see `leadControl`.
                    mobile={layout.mobileViewport}
                    onToggleList={(): void => layout.togglePanel("list")}
                    // The mobile ONE-SHELL rule's back row. The label is DERIVED from the section's own rail
                    // label ("Back to Configuration", the mock's own words), so it cannot drift per section and
                    // no section authors a second vocabulary for it.
                    onBack={layout.backToList}
                    backLabel={`Back to ${layout.activeSectionLabel}`}
                  />
                )}
              </SectionTopbarTitle>
              {/* THE NOTICE BAND (#193) — a flow row between the chrome and the content, hosting the app's
                  toast stack. Zero pixels while empty; when it holds a notice the content column is PUSHED,
                  which is the whole escape: an overlay toast on a phone had to cover either the transcript
                  or the composer, and both are load-bearing. Sits inside `.shell-main` rather than the grid
                  so it spans the CONTENT column — the region whose reading surface it protects — and leaves
                  the rail and both panels untouched. */}
              <NoticeBand />
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

            <PanelChrome
              panel="context"
              label={`${layout.activeSectionLabel} details`}
              available={layout.contextAvailable}
              header={contextPane.header}
              mode={layout.contextMode}
              onDismiss={(): void => layout.collapsePanel("context")}
            >
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

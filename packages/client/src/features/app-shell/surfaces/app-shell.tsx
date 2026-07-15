// AppShell — the four-region rail frame: RAIL | LIST | CONTENT | CONTEXT. Layout mechanics live in
// shell.css; this file wires store state to data attrs. Domain-agnostic: it knows RAIL/LIST/CONTENT/
// CONTEXT, never a specific feature — sections ride the registry (`useSectionRegistry`), assembled at
// the main.tsx door.

import { PortalContainerContext } from "@orb/ui/lib";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useRef } from "react";
import { preload } from "react-dom";
import type { SectionId } from "#state";
import {
  closeModal,
  openModal,
  setActiveSection,
  useModalRegistry,
  useSectionRegistry,
} from "#state";
import { RegionAnchor } from "../anchors/region-anchor";
import { CustomThemeStyle } from "../components/custom-theme-style";
import { ModalHost } from "../components/modal-host";
import { PanelChrome } from "../components/panel-chrome";
import { Rail } from "../components/rail";
import { SectionContent } from "../components/section-content";
import { SectionContextHost } from "../components/section-context-host";
import { SectionPlaceholder } from "../components/section-placeholder";
import { ShellTopbar } from "../components/shell-topbar";
import { ThemeBackgroundLayer } from "../components/theme-background-layer";
import { useAppearance } from "../hooks/use-appearance";
import { useAppearanceRootEffects } from "../hooks/use-appearance-root-effects";
import { useSelectedTheme } from "../hooks/use-selected-theme";
import { useShellLayout } from "../hooks/use-shell-layout";
import { resolveBackgroundUrl } from "../lib/resolve-theme-background";
import "./shell.css";

export interface AppShellProps {
  /** Route-composed rail-foot chip (the persona switcher). Undefined ⇒ the account button. */
  readonly railFoot?: ReactNode;
  /** Route-composed topbar trail chrome (e.g. the notifications bell). Undefined ⇒ nothing extra. */
  readonly topbarTrail?: ReactNode;
}

export function AppShell({ railFoot, topbarTrail }: AppShellProps): ReactElement {
  const registry = useSectionRegistry();
  // The ⌘K affordance opens the single `topbar-command`-placed modal — derived, never hardcoded.
  const commandModalId = useModalRegistry()
    .list()
    .find((m) => m.trigger.placement === "topbar-command")?.id;
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
  const density = theme?.override.density ?? appearance.density;
  const bgUrl = resolveBackgroundUrl(appearance);
  // Warms the fetch during render so ThemeBackgroundLayer paints from cache instead of popping in.
  if (bgUrl !== null) {
    preload(bgUrl, { as: "image" });
  }
  const hasBgImage = bgUrl !== null;
  const shellVars: CSSProperties = {
    "--width-shell-content": `clamp(680px, ${appearance.chatWidthPct}dvw, 100dvw)`,
  } as CSSProperties;
  const activeDef = registry.get(layout.activeSection);
  const placeholderCopy = activeDef.placeholder;
  // At most one Weave decoration per screen — it rides the content placeholder only.
  const listContent = activeDef.list?.() ?? (
    <SectionPlaceholder title={`${placeholderCopy.title} list`} />
  );
  const contentFallback = (
    <SectionPlaceholder
      title={placeholderCopy.title}
      description={placeholderCopy.description}
      weave={true}
    />
  );
  // Every section's content, from the registry, so <Activity> keeps recently-visited panes mounted-but-
  // hidden across a rail switch. The DECLARED-PLANNED arm renders the section's own placeholder as its
  // content (the refinery founding member).
  const contentBySection: Partial<Record<SectionId, ReactNode>> = {};
  for (const def of registry.list()) {
    contentBySection[def.id] =
      typeof def.content === "function" ? (
        def.content()
      ) : (
        <SectionPlaceholder
          title={def.placeholder.title}
          description={def.placeholder.description}
          weave={true}
        />
      );
  }
  const mainRef = useRef<HTMLElement>(null);

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
      {/* Mounted before .shell-grid in DOM order so it paints underneath; renders nothing when no image is set. */}
      <ThemeBackgroundLayer
        url={bgUrl}
        fit={appearance.backgroundFit}
        dim={appearance.backgroundDim}
        blur={appearance.backgroundBlur}
      />
      <ThemeScope tokens={theme?.override ?? {}} className="contents">
        <PortalContainerContext.Provider value={portalRootRef}>
          <div
            className="shell-grid"
            data-section={layout.activeSection}
            data-list-mode={layout.listMode}
            data-context-mode={layout.contextMode}
            data-density={density}
            data-elevation={appearance.elevation}
            data-reduced-motion={appearance.reducedMotion}
            {...(hasBgImage ? { "data-has-bg-image": true } : {})}
            style={shellVars}
          >
            <CustomThemeStyle css={theme?.css ?? null} />
            <Rail
              activeSection={layout.activeSection}
              onSelectSection={setActiveSection}
              onOpenModal={openModal}
              railFoot={railFoot}
            />

            <PanelChrome
              panel="list"
              label={`${layout.activeSectionLabel} list`}
              mode={layout.listMode}
            >
              <RegionAnchor region="list">{listContent}</RegionAnchor>
            </PanelChrome>

            <div className="shell-main">
              <ShellTopbar
                title={layout.activeSectionLabel}
                header={activeDef.header?.()}
                trail={topbarTrail}
                listMode={layout.listMode}
                contextMode={layout.contextMode}
                immersive={layout.immersive}
                onToggleList={(): void => layout.togglePanel("list")}
                onToggleContext={(): void => layout.togglePanel("context")}
                onToggleFocus={layout.toggleFocus}
                onOpenCommand={(): void => {
                  if (commandModalId !== undefined) {
                    openModal(commandModalId);
                  }
                }}
              />
              <main className="shell-content" ref={mainRef} tabIndex={-1}>
                <SectionContent
                  activeSection={layout.activeSection}
                  contentBySection={contentBySection}
                  fallback={contentFallback}
                  focusAnchorRef={mainRef}
                />
              </main>
            </div>

            <PanelChrome
              panel="context"
              label={`${layout.activeSectionLabel} details`}
              header={
                <Text size="label" weight="medium" tone="muted">
                  Details
                </Text>
              }
              collapseLabel="Collapse detail panel"
              mode={layout.contextMode}
              onCollapse={(): void => layout.collapsePanel("context")}
            >
              <RegionAnchor region="context">
                <SectionContextHost key={layout.activeSection} definition={activeDef} />
              </RegionAnchor>
            </PanelChrome>

            {/* Stays mounted and fades via data-visible so it fades WITH the panel instead of hard-cutting on close. */}
            <button
              type="button"
              className="shell-scrim"
              data-visible={layout.scrimVisible}
              aria-hidden={!layout.scrimVisible}
              tabIndex={layout.scrimVisible ? 0 : -1}
              aria-label="Dismiss panel"
              onClick={dismissOverlays}
            />

            <ModalHost
              openModal={layout.openModalId}
              container={portalRootRef}
              onClose={closeModal}
            />
          </div>
          {/* Themed portal root for every overlay — sibling of .shell-grid but inside <ThemeScope>. */}
          <div ref={portalRootRef} className="contents" data-slot="portal-root" />
        </PortalContainerContext.Provider>
      </ThemeScope>
    </TooltipProvider>
  );
}

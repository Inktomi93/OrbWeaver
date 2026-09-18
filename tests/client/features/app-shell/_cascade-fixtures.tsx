// Cascade-contract fixtures (non-test module — Spine-Testing §7: CT mounts ONLY from a non-test
// module). A bare `.shell-grid`-shaped DOM under the CT bootstrap's production CSS front door, so
// computed-style assertions in shell-cascade.ct.tsx exercise the real cascade rules — not a
// re-implementation or a fixture-local import roster. No AppShell data/query graph is needed: the bug
// class this guards (specificity ties between unlayered plain-CSS rules) lives entirely in the CSS, not in
// any component logic, so a minimal DOM with the same classes/attributes/slots reproduces it exactly.

import type { BlurSurface, SurfaceTexture } from "@orb/contracts/settings";
import type { ThemeDensity } from "@orb/contracts/theme";
import type { MessageRole } from "@orb/kit/message-role";
import { Surface } from "@orb/ui/layout";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { useAppearanceRootEffects } from "../../../../packages/client/src/features/app-shell/hooks/use-appearance-root-effects.ts";
import type { SeedThemeName } from "../../../../packages/client/src/state/appearance-boot-hint.ts";
import type { PanelMode } from "../../../../packages/client/src/state/panel-resolve.ts";

/** Roughly a production list panel (346px, reports/side-eye-138/L1.log) — see the probe comment below. */
const PANEL_PROBE_WIDTH = "346px";

export interface ShellCascadeFixtureProps {
  readonly elevation?: "flat" | "ramp" | "glow";
  readonly hasBgImage?: boolean;
  readonly blurSurfaces?: readonly BlurSurface[];
  readonly density?: ThemeDensity;
  readonly fontScale?: number;
  readonly messageRole?: MessageRole;
  /** The active section stamped on `.shell-grid` (WS3 reading-surface backing). Left off ⇒ the immersive
   *  transparent path (the Chats/no-section case); a non-`chats` value gets the reading-surface backing. */
  readonly section?: string;
  /** `data-texture` on the root — the grain overlay's own gate (#138 asserts the contrast arm drops it). */
  readonly surfaceTexture?: SurfaceTexture;
  /** `data-theme` on the root. The palette must be a variable in a cascade fixture: a per-surface tint
   *  assertion that only ever runs on the default palette cannot tell "mixes --color-popover" apart from
   *  "happens to equal the dark popover value" (#138's modal-tint pin runs on light too). */
  readonly dataTheme?: SeedThemeName | null;
  /**
   * Drops the `.shell-main` region (and the topbar / content / empty-state probes inside it).
   *
   * THIS FIXTURE'S REGIONS ALL SHARE ONE GRID CELL. The probes carry the classes and slots but not the
   * `data-list-mode`/`data-panel-mode` attributes shell.css's track sizing keys on, so `.shell-main`
   * lays out at `1224x800@56,0` — exactly on top of the list panel — and paints its opaque
   * `--color-card` over it. That is invisible to every computed-style assertion in this file, and fatal
   * to a FRAMEBUFFER one: measured, every sampled pixel across the whole viewport came back as the main
   * region's fill, including the panel's own seam. Set this for a pixel-sampling test only.
   */
  readonly omitMainRegion?: boolean;
  /**
   * `data-panel-mode` on BOTH panel probes — the attribute shell.css and the glass rules key their
   * off-screen arms on. Left off ⇒ the probes carry no mode at all, which is what every case in this
   * file predating #1120 asserted against; `"collapsed"` is the arm a section that declares a pane
   * `"unavailable"` resolves (owner decision H3 / arm L-b) and every section's own closed pane.
   */
  readonly panelMode?: PanelMode;
}

/**
 * Stamps attrs exactly where production stamps them: `data-blur-*` on the DOCUMENT ROOT via the real
 * `useAppearanceRootEffects` hook (app-shell.tsx never stamps these itself — a modal popup is portalled
 * OUT of the grid, so a wrapper-scoped stamp could not reach it), `data-elevation`/`data-has-bg-image` on
 * `.shell-grid`, and density on the common ThemeScope ancestor of the grid and portal root. The probes cover every
 * surface named in the bug report: panel, main, topbar, composer, a message bubble (chrome vs "dense"
 * reading-surface fill), and the two dialog popup slots.
 *
 * WHERE THE MODAL SLOTS SIT IS A CONTRACT, NOT A LAYOUT CHOICE — see the comment on the portal root below.
 * (The sentence here used to say Dialog/AlertDialog portal to `document.body`. They do not: they portal to
 * the THEMED portal root app-shell.tsx renders as a sibling of `.shell-grid`, which is why the probes moved
 * there at #623. `document.body` was also the premise the probes' old in-grid placement contradicted.)
 */
export function ShellCascadeFixture({
  elevation = "flat",
  hasBgImage = false,
  blurSurfaces = [],
  density = "comfortable",
  fontScale = 1,
  messageRole = "assistant",
  section,
  surfaceTexture = "none",
  dataTheme = null,
  omitMainRegion = false,
  panelMode,
}: ShellCascadeFixtureProps): ReactElement {
  useAppearanceRootEffects({
    fontScale,
    dataTheme,
    blurSurfaces,
    shadowEffects: false,
    // Schema defaults (@orb/contracts/settings appearanceSchema) — the cascade-contract fixture isn't
    // exercising Phase 4b's new axes, so it stamps the same no-op values a fresh user would resolve to.
    blurStrength: 14,
    reading: {
      lineHeight: 1.55,
      letterSpacing: 0,
      paragraphSpacing: 0.75,
      nameScale: 1,
      bodyScale: 1,
      justify: false,
    },
    themeColorization: false,
    surfaceTexture,
    reducedMotion: false,
  });
  return (
    <ThemeScope tokens={{ density }} className="contents">
      <div
        className="shell-grid"
        data-testid="shell-grid"
        data-elevation={elevation}
        {...(hasBgImage ? { "data-has-bg-image": "" } : {})}
        {...(section === undefined ? {} : { "data-section": section })}
      >
        {/* PANEL_PROBE_WIDTH is not decoration: these probes carry no content, and the shell grid gives a
          content-empty panel a zero track — measured 2x800, i.e. a box that is ENTIRELY its own border.
          Every computed-style assertion was happy with that; #138's framebuffer pin is not, because
          "sample the panel a few px inside its seam" then lands on the page background and compares the
          backdrop with itself. A production list panel measures ~346px (reports/side-eye-138/L1.log). */}
        <div className="shell-panel" data-panel-side="list" data-panel-mode={panelMode} data-testid="panel-probe" style={{ width: PANEL_PROBE_WIDTH }} />
        {/* The MIRROR side. The two panels author OPPOSITE seams (`border-inline-end` vs
          `border-inline-start`, shell.css), and #138's per-side contrast rules have to be asserted on
          both — a list-only fixture cannot tell a correct per-side rule from one that thickens the wrong
          edge. */}
        <div
          className="shell-panel"
          data-panel-side="context"
          data-panel-mode={panelMode}
          data-testid="context-panel-probe"
          style={{ width: PANEL_PROBE_WIDTH }}
        />
        {omitMainRegion ? null : (
          <div className="shell-main" data-testid="main-probe">
            <div className="shell-topbar" data-testid="topbar-probe" />
            {/* The CONTENT column + a landing empty-state hero — for the WS3 Chats-immersive scrim-chip
              rule (only the Chats section over a bg image anchors this hero; every other case leaves it
              un-boxed). */}
            <div className="shell-content">
              <div data-slot="empty-state-root" data-testid="empty-state-probe" />
            </div>
          </div>
        )}
        <div data-slot="composer" data-testid="composer-probe" />
        <Surface tier="instrument">
          <div data-testid="surface-carrier">Surface carrier</div>
        </Surface>
        <div data-role={messageRole}>
          <div data-slot="message-bubble" data-testid="bubble-probe" />
        </div>
      </div>
      {/* THE TWO MODAL SLOTS LIVE OUTSIDE `.shell-grid`, BECAUSE THAT IS WHERE PRODUCTION PUTS THEM (#623).
          They used to be children of the grid here, which quietly made this fixture incapable of judging any
          rule scoped to the grid's own state: `DialogPopup` portals to the themed portal root, which
          app-shell.tsx renders as a SIBLING of `.shell-grid` (`<div ref={portalRootRef} className="contents"
          data-slot="portal-root" />`), so a `.shell-grid[data-has-bg-image] [data-slot="dialog-popup"]`
          selector matches HERE and matches NOTHING in the app. A pin that cannot see the thing it pins reads
          exactly like a passing pin. Every existing assertion on these probes is an `html`-rooted rule
          (the glass recipe, the reduced-transparency arm, the prefers-contrast tint), so the move is inert
          for them and load-bearing for anything wallpaper-gated. */}
      <div className="contents" data-slot="portal-root">
        <div data-slot="dialog-popup" data-testid="dialog-probe" />
        <div data-slot="alert-dialog-popup" data-testid="alert-dialog-probe" />
      </div>
    </ThemeScope>
  );
}

// ── The OVER-ART census fixture (#623) ────────────────────────────────────────────────────────────────
// D144's reading plate is the general mechanism for "a translucent surface that sits over the wallpaper"
// (#217 derived its alpha against worst-case art; #237 threaded it into `.shell-panel`). Nothing enforces
// adoption, so each surface has been found one at a time by a pixel sample after ship. This fixture makes the
// whole glass population measurable in ONE mount: every surface the glass recipe paints at
// `--blur-fill-chrome` over `transparent`, laid out at fixed, NON-OVERLAPPING rects.
//
// The rects are the entire point. `ShellCascadeFixture`'s regions share one grid cell (see `omitMainRegion`),
// which is invisible to a computed-style read and fatal to a framebuffer one — every sample comes back as
// whichever region painted last. Absolute rects give each probe its own pixels.
//
// The wallpaper is reproduced the way #237's pin does it: the grid goes `background: transparent` under
// `[data-has-bg-image]`, so painting the PAGE black puts worst-legal-art behind every probe. Black is the
// conservative bound for a LIGHT palette by D144's own derivation (a light plate carries dark ink, so the
// composite is worst when the art darkens it) and it stays the bound for a modal even though a dialog also
// has `--color-backdrop` under it — a scrim only darkens what is behind a light popup.
const CENSUS_PROBE = { position: "absolute", top: 0, width: "200px", height: "200px" } as const;

/** Every glass surface over worst-case art, in one mount, at rects that do not overlap. `data-section` is a
 *  non-`chats` value so `.shell-main` takes its reading-surface backing (the `chats` arm is immersive). */
export function OverArtGlassCensusFixture({ dataTheme = null }: { readonly dataTheme?: SeedThemeName | null }): ReactElement {
  useAppearanceRootEffects({
    fontScale: 1,
    dataTheme,
    blurSurfaces: ALL_GLASS_SURFACES,
    shadowEffects: false,
    blurStrength: 14,
    reading: { lineHeight: 1.55, letterSpacing: 0, paragraphSpacing: 0.75, nameScale: 1, bodyScale: 1, justify: false },
    themeColorization: false,
    surfaceTexture: "none",
    reducedMotion: false,
  });
  return (
    <ThemeScope tokens={{ density: "comfortable" }} className="contents">
      <div className="shell-grid" data-has-bg-image="" data-section="config" data-elevation="flat">
        <div className="shell-panel" data-panel-side="list" data-testid="census-panel" style={{ ...CENSUS_PROBE, left: 0 }} />
        <div className="shell-main" data-testid="census-main" style={{ ...CENSUS_PROBE, left: "220px" }} />
        <div data-slot="composer" data-testid="census-composer" style={{ ...CENSUS_PROBE, left: "440px" }} />
        {/* THE THREE BUBBLE ROLES, each under its own `[data-role]` ancestor because that is what the glass
            rules key on — a bare `[data-slot="message-bubble"]` takes no tint at all and would census a
            surface production never paints. They are the transcript's own reading surface, so they are the
            over-art case that matters most and the last one the plate arm reached. */}
        {/* A SECOND ROW (`top: 220px`), not more columns: the dialog probe already sits at 660 and the CT
            viewport is 1280 wide, so three more 200px columns would either overlap it or fall outside the
            frame — and a pixel sample outside the viewport reads nothing while looking like a measurement. */}
        {(["user", "assistant", "system"] as const).map((role, index) => (
          <div data-role={role} key={role}>
            <div data-slot="message-bubble" data-testid={`census-bubble-${role}`} style={{ ...CENSUS_PROBE, left: `${String(index * 220)}px`, top: "220px" }} />
          </div>
        ))}
      </div>
      {/* The production home of a dialog popup: a SIBLING of the grid, not a descendant. */}
      <div className="contents" data-slot="portal-root">
        <div data-slot="dialog-popup" data-testid="census-dialog" style={{ ...CENSUS_PROBE, left: "660px" }} />
      </div>
    </ThemeScope>
  );
}

const ALL_GLASS_SURFACES: readonly BlurSurface[] = ["panels", "composer", "modals", "messages"];

/** The grain probes are sized and given a flat fill so a framebuffer read of the overlay has a uniform
 *  backdrop to measure the noise against (a content-empty probe collapses to 0x0 and samples nothing). */
const GRAIN_CARD_STYLE = { width: "200px", height: "200px", background: "#808080" } as const;

/**
 * The #435 double-paint fixture: ONE card inside `.shell-grid` and one OUTSIDE it, under `data-texture`.
 *
 * The outside card stands in for a PORTALLED one. Production portals land in a themed root that is a
 * `.shell-grid` sibling, so a portalled card is not a grid descendant — the only property the grain
 * selectors discriminate on. A plain sibling reproduces that exactly without portal mount timing.
 */
export function GrainDoublePaintFixture({ surfaceTexture = "grain" }: { readonly surfaceTexture?: SurfaceTexture }): ReactElement {
  useAppearanceRootEffects({
    fontScale: 1,
    dataTheme: null,
    blurSurfaces: [],
    shadowEffects: false,
    blurStrength: 14,
    reading: { lineHeight: 1.55, letterSpacing: 0, paragraphSpacing: 0.75, nameScale: 1, bodyScale: 1, justify: false },
    themeColorization: false,
    surfaceTexture,
    reducedMotion: false,
  });
  return (
    <div>
      <div className="shell-grid" data-testid="grain-shell-grid">
        <div data-slot="card-root" data-testid="in-shell-card" style={GRAIN_CARD_STYLE} />
      </div>
      <div data-slot="card-root" data-testid="outside-shell-card" style={GRAIN_CARD_STYLE} />
    </div>
  );
}

export interface ReadingTypographyFixtureProps {
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly paragraphSpacing: number;
  readonly nameScale: number;
  readonly bodyScale: number;
  readonly justify: boolean;
}

/**
 * Stamps the Phase-4b §B.5.3 reading-typography root vars via the REAL `useAppearanceRootEffects` (the
 * exact hook app-shell.tsx calls — same effect body that stamps `--font-scale`) and renders the two
 * message slots the client globals.css reading rules target: `[data-slot="message-bubble"]`
 * (line-height / letter-spacing / body-scale font-size / paragraph-spacing on `p + p` / justify) and
 * `[data-slot="message-attribution"]` (name-scale font-size). This proves the root-var → globals.css →
 * computed-style wiring end-to-end — the half NOT covered by app-shell.ct.tsx's
 * getUserSettings→`--font-scale` test (which proves the hook reaches the root, but nothing asserts the
 * client globals.css rules actually consume these vars on a real message bubble/attribution).
 */
export function ReadingTypographyFixture({
  lineHeight,
  letterSpacing,
  paragraphSpacing,
  nameScale,
  bodyScale,
  justify,
}: ReadingTypographyFixtureProps): ReactElement {
  useAppearanceRootEffects({
    fontScale: 1,
    dataTheme: null,
    blurSurfaces: [],
    shadowEffects: false,
    blurStrength: 14,
    reading: { lineHeight, letterSpacing, paragraphSpacing, nameScale, bodyScale, justify },
    themeColorization: false,
    surfaceTexture: "none",
    reducedMotion: false,
  });
  return (
    <div>
      <div data-slot="message-bubble" data-testid="reading-bubble">
        <p>First paragraph.</p>
        <p>Second paragraph.</p>
      </div>
      <div data-slot="message-attribution" data-testid="reading-attribution">
        Speaker
      </div>
    </div>
  );
}

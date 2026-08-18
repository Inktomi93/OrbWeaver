// Cascade-contract fixtures (non-test module — Spine-Testing §7: CT mounts ONLY from a non-test
// module). A bare `.shell-grid`-shaped DOM with shell.css + the client's globals.css (the glass
// recipe) ACTUALLY IMPORTED, so computed-style assertions in shell-cascade.ct.tsx exercise the real
// cascade rules — not a re-implementation of them. No AppShell data/query graph is needed: the bug
// class this guards (specificity ties between unlayered plain-CSS rules) lives entirely in the CSS,
// not in any component logic, so a minimal DOM with the same classes/attributes/slots reproduces it
// exactly.

import type { BlurSurface, SurfaceTexture } from "@orb/contracts/settings";
import type { ThemeDensity } from "@orb/contracts/theme";
import type { MessageRole } from "@orb/kit/message-role";
import type { ReactElement } from "react";
import { useAppearanceRootEffects } from "../../../../packages/client/src/features/app-shell/hooks/use-appearance-root-effects.ts";
import "../../../../packages/client/src/features/app-shell/surfaces/shell.css";
import "../../../../packages/client/src/styles/globals.css";

/** Roughly a production list panel (346px, reports/side-eye-138/L1.log) — see the probe comment below. */
const PANEL_PROBE_WIDTH = "346px";

export interface ShellCascadeFixtureProps {
  readonly elevation?: "flat" | "ramp";
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
  readonly dataTheme?: string | null;
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
}

/**
 * Stamps attrs exactly where production stamps them: `data-blur-*` on the DOCUMENT ROOT via the real
 * `useAppearanceRootEffects` hook (app-shell.tsx never stamps these itself — Dialog/AlertDialog portal
 * to `document.body`, outside any wrapper div), `data-elevation`/`data-has-bg-image`/`data-density` on
 * the `.shell-grid` element (app-shell.tsx does this directly). The probes cover every surface named in
 * the bug report: panel, main, topbar, composer, a message bubble (chrome vs "dense" reading-surface
 * fill), and the two dialog popup slots.
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
  });
  return (
    <div
      className="shell-grid"
      data-testid="shell-grid"
      data-elevation={elevation}
      data-density={density}
      {...(hasBgImage ? { "data-has-bg-image": "" } : {})}
      {...(section === undefined ? {} : { "data-section": section })}
    >
      {/* PANEL_PROBE_WIDTH is not decoration: these probes carry no content, and the shell grid gives a
          content-empty panel a zero track — measured 2x800, i.e. a box that is ENTIRELY its own border.
          Every computed-style assertion was happy with that; #138's framebuffer pin is not, because
          "sample the panel a few px inside its seam" then lands on the page background and compares the
          backdrop with itself. A production list panel measures ~346px (reports/side-eye-138/L1.log). */}
      <div className="shell-panel" data-panel-side="list" data-testid="panel-probe" style={{ width: PANEL_PROBE_WIDTH }} />
      {/* The MIRROR side. The two panels author OPPOSITE seams (`border-inline-end` vs
          `border-inline-start`, shell.css), and #138's per-side contrast rules have to be asserted on
          both — a list-only fixture cannot tell a correct per-side rule from one that thickens the wrong
          edge. */}
      <div className="shell-panel" data-panel-side="context" data-testid="context-panel-probe" style={{ width: PANEL_PROBE_WIDTH }} />
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
      <div data-role={messageRole}>
        <div data-slot="message-bubble" data-testid="bubble-probe" />
      </div>
      <div data-slot="dialog-popup" data-testid="dialog-probe" />
      <div data-slot="alert-dialog-popup" data-testid="alert-dialog-probe" />
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

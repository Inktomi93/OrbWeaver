// Component-only CT stories for the cross-cutting #883 contrast floor. The real chat/control story owns
// data and composition; this module adds only the seed/custom ThemeScope axis the sweep varies.

import { BACKGROUND_DIM_MIN } from "@orb/contracts/settings";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { ChatControlsStory } from "./_ct-stories.tsx";

const CONTRAST_PALETTES = ["hearth", "mocha", "light", "custom-dark", "custom-light", "custom-pivot-dark", "custom-pivot-light"] as const;
type ContrastPalette = (typeof CONTRAST_PALETTES)[number];

function customTokens(palette: ContrastPalette): ThemeScopeTokens {
  if (palette === "custom-dark") {
    return { background: "oklch(0.18 0.02 280)", accent: "oklch(0.72 0.14 280)" };
  }
  if (palette === "custom-light") {
    return { background: "oklch(0.96 0.01 90)", accent: "oklch(0.48 0.16 40)" };
  }
  if (palette === "custom-pivot-dark") {
    return { background: "oklch(0.62 0.01 60)", accent: "oklch(0.72 0.14 280)" };
  }
  if (palette === "custom-pivot-light") {
    return { background: "oklch(0.6201 0.01 60)", accent: "oklch(0.48 0.16 40)" };
  }
  return {};
}

function withPalette(palette: ContrastPalette, child: ReactElement): ReactElement {
  const seed = palette === "mocha" || palette === "light" ? palette : undefined;
  const scoped = palette.startsWith("custom-") ? <ThemeScope tokens={customTokens(palette)}>{child}</ThemeScope> : child;
  return <div {...(seed === undefined ? {} : { "data-theme": seed })}>{scoped}</div>;
}

/** The real room/control composition over the legal minimum scrim and a one-pixel worst-art field.
 * Seed palettes use the shipped `[data-theme]` mechanism; custom palettes cross the real ThemeScope clamp. */
export function WorstLegalArtRoomStory({ palette, art }: { readonly palette: ContrastPalette; readonly art: string }): ReactElement {
  return withPalette(palette, <ChatControlsStory fixture="mixed" worstArt={art} />);
}

const PAIR_CELL = { minHeight: 36, padding: 8 } as const;

/** The ThemeScope pair arm. The DOM owns the pair population: each host paints its real surface and
 * hands its paired ink to ordinary text descendants; the audit discovers those descendants and samples
 * their framebuffer backings. There is deliberately no foreground/background tuple in the spec. */
export function WorstLegalArtThemePairsStory({ palette, art }: { readonly palette: ContrastPalette; readonly art: string }): ReactElement {
  const pairs = (
    <div data-has-bg-image="" style={{ background: art, isolation: "isolate", minHeight: 480, position: "relative" }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-backdrop" style={{ opacity: BACKGROUND_DIM_MIN }} />
      <div
        data-slot="theme-scope-painted-pairs"
        style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(0, 1fr))", padding: 16, position: "relative" }}
      >
        <div style={{ ...PAIR_CELL, background: "var(--color-background)", color: "var(--color-foreground)" }}>Background ink</div>
        <div style={{ ...PAIR_CELL, background: "var(--color-surface-raised)", color: "var(--color-foreground)" }}>Raised ink</div>
        <div style={{ ...PAIR_CELL, background: "var(--color-card)", color: "var(--color-foreground)" }}>Shared card ink</div>
        <div style={{ ...PAIR_CELL, background: "var(--color-card)", color: "var(--color-card-foreground)" }}>Card ink</div>
        <div style={{ ...PAIR_CELL, background: "var(--color-popover)", color: "var(--color-popover-foreground)" }}>Popover ink</div>
        <div style={{ ...PAIR_CELL, background: "var(--color-sidebar)", color: "var(--color-sidebar-foreground)" }}>Sidebar ink</div>
        <div style={{ ...PAIR_CELL, background: "var(--color-sidebar-accent)", color: "var(--color-sidebar-accent-foreground)" }}>Sidebar accent ink</div>
        <div style={{ ...PAIR_CELL, background: "var(--color-secondary)", color: "var(--color-secondary-foreground)" }}>Secondary ink</div>
        <div style={{ ...PAIR_CELL, background: "var(--color-accent)", color: "var(--color-accent-foreground)" }}>Accent ink</div>
        <div style={{ ...PAIR_CELL, background: "var(--color-muted)", color: "var(--color-muted-foreground)" }}>Muted ink</div>
        <div style={{ background: "var(--color-background)", padding: 4 }}>
          <span style={{ ...PAIR_CELL, background: "var(--color-input)", color: "var(--color-muted-foreground)", display: "block" }}>Input on background</span>
        </div>
        <div style={{ background: "var(--color-card)", padding: 4 }}>
          <span style={{ ...PAIR_CELL, background: "var(--color-input)", color: "var(--color-muted-foreground)", display: "block" }}>Input on card</span>
        </div>
        <div style={{ background: "var(--color-popover)", padding: 4 }}>
          <span style={{ ...PAIR_CELL, background: "var(--color-input)", color: "var(--color-muted-foreground)", display: "block" }}>Input on popover</span>
        </div>
        <div style={{ ...PAIR_CELL, background: "var(--color-reading-band)", color: "var(--color-reading-plate-foreground)" }}>Reading band ink</div>
        <div style={{ ...PAIR_CELL, background: "var(--color-reading-plate)", color: "var(--color-reading-plate-foreground)" }}>Reading plate ink</div>
      </div>
    </div>
  );
  return withPalette(palette, pairs);
}

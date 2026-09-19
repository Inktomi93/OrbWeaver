// ThemeMiniSurface — the ONE thumbnail every theme wears in the Looks collection (#920), painted by the
// theme's OWN pipeline rather than by a hand-picked list of cells.
//
// WHAT IT REPLACES, AND WHY THE OLD SHAPE COULD NOT BE TUNED. `ThemeSwatchStrip` painted exactly three
// cells: `bg-background` · `bg-card` · `bg-primary`. Two of those three are NEUTRALS, and under the D71
// pipeline every neutral surface is DERIVED from the one picked base — so `background` and `card` are
// adjacent steps of one ramp BY CONSTRUCTION. Adjacent derived tones are ~0.05 apart in OKLCH L and top
// out around 1.14:1 on either polarity (`ramp-neighbour-contrast-ceiling`), which is exactly what the
// re-drive measured: cell1↔cell2 at 1.090 (Hearth) · 1.078 (Mocha) · 1.044 (Light), i.e. 66.7% of every
// strip was one apparent colour (#1099 F2). The 3:1 receipt is unreachable from ramp neighbours by
// physics, so the fix is CHOOSING DIFFERENT MEMBERS, never nudging values — the owner's own second
// sighting says the same thing: *"a theme preview should show what actually DIFFERS between themes …
// which at minimum means the base surface, the ACCENT, and the INK."*
//
// SO THE PICTURE IS A ROOM, NOT A PALETTE: a dominant BASE plate, a CARD with the theme's own radius and
// hairline (the shape half), an INK sample on that card, and the ACCENT. Base↔ink is the pair the theme
// exists to make readable, so it clears 3:1 in BOTH polarities for free, and a Light theme reads light
// because its whole thumbnail is its own surface — the old card kept the APP's chrome around the strip,
// which is why the Light card read as a dark card and its two pale cells vanished into the card body.
//
// PROVENANCE IS THE INVARIANT (#920's theme-engine contract, verbatim). A theme paints the thumbnail the
// same way selecting it would paint the app, and there is exactly ONE derivation for that (`#lib`'s
// `dataThemeOf` + `resolveThemeScopeTokens`, shared with the shell):
//   · Hearth — the base `@theme` itself: NO `data-theme` (it owns no block) and NO ThemeScope, with the
//     base palette REPLAYED inline. Stamping nothing is what the SHELL ROOT does and it is right there;
//     nested inside a Light or Mocha root it means "inherit the ambient", and the rendered receipt caught
//     exactly that — the Hearth card came back cream under `--theme Light`. `BASE_PALETTE_VARS` replays
//     the generated base values (see its header: key set from a seed block, values from `TOKENS`);
//   · Mocha / Light — their generated `[data-theme]` block, stamped on this box: NO override scope. Feeding
//     a seed's stored `override` (which is only the duplicate-to-customize template) back through
//     ThemeScope lets the clamp RE-DERIVE and shadow the hand-tuned block;
//   · a custom theme — `<ThemeScope>` over `resolveThemeScopeTokens`'s tokens plus the ambient base/accent,
//     so the §7a ink clamp judges against the surface the thumbnail actually lands on.
// CUSTOM CSS IS NEVER INJECTED HERE. A theme's `css` stays global owner CSS; the thumbnail shows the
// GOVERNED, clamped palette — which is also the only thing that can be shown honestly at 100px.
//
// IT IS NOT PROMOTED TO A SHARED CLIENT TIER, AND THAT IS A RULING, NOT AN ACCIDENT (#1152, 2026-09-05).
// The ruling SURVIVES #2447 — its INPUT changed. It was recorded as "it stays in `features/settings`"; that
// feature no longer exists (owner ruling 2026-09-19 folded it whole into `features/config`), so the file
// travelled with the Looks section it serves and the ruling's MECHANISM — one feature-local reader, no
// promotion to `#components`/`#lib` — is unchanged and is what the sentence now says. #920's cold
// contract asked for it to be reused in the character tab's `StartFromThemeField` menu, which
// `client-features-no-cross` forbids as a sideways import; the arms were "re-home it to a shared client
// tier" or "rule the strip sufficient". The STRIP won, so there is no second reader and no re-home: that
// door's payload is `cardEmbeddableSubset(theme.override)` and `ThemeSwatchStrip` paints `theme.override`,
// so depiction equals payload — whereas THIS surface deliberately does NOT paint a seed's override (see the
// provenance paragraph above), and mounting it on that door would make the picture disagree with what the
// pick delivers on exactly Hearth/Mocha/Light. Full receipt: `docs/design/config-revamp-design.md` §7.3,
// the "ONE theme-swatch atom" addendum. If a SECOND reader inside THIS feature ever appears, this file
// moves nowhere; only a CHARACTER-side one would re-open the tier question.

import type { Theme } from "@orb/contracts/theme";
import { Row, Stack } from "@orb/ui/layout";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { BASE_PALETTE_COLOR_SCHEME, BASE_PALETTE_VARS, dataThemeOf, resolveThemeScopeTokens } from "#lib";

/** The thumbnail's own comfortable tier — a card is a picture of a PALETTE, not of the viewer's density. */
const PREVIEW_DENSITY = "comfortable";

/** The room, painted entirely from whatever palette the wrapper put in scope. */
function MiniRoom(): ReactElement {
  return (
    <Stack className="h-full w-full justify-between bg-background p-tight" data-slot="theme-mini-room" gap="tight">
      {/* CARD + SHAPE + INK: the theme's own card tone, radius and hairline, with a foreground sample on
          it — the pair a theme exists to keep readable, and the one pair that clears 3:1 on both
          polarities without asking two ramp neighbours to do something they cannot. */}
      <Row align="center" className="min-w-0 gap-tight rounded-control border border-border bg-card p-tight">
        <Row className="h-1.5 min-w-0 flex-1 rounded-full bg-foreground" />
      </Row>
      {/* The quiet ink + the ACCENT — the one picked token no base derives (`accent-is-inherited-not-derived`). */}
      <Row align="center" className="min-w-0 gap-tight">
        <Row className="h-1.5 min-w-0 flex-1 rounded-full bg-muted-foreground" />
        <Row className="size-3 shrink-0 rounded-full bg-primary" />
      </Row>
    </Stack>
  );
}

export interface ThemeMiniSurfaceProps {
  readonly theme: Theme;
}

/** The thumbnail. Decorative — the cell's visible label carries the theme's identity. */
export function ThemeMiniSurface({ theme }: ThemeMiniSurfaceProps): ReactElement {
  const dataTheme = dataThemeOf(theme);
  if (theme.isSeed) {
    // A seed paints from its generated block ONLY — the block by attribute for a named palette, and the
    // BASE values replayed inline for Hearth, which has no block to name.
    return (
      <Stack
        className="h-full w-full"
        data-slot="theme-mini-surface"
        {...(dataTheme === null ? {} : { "data-theme": dataTheme })}
        style={dataTheme === null ? { ...BASE_PALETTE_VARS, colorScheme: BASE_PALETTE_COLOR_SCHEME } : undefined}
      >
        <MiniRoom />
      </Stack>
    );
  }
  const resolved = resolveThemeScopeTokens(theme, PREVIEW_DENSITY);
  return (
    <ThemeScope
      ambientAccent={resolved.ambientAccent}
      ambientBackground={resolved.ambientBackground}
      className="flex h-full w-full flex-col"
      tokens={resolved.tokens}
    >
      <Stack className="h-full w-full" data-slot="theme-mini-surface">
        <MiniRoom />
      </Stack>
    </ThemeScope>
  );
}

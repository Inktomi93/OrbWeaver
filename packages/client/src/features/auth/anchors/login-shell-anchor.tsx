// The /login containment PROVIDER (UI-Arch §4 — anchors own the box; the surface stays pure content):
// a full-viewport top-anchored card OUTSIDE the app shell (the /login route is a sibling of `/`, so the
// four-region frame never mounts here). Provides the named `@container` the login surface adapts to.
//
// The box now carries the BRAND SCENE: the settled web
// behind everything (per-mode via `LoginWeaveBackdrop` — half-woven on first-run, strand-out on the
// A9 handoff), the wordmark row above the card, the elevated card floating near the web's hub. The
// web is pre-session chrome: deployment default theme + OS scheme only (no user theme exists yet),
// token-driven so it recolors with the instance's brand.

import { Card } from "@orb/ui/card";
import { Container, Layer, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useEffect } from "react";
import { WeaveGlyph } from "#components";
import { testId } from "#lib";
import { DATA_THEME_ATTR } from "#state";
import { LoginWeaveBackdrop } from "../components/login-weave-backdrop.tsx";

export interface LoginShellAnchorProps {
  readonly children: ReactNode;
}

/** The wordmark glyph size (px) — between the rail's 24 and the boot veil's hero mark. */
const WORDMARK_GLYPH_PX = 26;

function useLoginColorScheme(): void {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute(DATA_THEME_ATTR);
    const preference = matchMedia("(prefers-color-scheme: light)");
    const apply = (): void => {
      if (preference.matches) {
        root.setAttribute(DATA_THEME_ATTR, "light");
      } else {
        root.removeAttribute(DATA_THEME_ATTR);
      }
    };
    apply();
    preference.addEventListener("change", apply);
    return (): void => {
      preference.removeEventListener("change", apply);
      if (previous === null) {
        root.removeAttribute(DATA_THEME_ATTR);
      } else {
        root.setAttribute(DATA_THEME_ATTR, previous);
      }
    };
  }, []);
}

/** The stable login card box: full-viewport web backdrop + wordmark + one `max-w-sm` card.
 *  @remarks The document never scrolls (`overflow: clip` on html/body), so this box is the scroll owner for a
 *  card taller than the window. The web shares one grid cell with the content and sticks to the top of it:
 *  it holds still while the card scrolls, and a wheel or thumb over it still chains to this scroller. A
 *  `fixed` web would chain to the unscrollable document instead and swallow the gesture. */
export function LoginShellAnchor({ children }: LoginShellAnchorProps): ReactElement {
  useLoginColorScheme();
  return (
    <Stack className="relative h-dvh overflow-y-auto bg-background text-foreground" data-testid={testId("loginPage")}>
      <Layer className="min-h-full shrink-0">
        <LoginWeaveBackdrop />
        <Stack align="center" justify="start" padding="section">
          {/* relative: the content column paints above the positioned web canvas. */}
          {/* The page's one landmark: the sign-in and join card is the content a screen reader jumps to. */}
          <Container name="login" role="main" className="relative w-full max-w-sm">
            <Stack gap="block">
              <Row align="center" justify="center" gap="row" aria-hidden={true} data-slot="brand-wordmark">
                {/* Decorative pair: the mark + name — the surface's <h1> carries the page's real name. The
                    data-slot carries the readability halo (client globals.css) for the near-white wordmark
                    over the live weave, where a bright strand behind a glyph drops worst-case contrast. */}
                <WeaveGlyph decorative={true} size={WORDMARK_GLYPH_PX} className="text-primary" />
                <Text as="span" voice="monogram">
                  orbweaver
                </Text>
              </Row>
              {/* ELEVATED: the login card is a floating island on an otherwise empty page — the one class
                  `--radius-card` + a shadow still belong to after D6 demoted them to elevated-only. */}
              <Card elevated={true}>{children}</Card>
            </Stack>
          </Container>
        </Stack>
      </Layer>
    </Stack>
  );
}

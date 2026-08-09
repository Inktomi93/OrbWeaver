// The /login containment PROVIDER (UI-Arch §4 — anchors own the box; the surface stays pure content):
// a full-viewport centered card OUTSIDE the app shell (the /login route is a sibling of `/`, so the
// four-region frame never mounts here). Provides the named `@container` the login surface adapts to.
//
// The box now carries the BRAND SCENE (docs/design/login-loading-screen.md §3/§9): the settled web
// behind everything (per-mode via `LoginWeaveBackdrop` — half-woven on first-run, strand-out on the
// A9 handoff), the wordmark row above the card, the elevated card floating near the web's hub. The
// web is pre-session chrome: deployment default theme + OS scheme only (no user theme exists yet),
// token-driven so it recolors with the instance's brand.

import { Card } from "@orb/ui/card";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { testId, WeaveGlyph } from "#lib";
import { LoginWeaveBackdrop } from "../components/login-weave-backdrop.tsx";

export interface LoginShellAnchorProps {
  readonly children: ReactNode;
}

/** The wordmark glyph size (px) — between the rail's 24 and the boot veil's hero mark. */
const WORDMARK_GLYPH_PX = 26;

/** The centered login card box: full-viewport web backdrop + wordmark + one `max-w-sm` card. */
export function LoginShellAnchor({ children }: LoginShellAnchorProps): ReactElement {
  return (
    <Stack
      align="center"
      justify="center"
      padding="section"
      className="relative min-h-dvh overflow-hidden bg-background text-foreground"
      data-testid={testId("loginPage")}
    >
      <LoginWeaveBackdrop />
      {/* relative: the content column stacks above the full-bleed web canvas. */}
      <Container name="login" className="relative w-full max-w-sm">
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
  );
}

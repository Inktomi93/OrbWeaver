// The /login containment PROVIDER (UI-Arch §4 — anchors own the box; the surface stays pure content):
// a full-viewport centered card OUTSIDE the app shell (the /login route is a sibling of `/`, so the
// four-region frame never mounts here). Provides the named `@container` the login surface adapts to.

import { Card } from "@orb/ui/card";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { testId } from "#lib";

export interface LoginShellAnchorProps {
  readonly children: ReactNode;
}

/** The centered login card box (full-viewport backdrop + one `max-w-sm` card). */
export function LoginShellAnchor({ children }: LoginShellAnchorProps): ReactElement {
  return (
    <Stack
      align="center"
      justify="center"
      padding="section"
      className="min-h-dvh bg-background text-foreground"
      data-testid={testId("loginPage")}
    >
      <Container name="login" className="w-full max-w-sm">
        <Card>{children}</Card>
      </Container>
    </Stack>
  );
}

// The sessions roster's containment PROVIDER (UI-Arch §4): the LIST pane's named container — the surface
// inside adapts to THIS box (docked side panel vs phone full-screen vs overlay), never the viewport.

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export function RefineryListAnchor({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <Container className="h-full" name="refinery-list">
      {children}
    </Container>
  );
}

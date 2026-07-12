// CT story for the float-portal theming acceptance (D44 §12.1 · defect #1) — lives in a helper module
// (not the .ct.tsx) so it can EXPORT a component (a test file may not export). Mirrors the app-shell
// wiring in miniature: a themed portal root INSIDE `<ThemeScope>`, fed to every float seal via
// `PortalContainerContext`, so an OPEN float popup portals into the themed node and inherits the
// override instead of `<body>`'s Hearth defaults. Rendered via React 19's bare `<Context value>` (the
// real context path, and not a `*Provider` tag the ui-primitive-structure CT clause would flag).

import { PortalContainerContext } from "@orb/ui/lib";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";

export function ThemedFloatScope({
  accent,
  children,
}: {
  readonly accent: string;
  readonly children: ReactNode;
}): ReactElement {
  const portalRef = useRef<HTMLDivElement>(null);
  return (
    <ThemeScope tokens={{ accent }}>
      <PortalContainerContext value={portalRef}>
        {children}
        <div ref={portalRef} data-slot="portal-root" />
      </PortalContainerContext>
    </ThemeScope>
  );
}

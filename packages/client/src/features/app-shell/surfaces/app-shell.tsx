import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

// FIRST-BOOT stand-in for the Phase-6 shell. The real app-shell is the four-region rail frame
// (RAIL | LIST | CONTENT | CONTEXT, UI-Arch §4.1) — the only viewport-@media site, built from this
// feature's surfaces/ + anchors/. This placeholder proves the entry → router → tokens → @orb/ui
// pipeline paints, and gets replaced as the shell is built. app-shell is the ONE feature exempt from the
// compose-only cage (it is the frame's painter), so raw elements + token utilities are legal here.
export function AppShell(): ReactElement {
  return (
    <Stack
      align="center"
      justify="center"
      gap="block"
      className="min-h-dvh bg-background text-foreground"
    >
      <h1 className="font-semibold text-foreground text-title">orbweaver</h1>
      <p className="text-label text-muted-foreground">
        the shell boots — router, tokens, and <code>@orb/ui</code> are live.
      </p>
    </Stack>
  );
}

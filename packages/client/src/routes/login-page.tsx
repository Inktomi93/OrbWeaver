import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

// STUB — the /login surface moves to features/auth once that feature is built; the beforeLoad
// reverse-gate (already-authed → redirect to /) lands with it (UI-Lib-TanStack-Router.md steal-list #2).
export function LoginPage(): ReactElement {
  return (
    <Stack
      align="center"
      justify="center"
      gap="block"
      className="min-h-dvh bg-background text-foreground"
    >
      <h1 className="font-semibold text-foreground text-title">sign in</h1>
      <p className="text-label text-muted-foreground">auth isn’t wired yet.</p>
    </Stack>
  );
}

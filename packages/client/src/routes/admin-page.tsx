import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

// STUB — the /admin/* surfaces (features/user-admin) land behind a beforeLoad requireOwner gate.
// PLAIN import for now: `lazyRouteComponent` (UI-Lib-TanStack-Router.md steal-list #4) only earns its
// keep once this is a real, heavy bundle worth splitting out of the shell — a placeholder isn't.
export function AdminPage(): ReactElement {
  return (
    <Stack
      align="center"
      justify="center"
      gap="block"
      className="min-h-dvh bg-background text-foreground"
    >
      <h1 className="font-semibold text-foreground text-title">admin</h1>
      <p className="text-label text-muted-foreground">admin surfaces aren’t built yet.</p>
    </Stack>
  );
}

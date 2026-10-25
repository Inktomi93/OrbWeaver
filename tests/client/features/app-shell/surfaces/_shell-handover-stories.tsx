import { AppShell } from "@orb/client/features/app-shell";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { useState } from "react";
import { RoutePending } from "#client/routes/route-pending.tsx";

/** The production shell, then the router's pending mark in its place, the way a pending route replaces the shell. */
export function ShellToPendingStory(): ReactElement {
  const [pending, setPending] = useState(false);
  return (
    <CtClientProviders>
      {pending ? (
        <RoutePending />
      ) : (
        <>
          <Button onClick={(): void => setPending(true)}>Hand over</Button>
          <AppShell />
        </>
      )}
    </CtClientProviders>
  );
}

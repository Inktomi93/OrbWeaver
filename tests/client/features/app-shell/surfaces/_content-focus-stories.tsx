// The production AppShell with two controls that ask it, as a feature's door does, to take focus to a section's content.
import { AppShell } from "@orb/client/features/app-shell";
import { requestShellContentFocus } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";

export function AppShellContentFocusStory(): ReactElement {
  return (
    <CtClientProviders>
      <AppShell />
      <Button className="fixed start-0 bottom-0 z-(--z-toast)" onClick={(): void => requestShellContentFocus("home")}>
        Focus the active content
      </Button>
      <Button className="fixed end-0 bottom-0 z-(--z-toast)" onClick={(): void => requestShellContentFocus("corpus")}>
        Focus another section's content
      </Button>
    </CtClientProviders>
  );
}

// The config member ANCHOR — the containment provider for an open collection member's editor (UI-Arch §4).
// The member surfaces (roster, regex, world info) adapt to the padded pane they are mounted in, so the box
// is declared here, at the one place the config content host mounts a collection's `detail`.

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export interface ConfigMemberAnchorProps {
  readonly children: ReactNode;
}

/** Provide the container box a collection member's editor surface consumes. */
export function ConfigMemberAnchor({ children }: ConfigMemberAnchorProps): ReactElement {
  return <Container>{children}</Container>;
}

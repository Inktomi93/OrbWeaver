import { BootVeil } from "@orb/client/features/app-shell";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

/** The production boot veil, mounted as `main.tsx` mounts it: above the providers, with no router. */
export function BootVeilStory(): ReactElement {
  return (
    <CtClientProviders>
      <BootVeil />
    </CtClientProviders>
  );
}

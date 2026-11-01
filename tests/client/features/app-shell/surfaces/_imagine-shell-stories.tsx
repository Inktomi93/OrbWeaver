import { AppShell } from "@orb/client/features/app-shell";
import type { ImagineSeed } from "@orb/client/state";
import { openImagine } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useEffect } from "react";

function OpenImagineOnMount({ seed }: { readonly seed: ImagineSeed }): null {
  useEffect(() => {
    openImagine(seed);
  }, [seed]);
  return null;
}

/** The production shell opening the imagine modal the way `/imagine` does, so its body sits in the real dialog. */
export function ImagineInShellStory({ seed }: { readonly seed: ImagineSeed }): ReactElement {
  return (
    <CtClientProviders>
      <OpenImagineOnMount seed={seed} />
      <AppShell />
    </CtClientProviders>
  );
}

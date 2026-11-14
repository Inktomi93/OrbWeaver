import type { ImagineSeed } from "@orb/client/state";
import { openImagine } from "@orb/client/state";
import { CtClientProviders, CtModalCommit } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

function SeededImagine({ seed }: { readonly seed: ImagineSeed }): ReactElement {
  useState(() => {
    openImagine(seed);
    return true;
  });
  return <CtModalCommit modalId="imagine" />;
}

/** The real modal commit opened on a slash-command seed. */
export function ImagineOptionsStory({ seed }: { readonly seed: ImagineSeed }): ReactElement {
  return (
    <CtClientProviders>
      <SeededImagine seed={seed} />
    </CtClientProviders>
  );
}

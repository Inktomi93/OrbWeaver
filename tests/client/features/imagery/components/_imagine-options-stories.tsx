import { imagineModal } from "@orb/client/features/imagery";
import type { ImagineSeed } from "@orb/client/state";
import { openImagine } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

function SeededImagine({ seed }: { readonly seed: ImagineSeed }): ReactElement {
  useState(() => {
    openImagine(seed);
    return true;
  });
  const { body } = imagineModal;
  if (typeof body !== "function") {
    throw new Error("The imagine modal must have a built body");
  }
  return body();
}

/** The real modal body opened on a slash-command seed. */
export function ImagineOptionsStory({ seed }: { readonly seed: ImagineSeed }): ReactElement {
  return (
    <CtClientProviders>
      <SeededImagine seed={seed} />
    </CtClientProviders>
  );
}

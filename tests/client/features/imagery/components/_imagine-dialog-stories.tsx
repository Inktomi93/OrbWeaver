import type { ImagineSeed } from "@orb/client/state";
import { openImagine } from "@orb/client/state";
import { CtClientProviders, ShellAmbientStory } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

/** The `imagine` modal opened on a seed over the production shell, so its body, submit and footer are the ones ModalHost draws. */
export function ImagineDialogStory({ seed }: { readonly seed: ImagineSeed }): ReactElement {
  // StrictMode runs this initializer twice, and a section write dismisses a content-scoped modal, so the open stays the only write.
  useState(() => {
    openImagine(seed);
    return true;
  });
  return (
    <CtClientProviders>
      <ShellAmbientStory />
    </CtClientProviders>
  );
}

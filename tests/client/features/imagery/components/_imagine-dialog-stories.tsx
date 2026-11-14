import { FlowDialog } from "@orb/client/components";
import { imagineModal } from "@orb/client/features/imagery";
import type { ImagineSeed } from "@orb/client/state";
import { openImagine } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

function SeededImagineDialog({ seed }: { readonly seed: ImagineSeed }): ReactElement {
  useState(() => {
    openImagine(seed);
    return true;
  });
  const { body, title, size } = imagineModal;
  if (typeof body !== "function") {
    throw new Error("The imagine modal must have a built body");
  }
  return (
    <FlowDialog bodyFocusTarget={true} bodyProps={{ tabIndex: -1 }} dismiss={{ at: "header", glyph: true }} open={true} size={size} title={title}>
      {body()}
    </FlowDialog>
  );
}

/** The registered imagine body inside the dialog frame, at the size, with the header dismiss, the shell's modal host gives it. */
export function ImagineDialogStory({ seed }: { readonly seed: ImagineSeed }): ReactElement {
  return (
    <CtClientProviders>
      <SeededImagineDialog seed={seed} />
    </CtClientProviders>
  );
}

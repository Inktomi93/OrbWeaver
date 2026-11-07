import type { ImageSubject } from "@orb/client/state";
import { openImageDetail } from "@orb/client/state";
import { CtClientProviders, ShellAmbientStory } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

/** The `imageDetail` modal opened on one image over the home section, so its provenance strip mounts. */
export function ImageDetailShellStory({ subject }: { readonly subject: ImageSubject }): ReactElement {
  // StrictMode runs this initializer twice, and a section write dismisses a content-scoped modal, so the open stays the only write.
  useState(() => {
    openImageDetail(subject);
    return true;
  });
  return (
    <CtClientProviders>
      <ShellAmbientStory />
    </CtClientProviders>
  );
}

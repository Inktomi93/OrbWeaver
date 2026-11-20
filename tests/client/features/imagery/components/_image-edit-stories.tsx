import type { ImageSubject } from "@orb/client/state";
import { openImageEdit } from "@orb/client/state";
import { CtClientProviders, ShellAmbientStory } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

/** The `imageEdit` modal opened on one image over the home section, the way the detail lightbox's Edit door opens it. */
export function ImageEditShellStory({ subject }: { readonly subject: ImageSubject }): ReactElement {
  // StrictMode runs this initializer twice, and a section write dismisses a content-scoped modal, so the open stays the only write.
  useState(() => {
    openImageEdit(subject);
    return true;
  });
  return (
    <CtClientProviders>
      <ShellAmbientStory />
    </CtClientProviders>
  );
}

import type { ImageSubject } from "@orb/client/state";
import { openImageDetail, setActiveSection } from "@orb/client/state";
import { CtClientProviders, ShellAmbientStory } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

/** The `imageDetail` modal opened on one image over the home section, so its provenance strip mounts. */
export function ImageDetailShellStory({ subject }: { readonly subject: ImageSubject }): ReactElement {
  useState(() => {
    setActiveSection("home");
    openImageDetail(subject);
    return true;
  });
  return (
    <CtClientProviders>
      <ShellAmbientStory />
    </CtClientProviders>
  );
}

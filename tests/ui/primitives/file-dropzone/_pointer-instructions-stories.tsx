import { CtIsolation } from "@orb/testkit/browser";
import { FileDropzone } from "@orb/ui/file-dropzone";
import type { ReactElement } from "react";

export function PointerInstructionsStory({ subject }: { readonly subject?: string }): ReactElement {
  return (
    <CtIsolation subject="File dropzone" isolates="The instruction line against the pointer class, without a dialog or an upload">
      <FileDropzone {...(subject === undefined ? {} : { subject })} />
    </CtIsolation>
  );
}

import { CtIsolation } from "@orb/testkit/browser";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** A dropzone with the given hint, in a pane of a given width. */
export function WrappingHintStory({ width, hint }: { readonly width: number; readonly hint: string }): ReactElement {
  return (
    <CtIsolation subject="File dropzone" isolates="Where the hint line breaks needs no dialog or upload">
      <Stack container={true} style={{ inlineSize: width }}>
        <FileDropzone accept=".zip,.png,.json" hint={hint} subject="a .zip backup or a character card" />
      </Stack>
    </CtIsolation>
  );
}

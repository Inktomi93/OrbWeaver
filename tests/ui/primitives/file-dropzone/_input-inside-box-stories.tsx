import { CtIsolation } from "@orb/testkit/browser";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

// The ceiling the Background field injects, so the zone paints the hint line it paints there.
const IMAGE_CEILING_BYTES = 5_000_000;

/** A dropzone in a pane of a given width, taking the same props the Background upload field gives it. */
export function NarrowPaneDropzoneStory({ width, error }: { readonly width: number; readonly error?: string }): ReactElement {
  return (
    <CtIsolation subject="File dropzone" isolates="The covering input's box against the zone's box, without the settings field around it">
      {/* The page's own inset, so a box reaching past the pane's edge is still on the screen. */}
      <Stack paddingInline="section">
        <Stack container={true} style={{ inlineSize: width }}>
          <FileDropzone accept="image/*" maxSizeBytes={IMAGE_CEILING_BYTES} {...(error === undefined ? {} : { error })} />
        </Stack>
      </Stack>
    </CtIsolation>
  );
}

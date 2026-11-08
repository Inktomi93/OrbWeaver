import { CtIsolation } from "@orb/testkit/browser";
import type { FileDropzoneRejection, FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import type { ReactElement } from "react";
import { useState } from "react";

/** One processed batch as the story logs it: the accepted file names, and each rejected name with the dropzone's reason. */
export interface DropBatch {
  readonly accepted: readonly string[];
  readonly rejected: readonly { readonly name: string; readonly reason: FileDropzoneRejection["reason"] }[];
}

function toBatch(result: FileDropzoneResult): DropBatch {
  return {
    accepted: result.accepted.map((file) => file.name),
    rejected: result.rejected.map((entry) => ({ name: entry.file.name, reason: entry.reason })),
  };
}

/** A dropzone whose every processed batch is written, as JSON, to a sibling `batches` log. */
export function DropAcceptStory({
  accept,
  multiple = false,
  disabled = false,
  loading = false,
  maxSizeBytes,
}: {
  readonly accept?: string;
  readonly multiple?: boolean;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly maxSizeBytes?: number;
}): ReactElement {
  const [batches, setBatches] = useState<readonly DropBatch[]>([]);
  return (
    <CtIsolation subject="File dropzone" isolates="Drag-and-drop and picker admission through the accept vocabulary, without a dialog or an upload">
      <FileDropzone
        aria-label="Sample dropzone"
        disabled={disabled}
        loading={loading}
        multiple={multiple}
        onFilesSelected={(result): void => setBatches((previous) => [...previous, toBatch(result)])}
        {...(accept === undefined ? {} : { accept })}
        {...(maxSizeBytes === undefined ? {} : { maxSizeBytes })}
      />
      <pre data-slot="batches">{JSON.stringify(batches)}</pre>
    </CtIsolation>
  );
}

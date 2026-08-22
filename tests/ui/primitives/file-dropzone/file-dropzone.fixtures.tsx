// Story wrapper for file-dropzone CT (CT mounts from a non-test module). Renders the accepted /
// rejected file NAMES into the DOM instead of handing the raw `File` objects back to the Node-side
// test — Playwright CT proxies prop callbacks across the browser/Node boundary, which only
// round-trips plain serializable data; a `File`'s properties (`name`/`size`) live on its prototype
// as accessors, so they DON'T survive that hop (confirmed empirically — R6). Observing the result
// through rendered DOM text is the correct pattern for any primitive whose callback carries a File.
import { FileDropzone } from "@orb/ui/file-dropzone";
import type { ReactElement } from "react";
import { useState } from "react";

export interface FileDropzoneHarnessProps {
  maxSizeBytes?: number;
  multiple?: boolean;
  /** The consumer-supplied accept vocabulary under test — the drop feeder must honour it, not just the picker dialog. */
  accept?: string;
}

export function FileDropzoneHarness({ maxSizeBytes, multiple = false, accept }: FileDropzoneHarnessProps): ReactElement {
  const [acceptedNames, setAcceptedNames] = useState<string[]>([]);

  return (
    <div>
      <ul data-testid="accepted-names">
        {acceptedNames.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <FileDropzone
        aria-label="Upload"
        multiple={multiple}
        {...(accept === undefined ? {} : { accept })}
        {...(maxSizeBytes === undefined ? {} : { maxSizeBytes })}
        onFilesSelected={({ accepted }): void => {
          setAcceptedNames(accepted.map((file) => file.name));
        }}
      />
    </div>
  );
}

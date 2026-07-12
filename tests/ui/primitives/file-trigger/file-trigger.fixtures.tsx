// Story wrapper for file-trigger CT (CT mounts from a non-test module). Renders the picked file
// NAMES into the DOM instead of handing the raw `File` objects back to the Node-side test —
// Playwright CT proxies prop callbacks across the browser/Node boundary, which only round-trips
// plain serializable data (the file-dropzone precedent, R6).
import { Button } from "@orb/ui/button";
import { FileTrigger } from "@orb/ui/file-trigger";
import type { ReactElement } from "react";
import { useState } from "react";

export interface FileTriggerHarnessProps {
  disabled?: boolean;
}

export function FileTriggerHarness({ disabled = false }: FileTriggerHarnessProps): ReactElement {
  const [names, setNames] = useState<string[]>([]);

  return (
    <div>
      <ul data-testid="picked-names">
        {names.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <FileTrigger
        accept="image/*"
        disabled={disabled}
        onFilesSelected={(files): void => setNames(files.map((file) => file.name))}
      >
        {({ open }): ReactElement => <Button onClick={open}>Replace portrait</Button>}
      </FileTrigger>
    </div>
  );
}

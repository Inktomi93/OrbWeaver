import type { ChangeEvent, ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { Button } from "#primitives/button";
import type { FileDropzoneResult } from "./file-dropzone";

export interface FolderPickerProps {
  /** Fires with the processed batch (split by the `maxSizeBytes` pre-check) when a folder is picked. */
  onFilesSelected?: (result: FileDropzoneResult) => void;
  /** Client-side per-file ceiling in bytes; omit to skip the pre-check (same contract as `FileDropzone`). */
  maxSizeBytes?: number;
  disabled?: boolean;
  loading?: boolean;
  /** The button intent — `secondary` by default so it reads as the alternative to the primary dropzone. */
  intent?: "primary" | "secondary" | "ghost";
  children: ReactNode;
}

/**
 * A whole-FOLDER picker: a Button that opens the OS directory dialog via a hidden `<input type="file">` with
 * `webkitdirectory` set imperatively (the attribute has no React typing). The picked `File`s carry a
 * `webkitRelativePath` — the caller uploads the tree. Drag-and-drop of a folder is NOT handled here (a plain
 * file input can't traverse a dropped directory); this is the click-to-pick affordance.
 */
export function FolderPicker({
  onFilesSelected,
  maxSizeBytes,
  disabled = false,
  loading = false,
  intent = "secondary",
  children,
}: FolderPickerProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (el !== null) {
      el.setAttribute("webkitdirectory", "");
      el.setAttribute("directory", "");
    }
  }, []);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const list = event.target.files;
    if (list === null) {
      return;
    }
    const accepted: File[] = [];
    const rejected: FileDropzoneResult["rejected"] = [];
    for (const file of Array.from(list)) {
      if (maxSizeBytes !== undefined && file.size > maxSizeBytes) {
        rejected.push({ file, reason: "size" });
      } else {
        accepted.push(file);
      }
    }
    onFilesSelected?.({ accepted, rejected });
    // Reset so re-picking the SAME folder still fires a change event.
    event.target.value = "";
  };

  // biome-ignore lint/nursery/useNullishCoalescing: a real boolean OR — both operands are plain booleans, so `??` (null/undefined only) would be wrong here (same call FileDropzone makes).
  const inert = disabled || loading;

  return (
    <>
      <Button intent={intent} loading={loading} disabled={inert} onClick={(): void => inputRef.current?.click()}>
        {children}
      </Button>
      <input hidden={true} multiple={true} onChange={handleChange} ref={inputRef} type="file" />
    </>
  );
}

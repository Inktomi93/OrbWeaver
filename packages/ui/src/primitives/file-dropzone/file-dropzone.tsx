import { Field as BaseField } from "@base-ui/react/field";
// The ONE byte-size formatter (kit) — this primitive spelled its own until databank's row subtitle and
// the per-chat rack made it a third consumer.
import { formatBytes } from "@orb/kit/strings";
import type { ChangeEvent, ComponentPropsWithRef, DragEvent, ReactElement } from "react";
import { useState } from "react";
import { AlertTriangle, Check, Icon, Upload } from "#primitives/icons";
import { Spinner } from "#primitives/spinner";
import { fileDropzoneVariants } from "./variants.ts";

/** A file dropped by the client-side `maxSizeBytes` pre-check (the only rejection reason today). */
export interface FileDropzoneRejection {
  file: File;
  reason: "size";
}

/** The outcome of one selection/drop batch, split by the size pre-check. */
export interface FileDropzoneResult {
  accepted: File[];
  rejected: FileDropzoneRejection[];
}

export interface FileDropzoneProps extends Omit<ComponentPropsWithRef<"input">, "type" | "onChange" | "value" | "defaultValue"> {
  /** Native `accept` filter for the file-picker dialog — does not gate a drop (browser behavior). */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Busy state: swaps the Upload glyph for a `<Spinner>` and inerts the input. Caller-driven, same shape as `Button.loading`. */
  loading?: boolean;
  /** Momentary success flash: a checkmark glyph + the success border token. Caller clears it — this primitive holds no timer. */
  success?: boolean;
  /** Client-side pre-check ceiling in bytes, injected by the consumer. Omit to skip the pre-check. */
  maxSizeBytes?: number;
  /** Fires with every processed batch, from either the native picker or a drop. */
  onFilesSelected?: (result: FileDropzoneResult) => void;
  /** Instructional copy inside the box. @defaultValue "Drag and drop, or click to browse" */
  instructions?: string;
  /**
   * Supplementary line under the instructions (e.g. accepted types). When omitted and
   * `maxSizeBytes` is set, auto-renders "Up to `{size}` per file" — an explicit `hint` overrides it.
   */
  hint?: string;
  className?: string;
}

function rejectionMessage(rejected: FileDropzoneRejection[], maxSizeBytes: number | undefined): string | undefined {
  if (rejected.length === 0) {
    return;
  }
  const limit = formatBytes(maxSizeBytes ?? 0);
  const [first] = rejected;
  if (rejected.length === 1 && first !== undefined) {
    return `${first.file.name} exceeds the ${limit} limit`;
  }
  return `${rejected.length} files exceed the ${limit} limit`;
}

interface FileDropzoneGlyphProps {
  readonly loading: boolean;
  readonly success: boolean;
  readonly slots: ReturnType<typeof fileDropzoneVariants>;
}

/** The content-stack glyph dispatch, split out to avoid a 3-way nested ternary in the render tree. */
function FileDropzoneGlyph({ loading, success, slots }: FileDropzoneGlyphProps): ReactElement {
  if (loading) {
    return <Spinner label="Uploading…" size="sm" />;
  }
  if (success) {
    return <Icon icon={Check} label="Uploaded" size="lg" />;
  }
  return <Icon className={slots.icon()} icon={Upload} size="lg" />;
}

/**
 * The file uploader — a real `<input type="file">` under the hood, rendered through Base UI
 * `Field.Control`. Keyboard/SR operation is the primary path: Tab focuses the real input,
 * Enter/Space/click opens the native OS file dialog. Drag-and-drop is progressive enhancement
 * on top, but it is handled EXPLICITLY (`handleDrop` reads `dataTransfer.files`) — never delegated to
 * the input's native file-accept, which the mandatory `preventDefault` cancels. Both feeders converge
 * on the one `processFiles` seam. `maxSizeBytes` is an injected ceiling checked client-side;
 * oversized files are reported via `rejected`, never silently dropped.
 */
export function FileDropzone({
  accept,
  multiple = false,
  disabled = false,
  loading = false,
  success = false,
  maxSizeBytes,
  onFilesSelected,
  instructions = "Drag and drop, or click to browse",
  hint,
  className,
  ...rest
}: FileDropzoneProps): ReactElement {
  const [dragOver, setDragOver] = useState(false);
  const [rejected, setRejected] = useState<FileDropzoneRejection[]>([]);
  const slots = fileDropzoneVariants();
  // biome-ignore lint/nursery/useNullishCoalescing: a real boolean OR — `disabled`/`loading` are both plain `boolean` (defaulted above), so `??` (which only falls through on null/undefined) would silently ignore an explicit `false` and isn't equivalent here.
  const inert = disabled || loading;

  // The ONE entry seam: both feeders (the native picker's `change` and an explicit drop) land here, so
  // the two paths cannot drift in what they accept or report.
  const processFiles = (files: readonly File[]): void => {
    if (files.length === 0) {
      return;
    }
    const accepted: File[] = [];
    const rejectedNow: FileDropzoneRejection[] = [];
    for (const file of files) {
      if (maxSizeBytes !== undefined && file.size > maxSizeBytes) {
        rejectedNow.push({ file, reason: "size" });
      } else {
        accepted.push(file);
      }
    }
    setRejected(rejectedNow);
    onFilesSelected?.({ accepted, rejected: rejectedNow });
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    processFiles(Array.from(event.target.files ?? []));
    // Reset so re-picking the SAME file still fires a change event (the FolderPicker call).
    event.target.value = "";
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragOver(true);
  };
  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
  };
  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragOver(false);
  };
  // A drop MUST be read out here — it can't be left to the covering input's native file-accept.
  // `preventDefault` is mandatory (without it the browser navigates away to the dropped file), and it
  // also cancels that native default action: measured in Chromium with a trusted CDP drag, the ancestor
  // sees `dataTransfer.files` but the input never fires `change`. That silent swallow was the bug —
  // dropping a character card did nothing at all, no request, no error. So take the bytes from
  // `dataTransfer.files` and feed the same seam the picker uses.
  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragOver(false);
    const dropped = Array.from(event.dataTransfer.files);
    // A single-file zone takes the first of a multi-file drop — the native picker can't hand back more
    // than one either, so the consumer's contract is identical on both feeders.
    processFiles(multiple ? dropped : dropped.slice(0, 1));
  };

  const resolvedHint = hint ?? (maxSizeBytes === undefined ? undefined : `Up to ${formatBytes(maxSizeBytes)} per file`);

  const errorMessage = rejectionMessage(rejected, maxSizeBytes);

  // This div is decorative drag-highlight chrome, not the interactive control — the real control
  // is the covering <input type="file">.
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: see comment above the return.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: see comment above the return.
    <div
      className={slots.root({ className })}
      data-disabled={disabled ? "" : undefined}
      data-drag-over={dragOver ? "" : undefined}
      data-loading={loading ? "" : undefined}
      data-slot="file-dropzone"
      data-success={success ? "" : undefined}
      onDragEnter={inert ? undefined : handleDragEnter}
      onDragLeave={inert ? undefined : handleDragLeave}
      onDragOver={inert ? undefined : handleDragOver}
      onDrop={inert ? undefined : handleDrop}
    >
      <BaseField.Control
        render={
          <input
            accept={accept}
            className={slots.input()}
            data-slot="file-dropzone-input"
            disabled={inert}
            multiple={multiple}
            onChange={handleChange}
            type="file"
            {...rest}
          />
        }
      />
      <div className={slots.content()} data-slot="file-dropzone-content">
        <FileDropzoneGlyph loading={loading} slots={slots} success={success} />
        <p className={slots.instructions()}>{instructions}</p>
        {resolvedHint === undefined ? null : <p className={slots.hint()}>{resolvedHint}</p>}
      </div>
      {errorMessage === undefined ? null : (
        <p className={slots.error()} data-slot="file-dropzone-error" role="alert">
          <Icon icon={AlertTriangle} label="Error" size="xs" />
          {errorMessage}
        </p>
      )}
    </div>
  );
}

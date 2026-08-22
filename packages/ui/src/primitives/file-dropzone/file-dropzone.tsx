import { Field as BaseField } from "@base-ui/react/field";
// The ONE byte-size formatter (kit) — this primitive spelled its own until databank's row subtitle and
// the per-chat rack made it a third consumer.
import { formatBytes } from "@orb/kit/strings";
import type { ChangeEvent, ComponentPropsWithRef, DragEvent, ReactElement } from "react";
import { useState } from "react";
import { AlertTriangle, Check, Icon, Upload } from "#primitives/icons";
import { WebSpinner } from "#primitives/spinner";
import { matchesAccept } from "./accept.ts";
import { fileDropzoneVariants } from "./variants.ts";

/** A file dropped by a client-side pre-check: outside the `accept` vocabulary, or over `maxSizeBytes`. */
export interface FileDropzoneRejection {
  file: File;
  reason: "size" | "type";
}

/** The outcome of one selection/drop batch, split by the `accept` + size pre-checks. */
export interface FileDropzoneResult {
  accepted: File[];
  rejected: FileDropzoneRejection[];
}

export interface FileDropzoneProps extends Omit<ComponentPropsWithRef<"input">, "type" | "onChange" | "value" | "defaultValue"> {
  /**
   * The accepted-file vocabulary, in HTML `accept` grammar (suffix tokens, `family/*`, exact MIMEs). It is
   * BOTH the native picker-dialog filter and this primitive's own per-file gate: the attribute alone only
   * narrows the OS dialog, so a drop — or a dialog switched to "All files" — would otherwise hand the
   * consumer bytes its `accept` excludes (#423). Omit to take anything.
   */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Busy state: swaps the Upload glyph for a `<WebSpinner>` and inerts the input. Caller-driven, same shape as `Button.loading`. */
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

/** The oversize half of a batch's refusal line (undefined when nothing was refused for size). */
function sizeRejectionMessage(oversize: FileDropzoneRejection[], maxSizeBytes: number | undefined): string | undefined {
  const limit = formatBytes(maxSizeBytes ?? 0);
  const [first] = oversize;
  if (first === undefined) {
    return;
  }
  return oversize.length === 1 ? `${first.file.name} exceeds the ${limit} limit` : `${oversize.length} files exceed the ${limit} limit`;
}

/** The wrong-type half. The accepted vocabulary itself is the consumer's `hint` line, rendered directly above. */
function typeRejectionMessage(wrongType: FileDropzoneRejection[]): string | undefined {
  const [first] = wrongType;
  if (first === undefined) {
    return;
  }
  return wrongType.length === 1 ? `${first.file.name} isn't an accepted file type` : `${wrongType.length} files aren't an accepted file type`;
}

/** One announced line per batch — both refusal reasons, so a mixed batch reports each rather than the louder one. */
function rejectionMessage(rejected: FileDropzoneRejection[], maxSizeBytes: number | undefined): string | undefined {
  const parts = [
    typeRejectionMessage(rejected.filter((entry) => entry.reason === "type")),
    sizeRejectionMessage(
      rejected.filter((entry) => entry.reason === "size"),
      maxSizeBytes,
    ),
  ].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(" · ");
}

interface FileDropzoneGlyphProps {
  readonly loading: boolean;
  readonly success: boolean;
  readonly slots: ReturnType<typeof fileDropzoneVariants>;
}

/** The content-stack glyph dispatch, split out to avoid a 3-way nested ternary in the render tree. */
function FileDropzoneGlyph({ loading, success, slots }: FileDropzoneGlyphProps): ReactElement {
  if (loading) {
    return <WebSpinner label="Uploading…" size="sm" />;
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
 * on the one `processFiles` seam, which applies BOTH pre-checks per file: the `accept` vocabulary
 * (`accept.ts` — the attribute alone only filters the OS dialog, so the drop feeder used to take
 * arbitrary bytes, #423) and the injected `maxSizeBytes` ceiling. Every refused file is reported via
 * `rejected` with its reason and announced inline — never silently dropped, and never as a wholesale
 * rejection of a mixed batch.
 *
 * This is a UX boundary, not a trust boundary: the upload routes re-check size and verify the claimed
 * mime against the byte signature server-side (`assets.store({ enforceMagic })`).
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
  // the two paths cannot drift in what they accept or report. Both pre-checks are PER FILE — a mixed batch
  // (a multi-select, a folder's worth of files) keeps everything admissible instead of being refused
  // wholesale, and each refusal is reported with its reason rather than silently dropped.
  const processFiles = (files: readonly File[]): void => {
    if (files.length === 0) {
      return;
    }
    const accepted: File[] = [];
    const rejectedNow: FileDropzoneRejection[] = [];
    for (const file of files) {
      if (!matchesAccept(file, accept)) {
        rejectedNow.push({ file, reason: "type" });
      } else if (maxSizeBytes !== undefined && file.size > maxSizeBytes) {
        rejectedNow.push({ file, reason: "size" });
      } else {
        accepted.push(file);
      }
    }
    setRejected(rejectedNow);
    // A single-file zone takes the first ADMISSIBLE file of a batch — the native picker can't hand back more
    // than one either, so the consumer's contract is identical on both feeders. Truncating here (after the
    // per-file checks) rather than at the drop is what keeps a `[readme.txt, backup.zip]` drop from being
    // decided by whichever file the file manager happened to list first.
    onFilesSelected?.({ accepted: multiple ? accepted : accepted.slice(0, 1), rejected: rejectedNow });
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
    processFiles(Array.from(event.dataTransfer.files));
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

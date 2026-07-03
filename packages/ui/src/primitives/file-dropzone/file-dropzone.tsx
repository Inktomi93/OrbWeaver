import { Field as BaseField } from "@base-ui/react/field";
import type { ChangeEvent, ComponentPropsWithRef, DragEvent, ReactElement } from "react";
import { useState } from "react";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve AlertTriangle/Check/Icon/Upload fine.
import { AlertTriangle, Check, Icon, Upload } from "#primitives/icons";
import { Spinner } from "#primitives/spinner";
import { fileDropzoneVariants } from "./variants";

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

export interface FileDropzoneProps
  extends Omit<ComponentPropsWithRef<"input">, "type" | "onChange" | "value" | "defaultValue"> {
  /** Native `accept` filter for the file-picker dialog — does not gate a drop (browser behavior). */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /**
   * Busy state (the 8-state contract, ui-package-design §5): swaps the Upload glyph for a
   * `<Spinner>` and inerts the input, for a caller uploading the selected batch (e.g. mid-request
   * to storage). A state, not a variant — caller-driven, same shape as `Button.loading`.
   */
  loading?: boolean;
  /** Momentary success flash (the 8-state contract): a checkmark glyph + the success border
   *  token. Caller clears it after its own delay — this primitive holds no timer. */
  success?: boolean;
  /**
   * Client-side pre-check ceiling in bytes. INJECTED by the consumer (databank's 20 MB default,
   * plugin install-from-zip, avatar uploads each pick their own) — never baked into the primitive.
   * Omit to skip the pre-check.
   */
  maxSizeBytes?: number;
  /** Fires with every processed batch, from either the native picker or a drop. */
  onFilesSelected?: (result: FileDropzoneResult) => void;
  /** Instructional copy inside the box. @default "Drag and drop, or click to browse" */
  instructions?: string;
  /**
   * Supplementary line under the instructions (e.g. accepted types). When omitted and
   * `maxSizeBytes` is set, auto-renders "Up to {size} per file" — an explicit `hint` overrides it.
   */
  hint?: string;
  className?: string;
}

// Pure byte-count formatting — NOT the Intl/locale kind of ui-side logic the house convention bans
// (status-chip's timestamp rule): this is plain decimal-scale arithmetic, not locale-sensitive.
const BYTES_PER_UNIT = 1024;
const DECIMAL_PRECISION = 10;

function formatBytes(bytes: number): string {
  if (bytes < BYTES_PER_UNIT) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= BYTES_PER_UNIT;
    unitIndex += 1;
  } while (value >= BYTES_PER_UNIT && unitIndex < units.length - 1);
  const rounded = Math.round(value * DECIMAL_PRECISION) / DECIMAL_PRECISION;
  return `${rounded} ${units[unitIndex] ?? "GB"}`;
}

function rejectionMessage(
  rejected: FileDropzoneRejection[],
  maxSizeBytes: number | undefined,
): string | undefined {
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

/**
 * The content-stack glyph dispatch, split out from `FileDropzone` purely to avoid a 3-way nested
 * ternary in the render tree (biome `noNestedTernary`) and keep `FileDropzone` itself under the
 * cognitive-complexity ceiling — it carries no state of its own.
 */
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
 * The file uploader — a REAL `<input type="file">` under the hood, rendered through Base UI
 * `Field.Control` exactly like `Textarea` (label association + `aria-describedby` + `data-invalid`
 * flow automatically inside a `<Field>`; degrades to a plain control standalone). Keyboard/SR
 * operation is the PRIMARY path: Tab focuses the real input, Enter/Space/click opens the native
 * OS file dialog — no custom widget stands in for it.
 *
 * Drag-and-drop is progressive enhancement ONLY, layered on top of that same input: the input is
 * the topmost, full-box element (`absolute inset-0 opacity-0`), and modern browsers already accept
 * a drop directly on a file input — it sets `.files` and fires a native `change` event, so no
 * `DataTransfer` plumbing lives here. The drag handlers exist SOLELY to toggle the `data-drag-over`
 * highlight; if JS never ran, clicking still opens the native picker.
 *
 * `maxSizeBytes` is an injected ceiling (no default) checked client-side on every batch — oversized
 * files are reported via `rejected` (never silently dropped) and surfaced inline.
 *
 * `loading`/`success` (the 8-state contract, ui-package-design §5) swap the Upload glyph for a
 * `<Spinner>` / a checkmark and inert the input+drop handlers — caller-driven states (the caller
 * owns the actual upload request); this primitive holds no timer for clearing `success`.
 *
 * Usage: `<Field label="Avatar"><FileDropzone accept="image/*" maxSizeBytes={20_000_000}
 *   onFilesSelected={({ accepted }) => upload(accepted[0])} /></Field>`
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

  const processFiles = (list: FileList | null): void => {
    if (list === null) {
      return;
    }
    const accepted: File[] = [];
    const rejectedNow: FileDropzoneRejection[] = [];
    for (const file of Array.from(list)) {
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
    processFiles(event.target.files);
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
  // The native input underneath already handled the drop (browser-native: a file dropped on an
  // <input type="file"> sets `.files` + fires `change`, landing in `handleChange` above) — this
  // handler only resets the highlight.
  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragOver(false);
  };

  const resolvedHint =
    hint ??
    (maxSizeBytes === undefined ? undefined : `Up to ${formatBytes(maxSizeBytes)} per file`);

  const errorMessage = rejectionMessage(rejected, maxSizeBytes);

  // This div is decorative drag-highlight chrome, not the interactive control — the REAL control
  // is the covering <input type="file"> (a real, focusable, keyboard-operable form element). The
  // drag listeners exist SOLELY to toggle the visual data-drag-over highlight (progressive
  // enhancement); no functionality or a11y semantics live on this element.
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

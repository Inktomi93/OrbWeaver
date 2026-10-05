import { Field as BaseField } from "@base-ui/react/field";
// The ONE byte-size formatter (kit) — this primitive spelled its own until databank's row subtitle and
// the per-chat rack made it a third consumer.
import { formatBytes } from "@orb/kit/strings";
import type { ChangeEvent, ComponentPropsWithRef, DragEvent, MouseEvent, ReactElement } from "react";
import { useId, useState } from "react";
import { useFieldLabelled } from "#primitives/field";
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
  /** Additional per-file type admission shared by picker and drop. Native accept keeps its HTML OR grammar. */
  isFileAccepted?: (file: File) => boolean;
  multiple?: boolean;
  disabled?: boolean;
  /**
   * Busy state: swaps the Upload glyph for a `<WebSpinner>` and inerts the input. Caller-driven, same shape as
   * `Button.loading`. The input stays focusable (`aria-disabled` + `aria-busy`, activation cancelled), because a
   * native `disabled` drops a keyboard user's focus out of the surrounding dialog for the whole upload.
   */
  loading?: boolean;
  /** Momentary success flash: a checkmark glyph + the success border token. Caller clears it — this primitive holds no timer. */
  success?: boolean;
  /** The consumer's own refusal (a server refusal, a failed follow-up step), shown on this primitive's error
   *  line after its own type and size refusals, so a zone says every refusal in one place and one style. */
  error?: string | undefined;
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

/** One announced line per batch — both refusal reasons, so a mixed batch reports each rather than the louder
 *  one — followed by the consumer's own refusal, if any. */
function rejectionMessage(rejected: FileDropzoneRejection[], maxSizeBytes: number | undefined, consumerError: string | undefined): string | undefined {
  const parts = [
    typeRejectionMessage(rejected.filter((entry) => entry.reason === "type")),
    sizeRejectionMessage(
      rejected.filter((entry) => entry.reason === "size"),
      maxSizeBytes,
    ),
    consumerError,
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return parts.length === 0 ? undefined : parts.join(" · ");
}

/** The three sources that can name the real file input, most specific first — see {@link nameAttributes}. */
interface FileDropzoneNameSources {
  readonly ariaLabel: string | undefined;
  readonly ariaLabelledBy: string | undefined;
  /** An ancestor `<Field>` has already wired `aria-labelledby` to its label (`useFieldLabelled`). */
  readonly fieldLabelled: boolean;
  readonly instructions: string;
  readonly instructionsId: string;
}

/**
 * THE INPUT NAMES ITSELF ONLY WHEN NOBODY ELSE DOES (#1660).
 *
 * The real `<input type="file">` is `opacity-0` over the whole box, so the pixels said this primitive's
 * instruction line while the ACCESSIBLE NAME was the UA's own "Choose File" — a screen-reader user met a
 * browser default on every import dialog, in a house that writes all of its own copy.
 *
 * The fallback is `aria-labelledby` at the instruction NODE, never `aria-label={instructions}`: a second
 * copy of a string already in the DOM is a drift generator, and WCAG 2.5.3 holds by construction when the
 * name IS the visible line rather than a twin of it.
 *
 * It is a FALLBACK, and the precedence is the point:
 *   1. the caller's own `aria-labelledby` / `aria-label` (the two plugin cards, the backup importer);
 *   2. an ancestor `<Field>`, whose label Base UI has already wired through that SAME attribute — the
 *      bound avatar / background / databank fields, whose label an unconditional self-name would shadow;
 *   3. this primitive's own instruction line.
 * `FileTrigger`'s answer (input `aria-hidden`, the caller owns a labelled trigger) cannot transfer here:
 * in a dropzone the input IS the only operable control, so it can never leave the accessibility tree.
 *
 * An EMPTY `instructions` gets no fallback — there is no text to point at, and an `aria-labelledby`
 * resolving to an empty node computes an EMPTY name, which is worse than the UA default. The one live
 * caller doing that (`composer-utility-menu`'s off-screen picker) is `aria-hidden` anyway.
 *
 * RETURNS A CONDITIONAL OBJECT, never `aria-labelledby={maybeUndefined}`. Base UI merges the render
 * element's props over its own with a `for…in` assignment (`merge-props/mergeProps.js` `mutablyMergeInto`)
 * and JSX materializes `attr={undefined}` as a PRESENT key, so writing the attribute unconditionally
 * OVERWRITES `Field.Control`'s own `labelId` with `undefined`.
 *
 * WHAT THAT COSTS IS THE ATTRIBUTE, NOT THE NAME — stated precisely because the first writing of this
 * paragraph overstated it and #1679 measured the difference. `Field.Label` defaults to `nativeLabel`, so it
 * ALSO emits a real `<label for>` (`internals/labelable-provider/useLabel.js` returns
 * `htmlFor: resolvedControlId` when `native`); with the attribute clobbered the computed name still
 * resolves through that label, and every accname assertion stays green. The conditional is still right, and
 * for a reason that survives the correction: `aria-labelledby` is Base UI's OWN wiring, and the native
 * label is not always there to catch the fall — a `Field.Label` given a non-`<label>` `render`, or
 * `nativeLabel={false}`, drops `htmlFor` and leaves the attribute as the only thing naming this input.
 * Relying on the fallback would be relying on an accident. Pinned as an ATTRIBUTE assertion in both CTs.
 */
function nameAttributes(sources: FileDropzoneNameSources): { "aria-label"?: string; "aria-labelledby"?: string } {
  const { ariaLabel, ariaLabelledBy, fieldLabelled, instructions, instructionsId } = sources;
  if (ariaLabelledBy !== undefined) {
    return { "aria-labelledby": ariaLabelledBy };
  }
  if (ariaLabel !== undefined) {
    return { "aria-label": ariaLabel };
  }
  return fieldLabelled || instructions === "" ? {} : { "aria-labelledby": instructionsId };
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
  isFileAccepted,
  multiple = false,
  disabled = false,
  loading = false,
  success = false,
  maxSizeBytes,
  error,
  onFilesSelected,
  instructions = "Drag and drop, or click to browse",
  hint,
  className,
  // BOTH name attributes are destructured OUT of `rest` ON PURPOSE — `nameAttributes` composes them
  // explicitly instead of letting them ride the spread. Left in `rest` they would be uncombinable: JSX
  // later-wins, so a caller's `aria-label` would sit AFTER the fallback `aria-labelledby` and lose to it
  // under the accname spec, silently renaming three live plugin/backup dropzones. This is the
  // `ui-accname-survives-spread` gate's second sanctioned shape.
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...rest
}: FileDropzoneProps): ReactElement {
  const [dragOver, setDragOver] = useState(false);
  const [rejected, setRejected] = useState<FileDropzoneRejection[]>([]);
  const slots = fileDropzoneVariants();
  const instructionsId = useId();
  const fieldLabelled = useFieldLabelled();
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
      if (!matchesAccept(file, accept) || (isFileAccepted !== undefined && !isFileAccepted(file))) {
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

  // A busy input keeps its focus but opens no file dialog: the click (which Enter and Space also fire) is cancelled.
  const handleClick = (event: MouseEvent<HTMLInputElement>): void => {
    if (loading) {
      event.preventDefault();
    }
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

  const nameProps = nameAttributes({ ariaLabel, ariaLabelledBy, fieldLabelled, instructions, instructionsId });

  const errorMessage = rejectionMessage(rejected, maxSizeBytes, error);

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
            {...nameProps}
            aria-busy={loading ? true : undefined}
            aria-disabled={loading ? true : undefined}
            className={slots.input()}
            data-slot="file-dropzone-input"
            disabled={disabled}
            multiple={multiple}
            onChange={handleChange}
            onClick={handleClick}
            type="file"
            {...rest}
          />
        }
      />
      <div className={slots.content()} data-slot="file-dropzone-content">
        <FileDropzoneGlyph loading={loading} slots={slots} success={success} />
        <p className={slots.instructions()} id={instructionsId}>
          {instructions}
        </p>
        {resolvedHint === undefined ? null : <p className={slots.hint()}>{resolvedHint}</p>}
      </div>
      {errorMessage === undefined ? null : (
        <p className={slots.error()} data-slot="file-dropzone-error" role="alert">
          <Icon className={slots.errorIcon()} icon={AlertTriangle} label="Error" size="xs" />
          <span className={slots.errorText()}>{errorMessage}</span>
        </p>
      )}
    </div>
  );
}

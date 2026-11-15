// The LIST-hub preset import — the ONE band import dialog (redesign §16.1 / G6), one door for both formats a preset
// file arrives in: an orbweaver preset export or a SillyTavern Chat Completion preset. The dialog parses nothing. On
// pick it sends the file to `preset.previewFile`, which reads it with the import's own parse and dry-runs the import,
// and it shows that answer; on confirm the same file goes to `preset.importFile`. So the summary states what the run
// does, a SillyTavern preset's own regex scripts included, and a bad file's reason is the server's sentence.

import type { PresetFilePreview } from "@orb/contracts/preset";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Icon, TriangleAlert } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { FormDialog, MutedLine } from "#components";
import { PRESET_IMPORT_ALREADY_HELD, PRESET_IMPORT_NAME, PRESET_IMPORT_TITLE, presetImportAddedSections } from "../lib/preset-names.ts";

/** The file the import sends, as the user picked it. */
export interface PresetFileInput {
  readonly fileText: string;
  readonly fileName: string;
}

type ReadyPreview = Extract<PresetFilePreview, { ok: true }>;

/** A thrown value's own sentence — the detail the read failure quotes rather than paraphrases. */
function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export interface PresetImportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** What importing the file does, from `preset.previewFile`. */
  readonly onPreview: (file: PresetFileInput) => Promise<PresetFilePreview>;
  /** Send the file to `preset.importFile`. Resolves to the server's error message, or null when the import landed
   *  (the verb reports a malformed file as an outcome, never a throw). */
  readonly onImport: (file: PresetFileInput) => Promise<string | null>;
  readonly busy: boolean;
}

/** The preset import dialog: drop → the server's preview of the import → commit. */
export function PresetImportDialog({ open, onOpenChange, onPreview, onImport, busy }: PresetImportDialogProps): ReactElement {
  const [picked, setPicked] = useState<{ readonly file: PresetFileInput; readonly preview: ReadyPreview } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Which file selection owns this dialog — bumped per pick, checked before any write (see `onFile`). */
  const pickToken = useRef(0);

  const reset = (): void => {
    setPicked(null);
    setError(null);
  };

  const onFile = (chosen: File): void => {
    reset();
    // EVERY PICK GETS A TOKEN, AND ONLY THE CURRENT ONE MAY WRITE (#1502). The read and the preview are promises per
    // selection with no cancellation: pick a large file, change your mind and pick a small one, and the two race —
    // LAST TO RESOLVE wins, which is not the same thing as LAST PICKED. The dialog would then summarize (and, on
    // confirm, IMPORT) a file the user had already replaced. The token is a ref rather than state because the
    // comparison happens inside a resolved promise, where a state read would be the stale capture.
    const token = pickToken.current + 1;
    pickToken.current = token;
    void chosen
      .text()
      .then(async (fileText) => {
        const file = { fileText, fileName: chosen.name };
        const preview = await onPreview(file);
        if (pickToken.current !== token) {
          return; // a later pick already owns this dialog
        }
        if (preview.ok) {
          setPicked({ file, preview });
        } else {
          setError(preview.error);
        }
      })
      .catch((cause: unknown) => {
        if (pickToken.current !== token) {
          return; // a superseded pick's failure is not this dialog's story
        }
        setError(`That file couldn't be read. (${reasonOf(cause)})`);
      });
  };

  const onConfirm = (): void => {
    if (picked === null) {
      return;
    }
    setError(null);
    onImport(picked.file)
      .then((failure) => {
        // A rejected file keeps the dialog open with the SERVER'S reason — the parse lives there.
        setError(failure);
      })
      .catch(() => setError("Import failed: try the file again."));
  };

  return (
    <FormDialog
      closeButton={true}
      // The outcome, not the mechanism: what a user needs before committing is what happens to their library.
      // An import never edits an owned preset (D290). The summary below repeats no part of this line.
      description="Pick an orbweaver preset export or a SillyTavern Chat Completion preset (.json). A preset equal to one you have is already in your library; a different one with a name you use is added under a new name."
      onOpenChange={(next): void => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
      open={open}
      submit={{ label: PRESET_IMPORT_NAME, disabled: picked === null || busy, onSubmit: onConfirm }}
      title={PRESET_IMPORT_TITLE}
    >
      <Stack gap="block">
        {/* NO `hint` (side-eye F-10): "orbweaver preset exports and SillyTavern Chat Completion presets"
            was the dialog description's first clause, printed a second time two lines below it. */}
        <FileDropzone
          accept="application/json,.json"
          subject="a preset .json"
          onFilesSelected={(result): void => {
            const first = result.accepted[0];
            if (first !== undefined) {
              onFile(first);
            }
          }}
        />

        {error !== null ? (
          <Row align="start" gap="field">
            <Icon icon={TriangleAlert} size="sm" tone="destructive" />
            <Text cap="prose" prose={true} voice="label">
              {error}
            </Text>
          </Row>
        ) : null}

        {picked === null ? null : <ImportSummary preview={picked.preview} />}
      </Stack>
    </FormDialog>
  );
}

/** The pre-commit summary: the server's preview of what the import does. */
function ImportSummary({ preview }: { readonly preview: ReadyPreview }): ReactElement {
  const { format, name, inLibrary, sectionCount, regexScripts, addedSections } = preview;
  return (
    <Section kicker="Ready to import">
      <Text cap="prose" prose={true} voice="label">
        {format === "orbweaver"
          ? `orbweaver preset export: "${name}".`
          : `SillyTavern preset "${name}": ${sectionCount} section${sectionCount === 1 ? "" : "s"}.`}
      </Text>
      {inLibrary ? <MutedLine>{PRESET_IMPORT_ALREADY_HELD}</MutedLine> : null}
      {regexScripts === 0 ? null : (
        <MutedLine>
          {regexScripts === 1
            ? "1 regex script comes with it and is attached to the preset."
            : `${regexScripts} regex scripts come with it and are attached to the preset.`}
        </MutedLine>
      )}
      {addedSections.length === 0 ? null : <MutedLine>{presetImportAddedSections(addedSections)}</MutedLine>}
      {format === "orbweaver" ? null : <LeftOut leftOut={preview.leftOut} />}
    </Section>
  );
}

/** The SillyTavern fields with no orbweaver home (reported, never silently lost). */
function LeftOut({ leftOut }: { readonly leftOut: ReadyPreview["leftOut"] }): ReactElement {
  if (leftOut.length === 0) {
    return <MutedLine>Everything mapped: nothing was dropped.</MutedLine>;
  }
  return (
    <Stack gap="field">
      <Text voice="gloss">These SillyTavern fields have no orbweaver home and were left out:</Text>
      {leftOut.map((field) => (
        <Text key={field.field} voice="gloss">
          <code>{field.field}</code>: {field.reason}
        </Text>
      ))}
    </Stack>
  );
}

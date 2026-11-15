// The LIST-hub preset import — the ONE band import dialog (redesign §16.1 / G6), one door for both formats a preset
// file arrives in: an orbweaver preset export or a SillyTavern Chat Completion preset. The dialog parses nothing. On
// pick it sends the file to `preset.previewFile`, which reads it with the import's own parse and dry-runs the import,
// and it shows that answer; on confirm the same file goes to `preset.importFile`. So the summary states what the run
// does (the prompts and how many are on, the samplers and limits, a SillyTavern preset's own regex scripts included),
// and a bad file's reason is the server's sentence.

import type { PresetFilePreview } from "@orb/contracts/preset";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Icon, TriangleAlert } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ScrollArea } from "@orb/ui/scroll-area";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { FormDialog, MutedLine } from "#components";
import {
  PRESET_IMPORT_ALREADY_HELD,
  PRESET_IMPORT_CLAMPED_HEADING,
  PRESET_IMPORT_DESCRIPTION,
  PRESET_IMPORT_DROPPED_HEADING,
  PRESET_IMPORT_DROPPED_REGION_NAME,
  PRESET_IMPORT_NAME,
  PRESET_IMPORT_NOTHING_DROPPED,
  PRESET_IMPORT_PICK_ANOTHER,
  PRESET_IMPORT_TITLE,
  presetImportAddedSections,
  presetImportCarried,
  presetImportClamped,
  presetImportLead,
  presetImportScriptsComing,
  presetImportScriptsRefused,
} from "../lib/preset-names.ts";

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
  /** The picked file's name from the moment it is picked, so the zone names it while its preview is still on the way. */
  const [chosenName, setChosenName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Which file selection owns this dialog — bumped per pick, checked before any write (see `onFile`). */
  const pickToken = useRef(0);

  const reset = (): void => {
    setPicked(null);
    setChosenName(null);
    setError(null);
  };

  const onFile = (chosen: File): void => {
    reset();
    setChosenName(chosen.name);
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
      description={PRESET_IMPORT_DESCRIPTION}
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
        {/* NO `hint` before a pick (side-eye F-10): "orbweaver preset exports and SillyTavern Chat Completion presets"
            was the dialog description's first clause, printed a second time two lines below it. After a pick the
            zone names the file, so the person can tell which file the summary below describes. */}
        <FileDropzone
          accept="application/json,.json"
          {...(chosenName === null ? { subject: "a preset .json" } : { instructions: chosenName, hint: PRESET_IMPORT_PICK_ANOTHER })}
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
  const { format, name, inLibrary, sectionCount, enabledCount, samplerCount, limitCount, regexScripts, refusedScripts, addedSections, clamped } = preview;
  // The lead counts the file's own prompts. The import switches on each prompt it adds, so they come off both totals and
  // the line that names them carries the rest.
  const ownPrompts = sectionCount - addedSections.length;
  const ownEnabled = enabledCount - addedSections.length;
  return (
    <Section kicker="Ready to import">
      <Text cap="prose" prose={true} voice="label">
        {presetImportLead(format === "sillyTavern", name, ownPrompts, ownEnabled)}
      </Text>
      <MutedLine>{presetImportCarried(samplerCount, limitCount)}</MutedLine>
      {inLibrary ? <MutedLine>{PRESET_IMPORT_ALREADY_HELD}</MutedLine> : null}
      {addedSections.length === 0 ? null : <MutedLine>{presetImportAddedSections(addedSections)}</MutedLine>}
      {regexScripts === 0 ? null : <MutedLine>{presetImportScriptsComing(regexScripts)}</MutedLine>}
      {refusedScripts.length === 0 ? null : <MutedLine>{presetImportScriptsRefused(refusedScripts.length)}</MutedLine>}
      {format === "orbweaver" ? null : <Clamped clamped={clamped} />}
      {format === "orbweaver" ? null : <LeftOut clamped={clamped.length > 0} leftOut={preview.leftOut} />}
    </Section>
  );
}

/** The values the import brought into range: imported, so they are not among the settings left out. */
function Clamped({ clamped }: { readonly clamped: ReadyPreview["clamped"] }): ReactElement | null {
  if (clamped.length === 0) {
    return null;
  }
  return (
    <Stack gap="field">
      <Text voice="gloss">{PRESET_IMPORT_CLAMPED_HEADING}</Text>
      {clamped.map(({ field, sent, landedAs }) => (
        <Text key={field} voice="gloss">
          <code>{field}</code>: {presetImportClamped(sent, landedAs)}
        </Text>
      ))}
    </Stack>
  );
}

/** The SillyTavern settings with no equivalent here (reported, never silently lost), under one heading. The list is the
 *  one part of the summary that grows with the file, so it scrolls in a region of its own that shows its scrollbar: the
 *  sentences above it are never cut by the dialog's own scroll. */
function LeftOut({ leftOut, clamped }: { readonly leftOut: ReadyPreview["leftOut"]; readonly clamped: boolean }): ReactElement | null {
  if (leftOut.length === 0) {
    // A value brought into range is a change, so "everything came across" is not said beside one.
    return clamped ? null : <MutedLine>{PRESET_IMPORT_NOTHING_DROPPED}</MutedLine>;
  }
  return (
    <Stack gap="field">
      <Text voice="gloss">{PRESET_IMPORT_DROPPED_HEADING}</Text>
      <ScrollArea maxHeight="scrollSm" viewportProps={{ role: "region", "aria-label": PRESET_IMPORT_DROPPED_REGION_NAME }} wrapContent={true}>
        <Stack gap="field">
          {leftOut.map((field) => (
            <Text key={field.field} voice="gloss">
              <code>{field.field}</code>: {field.reason}
            </Text>
          ))}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}

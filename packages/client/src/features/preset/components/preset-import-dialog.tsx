// The LIST-hub preset import — the ONE band import dialog (redesign §16.1 / G6), two arms behind one door.
// Pick a `.json` with `FileDropzone`; the FORMAT is SNIFFED from the parsed JSON's `schemaKind`, never asked
// of the user (a second dialog, or a format picker, would be a second home for one job):
//
//   · `orb.preset`  → the ORB-NATIVE arm: the file text goes to `preset.importFile`, the thin door over the
//     bundle's own `ImportPreset` verb. Its collision rule travels with it and the dialog STATES it before
//     the commit — a same-named preset is MERGED in place, else created — because "import" silently
//     overwriting a preset the owner still wants is the one outcome this door must not surprise anyone with.
//     The server strict-parses and reports a bad file as an OUTCOME, so its error lands in this dialog.
//   · anything else → the SillyTavern arm: parsed client-side by `tryImportStChatCompletionPreset` (the
//     TYPED outcome — #1580: the reader's "I never claimed this" and "I claimed it and refused it" are two
//     different answers to the owner, and one Error could not carry the difference), with the dropped-field
//     report, then created via `preset.create`.
//
// Neither arm re-derives serde: the orb arm ships the file's own bytes to the one import verb, and the ST
// arm is the landed browser-side mapper.

import type { StDroppedField, StImportOutcome, StImportResult } from "@orb/contracts/preset";
import { PRESET_SCHEMA_KIND, tryImportStChatCompletionPreset } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { FormDialog } from "#components";

/** The `.json` extension, stripped off the picked filename to seed the preset name (ST arm only — an
 *  orb.preset file carries its own name, and that name IS the merge key). */
const JSON_EXT = /\.json$/i;

/** A parsed-and-ready import, by arm: the orb file's raw text + its declared name, or the ST mapper's
 *  validated config + friendly base name + dropped-field report. */
type ParsedImport =
  | { readonly arm: "orb"; readonly name: string; readonly fileText: string }
  | { readonly arm: "st"; readonly name: string; readonly result: StImportResult };

/** Read `schemaKind` off an unknown parse without narrowing the whole file — the envelope is the server's
 *  to validate; this only picks the arm. */
function isOrbPresetFile(parsed: unknown): boolean {
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) && (parsed as Record<string, unknown>)["schemaKind"] === PRESET_SCHEMA_KIND;
}

/** The door's sentence for each of the ST reader's TWO refusals (#1580). Split because they are different
 *  answers to the owner: the reader that claimed nothing leaves both arms ruled out (F-10 — the ST parser
 *  must not speak for the whole door, since a malformed orb file lands in that same arm), while the reader
 *  that claimed the file and then refused it must SAY it recognised the format, or the copy denies the very
 *  thing the quoted reason names (#1390's defect, one level deeper). */
function stRefusalMessage(outcome: Extract<StImportOutcome, { ok: false }>): string {
  return outcome.recognised
    ? `Recognised as a SillyTavern preset, refused: ${outcome.reason}`
    : `orbweaver couldn't import this file. It isn't an orbweaver preset export, and the SillyTavern reader stopped: ${outcome.reason}`;
}

/** A thrown value's own sentence — the detail every failure arm below quotes rather than paraphrases. */
function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** The name an `orb.preset` file declares — the merge key the dialog names in its summary. Falls back to
 *  the verb's own default for a nameless file, so the copy can't promise a name the server won't use. */
function orbFileName(parsed: unknown): string {
  const raw = (parsed as Record<string, unknown>)["name"];
  return typeof raw === "string" && raw.trim().length > 0 ? raw : "Imported preset";
}

export interface PresetImportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Create an ST-imported preset — the surface wires `preset.create` and opens the result. */
  readonly onImportSt: (input: { name: string; config: StImportResult["config"] }) => void;
  /** Send an orb-native file to `preset.importFile`. Resolves to the server's error message, or null when
   *  the import landed (the verb reports a malformed file as an outcome, never a throw). */
  readonly onImportOrb: (fileText: string) => Promise<string | null>;
  readonly busy: boolean;
}

/** The preset import dialog: drop → sniff the format → summarize (dropped fields / the merge semantic) → commit. */
export function PresetImportDialog({ open, onOpenChange, onImportSt, onImportOrb, busy }: PresetImportDialogProps): ReactElement {
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Which file selection owns this dialog — bumped per pick, checked before any write (see `onFile`). */
  const pickToken = useRef(0);

  const reset = (): void => {
    setParsed(null);
    setError(null);
  };

  const onFile = (file: File): void => {
    reset();
    // EVERY PICK GETS A TOKEN, AND ONLY THE CURRENT ONE MAY WRITE (#1502). `file.text()` is a promise per
    // selection with no cancellation: pick a large file, change your mind and pick a small one, and the two
    // reads race — LAST TO RESOLVE wins, which is not the same thing as LAST PICKED. The dialog would then
    // summarize (and, on confirm, IMPORT) a file the user had already replaced, with the dropzone showing
    // the other one. The token is a ref rather than state because the comparison happens inside a resolved
    // promise, where a state read would be the stale capture that causes this class in the first place.
    const token = pickToken.current + 1;
    pickToken.current = token;
    // @orb-waive caught-failure-ownership(text): every failure arm here — the read, the JSON
    // parse and the ST reader's typed refusal — explicitly sets a detailed error state, a rendered failure
    // surface. Ends if any of those arms stops writing the error state.
    void file
      .text()
      .then((text) => {
        if (pickToken.current !== token) {
          return; // a later pick already owns this dialog
        }
        let json: unknown;
        // NOT-JSON IS THE ONLY TRUE "NEITHER" (#1390). Nothing was read, so nothing matched, and the
        // sniffer's fall-through problem F-10 named does not arise: there is no parser voice to mistake for
        // the door's verdict yet.
        try {
          json = JSON.parse(text);
        } catch (cause: unknown) {
          setError(
            `That file isn't valid JSON, so neither an orbweaver preset export nor a SillyTavern Chat Completion preset could be read from it. (${reasonOf(cause)})`,
          );
          return;
        }
        if (isOrbPresetFile(json)) {
          setParsed({ arm: "orb", name: orbFileName(json), fileText: text });
          return;
        }
        // THE ST READER'S REFUSAL IS ATTRIBUTED, NOT RESTATED AS A VERDICT (#1390, keeping F-10's repair) —
        // and since #1580 the door can tell the reader's TWO refusals apart, because the reader answers with
        // a typed outcome instead of one Error for both. F-10's requirement is that the ST parser must not
        // speak for the WHOLE door (a malformed orb file lands here too); that is met per arm:
        //   recognised: false — the reader claimed nothing, so the honest sentence names BOTH arms as ruled
        //     out and quotes the ST reader as the ST reader.
        //   recognised: true  — the reader claimed the file and then refused it (#1363's intact belt). Here
        //     "the reader stopped" would read as "this is not a SillyTavern preset", which is the ONE thing
        //     that did not happen, so the copy says what it was recognised AS before quoting the refusal.
        const outcome = tryImportStChatCompletionPreset(json);
        if (!outcome.ok) {
          setError(stRefusalMessage(outcome));
          return;
        }
        const base = file.name.replace(JSON_EXT, "");
        setParsed({ arm: "st", name: base === "" ? "Imported preset" : base, result: outcome.result });
      })
      .catch((cause: unknown) => {
        if (pickToken.current !== token) {
          return; // a superseded pick's failure is not this dialog's story
        }
        // The only thing left that can reject here is the READ itself — the two parse verdicts above own
        // their own arms, so this one no longer has to speak for them.
        setError(`That file couldn't be read. (${reasonOf(cause)})`);
      });
  };

  const onConfirm = (): void => {
    if (parsed === null) {
      return;
    }
    if (parsed.arm === "st") {
      onImportSt({ name: parsed.name, config: parsed.result.config });
      return;
    }
    setError(null);
    onImportOrb(parsed.fileText)
      .then((failure) => {
        // A rejected file keeps the dialog open with the SERVER'S reason — the strict parse lives there,
        // and re-deriving a client-side verdict would be the second parser this door exists to avoid.
        setError(failure);
      })
      .catch(() => setError("Import failed — try the file again."));
  };

  return (
    <FormDialog
      // THE OUTCOME, not the mechanism (side-eye F-10): "the format is detected" tells you what the DIALOG
      // does; what a user needs before committing is what happens to their library — and the orb arm's
      // bundle semantics MERGE over a same-named preset, which is the one outcome this door must never
      // surprise anyone with. The per-arm summary below repeats no part of this line.
      description="Pick an orbweaver preset export or a SillyTavern Chat Completion preset (.json). An orbweaver export REPLACES the settings of a preset with the same name, if you have one; anything else is created as a new preset."
      onOpenChange={(next): void => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
      open={open}
      title="Import a preset"
    >
      <Stack gap="block">
        {/* NO `hint` (side-eye F-10): "orbweaver preset exports and SillyTavern Chat Completion presets"
            was the dialog description's first clause, printed a second time two lines below it. */}
        <FileDropzone
          accept="application/json,.json"
          instructions="Drop a preset .json, or click to browse"
          onFilesSelected={(result): void => {
            const first = result.accepted[0];
            if (first !== undefined) {
              onFile(first);
            }
          }}
        />

        {error !== null ? (
          <Row align="start" className="text-destructive" gap="field">
            <Icon icon={AlertTriangle} size="sm" />
            <Text prose={true} voice="label">
              {error}
            </Text>
          </Row>
        ) : null}

        {parsed === null ? null : <ImportSummary parsed={parsed} />}
      </Stack>

      <Row gap="field" justify="end">
        <DialogClose render={<Button intent="ghost">Cancel</Button>} />
        <Button intent="primary" disabled={parsed === null || busy} onClick={onConfirm}>
          Import preset
        </Button>
      </Row>
    </FormDialog>
  );
}

/** The pre-commit summary, per sniffed arm. */
function ImportSummary({ parsed }: { readonly parsed: ParsedImport }): ReactElement {
  if (parsed.arm === "orb") {
    return <OrbSummary name={parsed.name} />;
  }
  return <StImportSummary name={parsed.name} result={parsed.result} />;
}

/** The orb-native summary — it names the merge KEY, the one fact the dialog-level rule cannot carry (which
 *  name this particular file will collide on). The rule itself is stated once, above (side-eye F-10). */
function OrbSummary({ name }: { readonly name: string }): ReactElement {
  return (
    <Section kicker="Ready to import">
      <Text prose={true} voice="label">
        orbweaver preset export — "{name}". That name is the merge key.
      </Text>
    </Section>
  );
}

/** The post-parse ST summary: section count + the ST fields with no orb home (reported, never silently lost). */
function StImportSummary({ name, result }: { readonly name: string; readonly result: StImportResult }): ReactElement {
  const { sectionCount, dropped } = result;
  return (
    <Section kicker="Ready to import">
      <Text prose={true} voice="label">
        SillyTavern preset — {sectionCount} section{sectionCount === 1 ? "" : "s"}, created as a new preset named "{name}".
      </Text>
      {dropped.length === 0 ? (
        <Text voice="gloss">Everything mapped — nothing was dropped.</Text>
      ) : (
        <Stack gap="field">
          <Text voice="gloss">These SillyTavern fields have no orbweaver home and were left out:</Text>
          {dropped.map((field: StDroppedField) => (
            <Text key={field.field} voice="gloss">
              <code>{field.field}</code> — {field.reason}
            </Text>
          ))}
        </Stack>
      )}
    </Section>
  );
}

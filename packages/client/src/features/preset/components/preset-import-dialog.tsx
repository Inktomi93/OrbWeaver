// The LIST-hub preset import — the ONE band import dialog (redesign §16.1 / G6), two arms behind one door.
// Pick a `.json` with `FileDropzone`; the FORMAT is SNIFFED from the parsed JSON's `schemaKind`, never asked
// of the user (a second dialog, or a format picker, would be a second home for one job):
//
//   · `orb.preset`  → the ORB-NATIVE arm: the file text goes to `preset.importFile`, the thin door over the
//     bundle's own `ImportPreset` verb. Its collision rule travels with it and the dialog STATES it before
//     the commit — a same-named preset is MERGED in place, else created — because "import" silently
//     overwriting a preset the owner still wants is the one outcome this door must not surprise anyone with.
//     The server strict-parses and reports a bad file as an OUTCOME, so its error lands in this dialog.
//   · anything else → the SillyTavern arm: parsed client-side by `importStChatCompletionPreset`, with the
//     dropped-field report, then created via `preset.create`.
//
// Neither arm re-derives serde: the orb arm ships the file's own bytes to the one import verb, and the ST
// arm is the landed browser-side mapper.

import type { StDroppedField, StImportResult } from "@orb/contracts/preset";
import { importStChatCompletionPreset, PRESET_SCHEMA_KIND } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
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

  const reset = (): void => {
    setParsed(null);
    setError(null);
  };

  const onFile = (file: File): void => {
    reset();
    void file
      .text()
      .then((text) => {
        const json: unknown = JSON.parse(text);
        if (isOrbPresetFile(json)) {
          setParsed({ arm: "orb", name: orbFileName(json), fileText: text });
          return;
        }
        const base = file.name.replace(JSON_EXT, "");
        setParsed({ arm: "st", name: base === "" ? "Imported preset" : base, result: importStChatCompletionPreset(json) });
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "That file isn't a preset.");
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
    void onImportOrb(parsed.fileText).then((failure) => {
      // A rejected file keeps the dialog open with the SERVER'S reason — the strict parse lives there, and
      // re-deriving a client-side verdict would be the second parser this door exists to avoid.
      setError(failure);
    });
  };

  return (
    <FormDialog
      description="Pick an orbweaver preset export or a SillyTavern Chat Completion preset (.json). The format is detected from the file."
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
        <FileDropzone
          accept="application/json,.json"
          instructions="Drop a preset .json, or click to browse"
          hint="orbweaver preset exports and SillyTavern Chat Completion presets"
          onFilesSelected={(result): void => {
            const first = result.accepted[0];
            if (first !== undefined) {
              onFile(first);
            }
          }}
        />

        {error !== null ? (
          <Row gap="field" align="start">
            <Icon icon={AlertTriangle} size="sm" />
            <Text size="body" tone="destructive">
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

/** The orb-native summary — it names the merge key and states the collision rule BEFORE the write, because
 *  the bundle's idempotence on `(ownerId, name)` means this can silently replace a preset the owner has. */
function OrbSummary({ name }: { readonly name: string }): ReactElement {
  return (
    <Section heading="Ready to import">
      <Text size="body">orbweaver preset export — "{name}".</Text>
      {/* Not a `gloss`: the collision rule is the load-bearing sentence here (this door can overwrite a
          preset the owner still wants), so it reads at the same content step as the line above it. */}
      <Text size="body" tone="muted">
        If you already have a preset named "{name}", its settings are REPLACED by this file's. Otherwise a new preset is created.
      </Text>
    </Section>
  );
}

/** The post-parse ST summary: section count + the ST fields with no orb home (reported, never silently lost). */
function StImportSummary({ name, result }: { readonly name: string; readonly result: StImportResult }): ReactElement {
  const { sectionCount, dropped } = result;
  return (
    <Section heading="Ready to import">
      <Text size="body">
        SillyTavern preset — {sectionCount} section{sectionCount === 1 ? "" : "s"}, saved as "{name}".
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

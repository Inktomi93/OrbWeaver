// The LIST-hub "Import a SillyTavern preset" flow — a small feature-owned import, not the central
// portability system. Pick a `.json` with `FileDropzone`, parse client-side with
// `importStChatCompletionPreset`, then surface a parse error or show the post-import summary of dropped
// ST fields. Confirming creates the preset via `preset.create`, the same verb "+ New" uses.

import type { StDroppedField, StImportResult } from "@orb/contracts/preset";
import { importStChatCompletionPreset } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";

/** The `.json` extension, stripped off the picked filename to seed the preset name. */
const JSON_EXT = /\.json$/i;

/** A parsed-and-ready ST import: the validated config + the friendly base name + the dropped-field report. */
interface ParsedImport {
  readonly name: string;
  readonly result: StImportResult;
}

export interface PresetImportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Create the imported preset — the surface wires `preset.create` and opens the result. */
  readonly onImport: (input: { name: string; config: StImportResult["config"] }) => void;
  readonly creating: boolean;
}

/** The ST-preset import dialog: drop → parse → summarize dropped fields → create. */
export function PresetImportDialog({ open, onOpenChange, onImport, creating }: PresetImportDialogProps): ReactElement {
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
        const result = importStChatCompletionPreset(json);
        const base = file.name.replace(JSON_EXT, "");
        setParsed({ name: base === "" ? "Imported preset" : base, result });
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "That file isn't a SillyTavern preset.");
      });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next): void => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogPopup>
        <DialogTitle>Import a SillyTavern preset</DialogTitle>
        <DialogDescription>
          Pick a SillyTavern Chat Completion preset (.json). It's parsed in your browser and saved as a new preset — nothing is uploaded.
        </DialogDescription>

        <Stack gap="block">
          <FileDropzone
            accept="application/json,.json"
            instructions="Drop a preset .json, or click to browse"
            hint="SillyTavern Chat Completion presets only"
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

          {parsed !== null ? <ImportSummary parsed={parsed} /> : null}
        </Stack>

        <Row gap="field" justify="end">
          <DialogClose render={<Button intent="ghost">Cancel</Button>} />
          <Button
            intent="primary"
            disabled={parsed === null || creating}
            onClick={(): void => {
              if (parsed !== null) {
                onImport({ name: parsed.name, config: parsed.result.config });
              }
            }}
          >
            Import preset
          </Button>
        </Row>
      </DialogPopup>
    </Dialog>
  );
}

/** The post-parse summary: section count + the ST fields with no orb home (reported, never silently lost). */
function ImportSummary({ parsed }: { readonly parsed: ParsedImport }): ReactElement {
  const { sectionCount, dropped } = parsed.result;
  return (
    <Section heading="Ready to import">
      <Text size="body">
        {sectionCount} section{sectionCount === 1 ? "" : "s"} · saved as "{parsed.name}".
      </Text>
      {dropped.length === 0 ? (
        <Text size="micro" tone="muted">
          Everything mapped — nothing was dropped.
        </Text>
      ) : (
        <Stack gap="field">
          <Text size="micro" tone="muted">
            These SillyTavern fields have no orbweaver home and were left out:
          </Text>
          {dropped.map((field: StDroppedField) => (
            <Text key={field.field} size="micro" tone="muted">
              <code>{field.field}</code> — {field.reason}
            </Text>
          ))}
        </Stack>
      )}
    </Section>
  );
}

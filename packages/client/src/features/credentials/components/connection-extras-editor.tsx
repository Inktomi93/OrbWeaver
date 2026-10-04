// "Extra request fields" (= `extras`) — the row editor step 9 BUILDS (inference program §5.3a · the
// step-3b mock `editor.html` Board C). §5.3a used to say MOVE `preset/components/custom-parameters-editor.tsx`
// here; `146f71cd5` deleted that file with the preset `customParameters` cut-over, so there is no prior art
// and no `SCOPE_GLOSS` to recover — the three properties are the target, and a lane that replaces the rows
// with one TEXTAREA has regressed all three (a pasted block of fields is split into rows instead):
//
//   1. ROW IDENTITY BY ID. Every row carries an `id`; the remove button removes THAT row and editing a key
//      does not rebuild the list under the caret. A key-indexed list renames a row out from under the
//      typist on the first keystroke.
//   2. UNFINISHED ROWS ARE HELD. The empty row and a keyless row survive a save — `extrasFromRows` skips
//      them on the way to the column, and the editor's own state never prunes them. The surface SAYS so,
//      rather than leaving it as a behaviour nobody can see.
//   3. A PER-BELT-KEY GLOSS AT AUTHORING TIME. A key the wire owns is marked HERE, before the turn, not as
//      a `custom_parameters_ignored` warning after it. One gloss per failure class — the eight keys at
//      `@orb/contracts/inference::BELT_OWNED_BODY_KEYS` fail in exactly three ways.
//
// NO COLUMN HEADERS, at either width — a stated deviation from the mock's 870 board. the mock design's own rule
// is that "a column header cannot survive a column that stacks", and the pair DOES stack below the
// container's `lg` step; a header that exists at one width is also a label that exists for assistive tech at
// one width. So every input carries a real `<Field>` label in place at both widths and each row is a named
// group, which is what the review asked for and what an `aria-label` on a `div` never was.

import { errorMessage } from "@orb/kit/error-message";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Icon, Plus, Trash2 } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ClipboardEvent, ReactElement } from "react";
import { useId, useRef, useState } from "react";
import type { ExtraRow } from "../lib/connection-editor-model.ts";
import { beltKeyGloss, extrasFromRows, rowsFromExtras, rowsWithPastedFields, rowWithReadValue } from "../lib/connection-editor-model.ts";
import { looksLikeFields, parsePastedObject } from "../lib/pasted-fields.ts";

interface ConnectionExtrasEditorProps {
  readonly rows: readonly ExtraRow[];
  readonly busy: boolean;
  readonly onChange: (rows: readonly ExtraRow[]) => void;
  /** AUTOSAVE — fired with the rows to save when a row loses focus, takes a paste, or is removed. The editor's own
   *  row state is never pruned by it, which is what makes "unfinished rows are held" OBSERVABLE: type a key, blur,
   *  and the empty row is still there afterwards. */
  readonly onCommit: (rows: readonly ExtraRow[]) => void;
  /** Mints the id of a newly added row — injected so the editor stays deterministic under test. */
  readonly mintRowId: () => string;
  /** The rows as they stand now, for a handler that resumes after an await: the render's `rows` may be stale by then. */
  readonly currentRows: () => readonly ExtraRow[];
}

function ConnectionExtrasEditor({ rows, busy, onChange, onCommit, mintRowId, currentRows }: ConnectionExtrasEditorProps): ReactElement {
  const patch = (id: string, part: Partial<ExtraRow>): void => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...part } : row)));
  };
  const update = (next: readonly ExtraRow[]): void => {
    onChange(next);
    onCommit(next);
  };

  return (
    <Stack gap="row">
      {rows.map((row, index) => (
        <ExtraRowView
          busy={busy}
          index={index}
          key={row.id}
          onCommit={(): void => onCommit(rows)}
          onPasteFields={(fields): void => update(rowsWithPastedFields(currentRows(), row.id, fields, mintRowId))}
          onPatch={patch}
          onReadValue={(): void => update(rows.map((other) => (other.id === row.id ? rowWithReadValue(other) : other)))}
          onRemove={(id): void => update(rows.filter((other) => other.id !== id))}
          row={row}
        />
      ))}
      <Row gap="field">
        <Button disabled={busy} intent="secondary" onClick={(): void => onChange([...rows, { id: mintRowId(), key: "", value: "" }])} size="sm">
          <Icon icon={Plus} size="sm" />
          Add a field
        </Button>
      </Row>
      <Text voice="gloss">
        Paste a block of fields into a Field box, as JSON, YAML or key=value lines, and each becomes its own row. A value is sent as typed unless it is JSON; a
        JSON object or list reads back indented. Empty rows stay while you're typing; nothing is saved until the row has a key.
      </Text>
    </Stack>
  );
}

function ExtraRowView({
  row,
  index,
  busy,
  onPatch,
  onRemove,
  onCommit,
  onPasteFields,
  onReadValue,
}: {
  readonly row: ExtraRow;
  readonly index: number;
  readonly busy: boolean;
  readonly onPatch: (id: string, part: Partial<ExtraRow>) => void;
  readonly onRemove: (id: string) => void;
  readonly onCommit: () => void;
  readonly onPasteFields: (fields: Readonly<Record<string, unknown>>) => void;
  readonly onReadValue: () => void;
}): ReactElement {
  const key = row.key.trim();
  const subject = key === "" ? `field ${String(index + 1)}` : key;
  const gloss = beltKeyGloss(key);
  const [pasteError, setPasteError] = useState<string | null>(null);

  // A block of fields pasted into the key lands as rows. A value is never read that way: it is strict JSON or the
  // exact text typed, so a template or a bracketed marker stays a string.
  const pasteFields = (event: ClipboardEvent<HTMLElement>): void => {
    const text = event.clipboardData.getData("text/plain");
    if (!looksLikeFields(text)) {
      return;
    }
    event.preventDefault();
    // @orb-waive caught-failure-ownership(parsePastedObject): the only rejection is the lazy reader chunk failing to load; it lands in the Field error under the paste. Ends if the reader stops loading lazily.
    parsePastedObject(text).then(
      (read) => {
        setPasteError(read.ok ? null : read.reason);
        if (read.ok) {
          onPasteFields(read.value);
        }
      },
      // The reader's chunk failed to load: the field says so, and the paste lands nowhere.
      (err: unknown) => setPasteError(errorMessage(err)),
    );
  };

  return (
    <Stack aria-label={`Extra request ${subject}`} data-slot="connection-extra-row" data-extra-key={key} gap="tight" role="group">
      <Row align="end" className="@max-lg:flex-col @max-lg:items-stretch" gap="field">
        <Field className="min-w-0 grow" error={pasteError} label="Field">
          <Input
            autoComplete="off"
            onBlur={onCommit}
            onPaste={pasteFields}
            onValueChange={(next): void => {
              setPasteError(null);
              onPatch(row.id, { key: next });
            }}
            placeholder="key"
            value={row.key}
          />
        </Field>
        <Field className="min-w-0 grow" label="Value">
          <Textarea
            autoComplete="off"
            maxRows={8}
            onBlur={onReadValue}
            onValueChange={(next): void => onPatch(row.id, { value: next })}
            placeholder="value"
            rows={1}
            value={row.value}
          />
        </Field>
        <Row className="shrink-0 @max-lg:justify-end" gap="field">
          <Button
            aria-label={key === "" ? "Remove this field" : `Remove the ${key} field`}
            disabled={busy}
            intent="ghost"
            onClick={(): void => onRemove(row.id)}
            size="sm"
          >
            <Icon icon={Trash2} size="sm" />
          </Button>
        </Row>
      </Row>
      {gloss === null ? null : (
        <Text className="text-warning" data-slot="connection-extra-belt-gloss" voice="gloss">
          {gloss}
        </Text>
      )}
    </Stack>
  );
}

/** The Diagnostics tier's extras block: its heading and gloss over the row editor, holding the rows it edits. */
export function ConnectionExtrasBlock({
  extras,
  busy,
  onCommit,
}: {
  readonly extras: Readonly<Record<string, unknown>> | null;
  readonly busy: boolean;
  readonly onCommit: (extras: Record<string, unknown> | null) => void;
}): ReactElement {
  const idPrefix = useId();
  const [rows, setRows] = useState<readonly ExtraRow[]>(() => rowsFromExtras(extras, (index) => `${idPrefix}-${String(index)}`));
  // A ref, not state: one paste mints several ids inside a single handler, and each must differ.
  const minted = useRef(0);
  // The rows as last set, read by a paste that resumes after the lazy reader loads. Written only by `change`.
  const latest = useRef(rows);
  const change = (next: readonly ExtraRow[]): void => {
    latest.current = next;
    setRows(next);
  };

  return (
    <Stack gap="tight">
      <Text voice="label">Extra request fields</Text>
      <Text voice="gloss">
        Sent with every request on this connection, merged last. Use it for a field your server takes and we don't send. Sampling knobs belong to the preset,
        not here.
      </Text>
      <ConnectionExtrasEditor
        busy={busy}
        mintRowId={(): string => {
          minted.current += 1;
          return `${idPrefix}-new-${String(minted.current)}`;
        }}
        currentRows={(): readonly ExtraRow[] => latest.current}
        onChange={change}
        onCommit={(next): void => onCommit(extrasFromRows(next))}
        rows={rows}
      />
    </Stack>
  );
}

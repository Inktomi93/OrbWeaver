// "Extra request fields" (= `extras`) — the row editor step 9 BUILDS (inference program §5.3a · the
// step-3b mock `editor.html` Board C). §5.3a used to say MOVE `preset/components/custom-parameters-editor.tsx`
// here; `146f71cd5` deleted that file with the preset `customParameters` cut-over, so there is no prior art
// and no `SCOPE_GLOSS` to recover — the three properties are the target, and a lane that ships a TEXTAREA
// has regressed all three:
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

import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Icon, Plus, Trash2 } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { ExtraRow } from "../lib/connection-editor-model.ts";
import { beltKeyGloss } from "../lib/connection-editor-model.ts";

export interface ConnectionExtrasEditorProps {
  readonly rows: readonly ExtraRow[];
  readonly busy: boolean;
  readonly onChange: (rows: readonly ExtraRow[]) => void;
  /** AUTOSAVE — fired when a row loses focus or is removed. The editor's own row state is never pruned by
   *  it, which is what makes "unfinished rows are held" OBSERVABLE: type a key, blur, and the empty row is
   *  still there afterwards. */
  readonly onCommit: () => void;
  /** Mints the id of a newly added row — injected so the editor stays deterministic under test. */
  readonly mintRowId: () => string;
}

export function ConnectionExtrasEditor({ rows, busy, onChange, onCommit, mintRowId }: ConnectionExtrasEditorProps): ReactElement {
  const patch = (id: string, part: Partial<ExtraRow>): void => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...part } : row)));
  };

  return (
    <Stack gap="row">
      {rows.map((row, index) => (
        <ExtraRowView
          busy={busy}
          index={index}
          key={row.id}
          onCommit={onCommit}
          onPatch={patch}
          onRemove={(id): void => {
            onChange(rows.filter((other) => other.id !== id));
            onCommit();
          }}
          row={row}
        />
      ))}
      <Row gap="field">
        <Button disabled={busy} intent="secondary" onClick={(): void => onChange([...rows, { id: mintRowId(), key: "", value: "" }])} size="sm">
          <Icon icon={Plus} size="sm" />
          Add a field
        </Button>
      </Row>
      <Text voice="gloss">Empty rows stay while you're typing; nothing is saved until the row has a key.</Text>
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
}: {
  readonly row: ExtraRow;
  readonly index: number;
  readonly busy: boolean;
  readonly onPatch: (id: string, part: Partial<ExtraRow>) => void;
  readonly onRemove: (id: string) => void;
  readonly onCommit: () => void;
}): ReactElement {
  const key = row.key.trim();
  const subject = key === "" ? `field ${String(index + 1)}` : key;
  const gloss = beltKeyGloss(key);

  return (
    <Stack aria-label={`Extra request ${subject}`} data-slot="connection-extra-row" data-extra-key={key} gap="tight" role="group">
      <Row align="end" className="@max-lg:flex-col @max-lg:items-stretch" gap="field">
        <Field className="min-w-0 grow" label="Field">
          <Input autoComplete="off" onBlur={onCommit} onValueChange={(next): void => onPatch(row.id, { key: next })} placeholder="key" value={row.key} />
        </Field>
        <Field className="min-w-0 grow" label="Value">
          <Input autoComplete="off" onBlur={onCommit} onValueChange={(next): void => onPatch(row.id, { value: next })} placeholder="value" value={row.value} />
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

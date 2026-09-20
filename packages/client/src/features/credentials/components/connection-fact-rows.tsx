// The ONE fact-row grammar the connection editor's Advanced tier renders BOTH its blocks through
// (inference program §5.3a · the step-3b mock `editor.html` Board B): mono key · resolved value + source
// line · one Override per field. `declared` ("What this server accepts") and `features` ("Endpoint quirks")
// are different schemas with the same reading job — what is the resolved value, where did it come from, can
// I change it — so they get ONE row, not two that drift.
//
// AN OVERRIDDEN ROW CHANGES COLOUR AND SWAPS Override→Reset, and its source line restates the value it
// replaced wherever the client can prove one (`connection-editor-model.ts`'s header says exactly where it
// can and cannot). Read-only BY DEFAULT is the point, not timidity: every line already has a correct value,
// and a wrong answer here does not fail loudly — it drops a knob or 400s on the fifth message. Override is
// one press away and per-field, so the user with a genuinely weird box is not blocked; they just have to
// mean it.
//
// THE OVERRIDE CONTROL IS A BUTTON THAT REVEALS AN EDITOR, never the editor itself: the editor's shape
// differs per field (a number, an enum, a string list, a boolean) and a row that sometimes holds a text box
// and sometimes a select is a row with no rhythm. The revealed editor is a real `<Field>`/`<Select>` with a
// real label — the mock draws styled `div`s and answers nothing about focus.

import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { FactRow } from "../lib/connection-fact-model.ts";
import { parseFactValue } from "../lib/connection-fact-model.ts";

export interface FactRowListProps {
  readonly rows: readonly FactRow[];
  /** Writes in flight — every control on the block goes non-interactive rather than racing itself. */
  readonly busy: boolean;
  readonly onOverride: (row: FactRow, value: unknown) => void;
  readonly onReset: (row: FactRow) => void;
}

export function FactRowList({ rows, busy, onOverride, onReset }: FactRowListProps): ReactElement {
  return (
    <Stack gap="row">
      {rows.map((row) => (
        <FactRowView key={row.path} row={row} busy={busy} onOverride={onOverride} onReset={onReset} />
      ))}
    </Stack>
  );
}

function FactRowView({ row, busy, onOverride, onReset }: { readonly row: FactRow } & Omit<FactRowListProps, "rows">): ReactElement {
  const [editing, setEditing] = useState(false);

  return (
    // The row STACKS below the container's `lg` step (512px): the mono key takes its own line, the value and
    // source follow, and the action moves to a right-aligned line of its own. Measured on the mock at 486:
    // a 172px key basis + a mono value + a control-height button cannot share a 462px content line without
    // the source wrapping to three.
    <Stack data-slot="connection-fact-row" data-fact={row.path} data-overridden={row.overridden} gap="tight">
      <Row align="start" className="@max-lg:flex-col @max-lg:items-stretch" gap="field" justify="between">
        <Text className="shrink-0" voice="datum">
          {row.name}
        </Text>
        <Stack className="min-w-0 grow" gap="tight">
          <Text className={row.overridden ? "text-info" : undefined} voice="label">
            {row.value}
          </Text>
          <Text voice="gloss">{row.source}</Text>
        </Stack>
        <Row className="shrink-0 @max-lg:justify-end" gap="field">
          {row.overridden ? (
            <Button aria-label={`Reset ${row.name}`} disabled={busy} intent="ghost" onClick={(): void => onReset(row)} size="sm">
              Reset
            </Button>
          ) : (
            <Button aria-label={`Override ${row.name}`} disabled={busy} intent="ghost" onClick={(): void => setEditing(true)} size="sm">
              Override
            </Button>
          )}
        </Row>
      </Row>
      {editing ? (
        <FactOverrideEditor
          row={row}
          busy={busy}
          onCancel={(): void => setEditing(false)}
          onCommit={(value): void => {
            setEditing(false);
            onOverride(row, value);
          }}
        />
      ) : null}
    </Stack>
  );
}

/** The revealed editor — one control per {@link FactEdit} kind, seeded with the resolved value. */
function FactOverrideEditor({
  row,
  busy,
  onCommit,
  onCancel,
}: {
  readonly row: FactRow;
  readonly busy: boolean;
  readonly onCommit: (value: unknown) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const [draft, setDraft] = useState(row.draft);

  return (
    <Row align="end" className="@max-lg:flex-col @max-lg:items-stretch" gap="field">
      <Stack className="min-w-0 grow" gap="tight">
        <FactEditControl edit={row.edit} label={`${row.name} — your value`} value={draft} onChange={setDraft} />
        <Text voice="gloss">{editHint(row.edit)}</Text>
      </Stack>
      <Row className="shrink-0 @max-lg:justify-end" gap="field">
        <Button intent="ghost" onClick={onCancel} size="sm">
          Cancel
        </Button>
        <Button
          aria-label={`Save your ${row.name}`}
          disabled={busy || draft.trim() === ""}
          intent="primary"
          onClick={(): void => onCommit(parseFactValue(row.edit, draft))}
          size="sm"
        >
          Save
        </Button>
      </Row>
    </Row>
  );
}

const BOOLEAN_ITEMS = [
  { label: "yes", value: "true" },
  { label: "no", value: "false" },
];

function FactEditControl({
  edit,
  label,
  value,
  onChange,
}: {
  readonly edit: FactRow["edit"];
  readonly label: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
}): ReactElement {
  if (edit.kind === "boolean") {
    return <FactSelect items={BOOLEAN_ITEMS} label={label} onChange={onChange} value={value} />;
  }
  if (edit.kind === "enum") {
    return <FactSelect items={edit.options.map((option) => ({ label: option, value: option }))} label={label} onChange={onChange} value={value} />;
  }
  return (
    <Field label={label}>
      <Input
        autoComplete="off"
        inputMode={edit.kind === "number" ? "numeric" : "text"}
        onChange={(event): void => onChange(event.target.value)}
        value={value}
      />
    </Field>
  );
}

function FactSelect({
  items,
  label,
  value,
  onChange,
}: {
  readonly items: readonly { readonly label: string; readonly value: string }[];
  readonly label: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
}): ReactElement {
  return (
    <Field label={label}>
      <Select aria-label={label} items={items} onValueChange={(next): void => onChange(String(next))} value={value} />
    </Field>
  );
}

function editHint(edit: FactRow["edit"]): string {
  if (edit.kind === "list") {
    return "Comma-separated, in the order the server sends them.";
  }
  if (edit.kind === "number") {
    return "A number. What you type here is what we believe about this server.";
  }
  return "What you type here is what we believe about this server — it does not change what the server does.";
}

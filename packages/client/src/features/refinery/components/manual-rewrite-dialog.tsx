// The MANUAL-REWRITE editor (og-extension-feedback gap 1 — the OG's accepted fork: score → hand-edit →
// analyze). A WIP edit area over the session's IN-SCOPE targets, prefilled with the working text; saving
// lands a `{kind:"manual"}` rewrite RUN (never a card write — the workspace ruling), which analyze then
// judges against the anchor exactly like a model rewrite. Emptying a field is a checkbox per target
// (the cleared arm — "they can fill it therefore they can empty it").

import type { RefineryRewriteField } from "@orb/contracts/refinery";
import { Button } from "@orb/ui/button";
import { Checkbox } from "@orb/ui/checkbox";
import { Field } from "@orb/ui/field";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog } from "#components";
import type { ManualTarget } from "../lib/manual-targets.ts";

export interface ManualRewriteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly targets: readonly ManualTarget[];
  readonly saving: boolean;
  readonly onSubmit: (fields: readonly RefineryRewriteField[]) => void;
}

interface DraftState {
  readonly text: string;
  readonly cleared: boolean;
  readonly touched: boolean;
}

function keyOf(target: { field: string; greetingIndex?: number | undefined }): string {
  return target.greetingIndex === undefined ? target.field : `${target.field}[${target.greetingIndex}]`;
}

export function ManualRewriteDialog({ open, onOpenChange, targets, saving, onSubmit }: ManualRewriteDialogProps): ReactElement {
  const [drafts, setDrafts] = useState<Readonly<Record<string, DraftState>>>({});

  // THE DRAFTS ARE PER VISIT (#1502). This component stays mounted while closed (Base UI unmounts the popup
  // CONTENT, not its owner), and the draft map is keyed by FIELD NAME — `description`, `greetings[0]` —
  // which is exactly the key a DIFFERENT card reuses. So a cancelled hand-edit came back attached to the
  // next card the user scoped, already `touched`, therefore already counted in "1 field changed" and
  // already inside the round the Save button would submit: text from one character silently landing in
  // another's rewrite.
  //
  // KEYED OFF THE CLOSED STATE, NOT THE `onOpenChange` WRAPPER the sibling dialogs use, and the
  // difference is load-bearing: the SUCCESS path here closes programmatically
  // (`refinery-content-surface.tsx` → `onSuccess: setManualOpen(false)`), which never reaches a controlled
  // popup's `onOpenChange`. Watching `open` itself catches every way this dialog can shut. The reset runs
  // DURING RENDER (React's derive-from-a-prop idiom, `create-autosave-entity-form.tsx` is the house
  // precedent) rather than in an effect: an effect would commit one render with the stale drafts and the
  // compiler lint refuses a synchronous setState there.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setDrafts({});
    }
  }

  function draftOf(target: ManualTarget): DraftState {
    return drafts[keyOf(target)] ?? { text: target.text, cleared: false, touched: false };
  }

  function patch(target: ManualTarget, next: Partial<DraftState>): void {
    setDrafts((prev) => ({ ...prev, [keyOf(target)]: { ...draftOf(target), ...next, touched: true } }));
  }

  const entries: RefineryRewriteField[] = targets.flatMap((target): RefineryRewriteField[] => {
    const draft = draftOf(target);
    if (!draft.touched) {
      return [];
    }
    const at = { field: target.field, ...(target.greetingIndex === undefined ? {} : { greetingIndex: target.greetingIndex }) };
    if (draft.cleared) {
      return [{ ...at, cleared: true as const }];
    }
    return draft.text.trim().length === 0 || draft.text === target.text ? [] : [{ ...at, text: draft.text }];
  });

  return (
    <FormDialog onOpenChange={onOpenChange} open={open} size="lg" title="Hand-edit the scoped fields">
      <Stack gap="row">
        <Text voice="gloss">
          Your edit lands as a rewrite ROUND, not a card write — analyze can judge it against the original, and nothing touches the card until you apply.
          Untouched fields stay out of the round.
        </Text>
        {targets.map((target) => {
          const draft = draftOf(target);
          return (
            <Stack gap="tight" key={keyOf(target)}>
              <Row align="center" gap="row">
                <Text voice="label">{keyOf(target)}</Text>
                <Row align="center" gap="field">
                  <Checkbox checked={draft.cleared} onCheckedChange={(cleared: boolean): void => patch(target, { cleared })} />
                  <Text voice="gloss">empty this field</Text>
                </Row>
              </Row>
              {draft.cleared ? (
                <Text voice="gloss">
                  {target.field === "greetings" ? "This greeting slot will be removed — later greetings shift up." : "This field will be emptied."}
                </Text>
              ) : (
                <Field label={`New text for ${keyOf(target)}`}>
                  <Textarea onChange={(e): void => patch(target, { text: e.target.value })} rows={4} value={draft.text} />
                </Field>
              )}
            </Stack>
          );
        })}
        <Row gap="row" justify="end">
          <Text voice="gloss">{entries.length === 0 ? "No changes yet." : `${entries.length} field${entries.length === 1 ? "" : "s"} changed.`}</Text>
          <Button disabled={saving || entries.length === 0} onClick={(): void => onSubmit(entries)} size="sm">
            Save as a rewrite round
          </Button>
        </Row>
      </Stack>
    </FormDialog>
  );
}

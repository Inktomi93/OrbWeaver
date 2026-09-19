// The Rewrite modal (owner ruling 2026-07-25: "rewrite literally needs a modal because it has toggle
// options to guide it"). A free-text correction instruction (pre-seeded from the composer draft when one
// exists — the existing wand gesture is not orphaned) PLUS the `REWRITE_TOGGLES` catalog rendered as
// house Switch rows. Apply composes the selected toggles' fragments + the free text into ONE steer string
// (`composeRewriteSteer`, kit) and hands it to the caller, which fires the EXISTING `fireRewrite`
// (chat.swipe + guided{action:"rewrite"}) — no new wire shape, no server change. The preset's `rewrite`
// template wraps this composed string as its `{{input}}` downstream (layering: template ⊃ toggles + free
// text), so the toggles steer the SAME out-of-character rewrite the F1 fire already delivered.
//
// Built on the FormDialog composite (G24 dialog-via-composite — a features/** form/prompt dialog uses the
// composite, never a hand-assembled Dialog root): PROMPT mode (`submit`) gives the Cancel/Rewrite footer.
// Focus lands in the instruction field on open via Base UI's default (the instruction Textarea is the first
// tabbable control in the body); Esc + the backdrop close via the controlled `open` (Base UI behavior).
//
// State is OWNED BY THE WAND (controlled here) so a cancelled/Esc-closed modal does NOT destroy the typed
// instruction or the toggle selection (the source's sacred input-recovery posture, D57 — client state):
// the dialog only reads+writes callbacks; closing it preserves everything until an explicit Apply
// (fire + reset) or the user re-seeds.

import type { RewriteToggleId } from "@orb/contracts/preset";
import { REWRITE_TOGGLES } from "@orb/contracts/preset";
import { Field } from "@orb/ui/field";
import { Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";
import { FormDialog } from "#components";

export interface RewriteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The correction instruction (pre-seeded from the composer draft on open; owned by the wand). */
  readonly instruction: string;
  readonly onInstructionChange: (text: string) => void;
  /** The selected toggle ids (owned by the wand so a cancel preserves the selection). */
  readonly selected: ReadonlySet<RewriteToggleId>;
  readonly onToggle: (id: RewriteToggleId, on: boolean) => void;
  /** Fire the composed rewrite (the wand composes fragments + instruction and calls `fireRewrite`). */
  readonly onApply: () => void;
}

/** The guided-Rewrite modal: instruction box + the toggle catalog + Cancel/Rewrite. */
export function RewriteDialog({ open, onOpenChange, instruction, onInstructionChange, selected, onToggle, onApply }: RewriteDialogProps): ReactElement {
  // Apply is a no-op unless there's SOMETHING to steer with — an instruction or at least one toggle
  // (an empty steer would be an unguided reroll, which the guided-swipe item already covers).
  const canApply = instruction.trim().length > 0 || selected.size > 0;
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rewrite the reply"
      description="Describe the correction, and pick any styles to guide it. The reply is rewritten as a new variant."
      size="sm"
      submit={{ label: "Rewrite", onSubmit: onApply, disabled: !canApply }}
    >
      <Stack gap="block">
        {/* No `aria-label` (#1621, the Textarea family): this box is its Field's sole `Field.Control`, so Base
            UI reaches it with the label's `aria-labelledby`, which outranks an `aria-label` — the attribute
            named nothing and repeated the label it lost to. MEASURED per family at
            `tests/client/a11y/field-control-name.suite.ct.tsx`; the computed name is unchanged
            (`rewrite-dialog.ct.tsx` still finds "Correction instruction" by role+name). The Switch below is
            the same accname story with a DIFFERENT verdict — see its own note. */}
        <Field label="Correction instruction">
          <Textarea
            rows={3}
            value={instruction}
            onChange={(event): void => onInstructionChange(event.target.value)}
            placeholder="Describe what should change…"
          />
        </Field>
        <Stack gap="field">
          {REWRITE_TOGGLES.map((toggle) => (
            <Field key={toggle.id} label={toggle.label} orientation="horizontal">
              <Switch checked={selected.has(toggle.id)} onCheckedChange={(on): void => onToggle(toggle.id, on)} />
            </Field>
          ))}
        </Stack>
      </Stack>
    </FormDialog>
  );
}

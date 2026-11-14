// The built-in's fork CHOICE dialog — the one interruption in an otherwise silent autosave editor. It opens
// only when the owner edits the built-in default AND already has a fork of it: the first fork is silent (there
// is nothing to forget), a second silent one is either a row they can't find or a quiet re-opening of a fork
// they had moved on from. Both arms COMMIT the pending edit, so there is no Cancel — the keystroke already
// happened, the only open question is where it lands; dismissing (Esc/backdrop) takes the primary arm, which
// is also exactly what the old silent behavior did.
//
// Two stages in one DismissDialog (G24 — never a raw Dialog root): the CHOICE, whose two arms are its acts and
// whose corner close takes the primary arm, then the new fork's NAME, whose commit footer's exit is a Back to
// the choice rather than a close, so a mis-click can't silently retarget the editor. The name field is
// pre-filled with the suggestion and takes focus when its stage swaps in, as the arm that opened it does on
// the way back.

import { Button } from "@orb/ui/button";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId, useRef, useState } from "react";
import { CommitFooter, DismissDialog } from "#components";
import { useFocusOnSwap } from "#lib";
import {
  PRESET_FORK_CREATE_NAME,
  PRESET_FORK_NAME_FIELD_NAME,
  PRESET_FORK_NAME_TITLE,
  PRESET_FORK_START_NAME,
  PRESET_NAME_FIELD_NAME,
  presetForkKeepEditingName,
} from "../lib/preset-names.ts";

export interface PresetForkChoiceDialogProps {
  readonly open: boolean;
  /** The preset being edited — the built-in default ("Default"). */
  readonly sourceName: string;
  /** The fork a "keep editing" lands on: the owner's OLDEST fork of the source (the server's convergence pick). */
  readonly forkName: string;
  /** The pre-filled name for a new fork (`suggestForkName`). */
  readonly suggestedName: string;
  /** Land the pending edit on the existing fork and retarget the editor there. Also the dismissal outcome. */
  readonly onKeepEditing: () => void;
  /** Mint a new fork under this name, carrying the pending edit. */
  readonly onNewFork: (name: string) => void;
}

/** Which stage is on screen, and for the choice whether the reader came back to it from the name stage. */
const FORK_STAGES = ["choice", "naming", "returned"] as const;
type ForkStage = (typeof FORK_STAGES)[number];

/** The choice the owner sees before their edit to the built-in default is written. */
export function PresetForkChoiceDialog({ open, sourceName, forkName, suggestedName, onKeepEditing, onNewFork }: PresetForkChoiceDialogProps): ReactElement {
  const [stage, setStage] = useState<ForkStage>("choice");
  const [name, setName] = useState(suggestedName);
  const nameRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const naming = stage === "naming";
  const trimmed = name.trim();

  // Each stage swaps in where the control that opened it was, so its arrival control takes focus.
  useFocusOnSwap(nameRef, naming);
  useFocusOnSwap(startRef, stage === "returned");

  const create = (): void => {
    if (trimmed !== "") {
      onNewFork(trimmed);
    }
  };

  return (
    <DismissDialog
      closeButton={true}
      onOpenChange={(next): void => {
        if (!next) {
          // Esc / the backdrop: the edit still has to land somewhere — take the primary arm.
          onKeepEditing();
        }
      }}
      open={open}
      title={naming ? PRESET_FORK_NAME_TITLE : `Where should this edit to ${sourceName} go?`}
      description={
        naming
          ? `A new copy of ${sourceName} carries this edit; ${forkName} keeps its own.`
          : `${sourceName} is the built-in default, so your edits to it live in a copy. You already have one: ${forkName}.`
      }
    >
      {naming ? (
        <>
          <form
            aria-label={PRESET_FORK_NAME_TITLE}
            id={formId}
            onSubmit={(event): void => {
              event.preventDefault();
              create();
            }}
          >
            <Input aria-label={PRESET_FORK_NAME_FIELD_NAME} onValueChange={setName} placeholder={PRESET_NAME_FIELD_NAME} ref={nameRef} value={name} />
          </form>
          <CommitFooter
            exit={{ back: (): void => setStage("returned") }}
            formId={formId}
            submit={{ label: PRESET_FORK_CREATE_NAME, onSubmit: create, disabled: trimmed === "" }}
          />
        </>
      ) : (
        <Stack gap="block">
          <Stack gap="tight">
            <Button onClick={onKeepEditing}>{presetForkKeepEditingName(forkName)}</Button>
            <Button
              ref={startRef}
              variant="outline"
              onClick={(): void => {
                setName(suggestedName);
                setStage("naming");
              }}
            >
              {PRESET_FORK_START_NAME}
            </Button>
          </Stack>
          <Text voice="gloss">{`Either way this edit is saved: "${forkName}" is just the copy it would join.`}</Text>
        </Stack>
      )}
    </DismissDialog>
  );
}

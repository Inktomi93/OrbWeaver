// The built-in's fork CHOICE dialog — the one interruption in an otherwise silent autosave editor. It opens
// only when the owner edits the built-in default AND already has a fork of it: the first fork is silent (there
// is nothing to forget), a second silent one is either a row they can't find or a quiet re-opening of a fork
// they had moved on from. Both arms COMMIT the pending edit, so there is no Cancel — the keystroke already
// happened, the only open question is where it lands; dismissing (Esc/backdrop) takes the primary arm, which
// is also exactly what the old silent behavior did.
//
// Two phases in one FormDialog (G24 — never a raw Dialog root): the CHOICE, then the new fork's NAME (its
// Back returns to the choice rather than closing, so a mis-click can't silently retarget the editor). The
// name field is pre-filled with the suggestion and mounts focused — the rename-dialog prompt shape.

import { Button } from "@orb/ui/button";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { FormDialog } from "#components";

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

/** The choice the owner sees before their edit to the built-in default is written. */
export function PresetForkChoiceDialog({ open, sourceName, forkName, suggestedName, onKeepEditing, onNewFork }: PresetForkChoiceDialogProps): ReactElement {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(suggestedName);
  const nameRef = useRef<HTMLInputElement>(null);

  const trimmed = name.trim();

  // Focus the name field when the second phase opens. NOT `autoFocus` (which would need a jsx-a11y
  // suppression this file has no budget for) and not `useFocusOnMount` (its initial-load guard skips
  // exactly this case: the button that opened the phase unmounted, so `activeElement` is already <body>).
  useEffect(() => {
    if (naming) {
      nameRef.current?.focus();
    }
  }, [naming]);

  return (
    <FormDialog
      onOpenChange={(next): void => {
        if (!next) {
          // Esc / the backdrop: the edit still has to land somewhere — take the primary arm.
          onKeepEditing();
        }
      }}
      open={open}
      title={naming ? "Name the new fork" : `Where should this edit to ${sourceName} go?`}
      description={
        naming
          ? `A new copy of ${sourceName} carries this edit; ${forkName} keeps its own.`
          : `${sourceName} is the built-in default, so your edits to it live in a copy. You already have one: ${forkName}.`
      }
    >
      {naming ? (
        <form
          onSubmit={(event): void => {
            event.preventDefault();
            if (trimmed !== "") {
              onNewFork(trimmed);
            }
          }}
        >
          <Stack gap="block">
            <Input aria-label="New fork name" onValueChange={setName} placeholder="Preset name" ref={nameRef} value={name} />
            <Row gap="field" justify="end">
              <Button intent="ghost" onClick={(): void => setNaming(false)}>
                Back
              </Button>
              <Button disabled={trimmed === ""} intent="primary" type="submit">
                Create fork
              </Button>
            </Row>
          </Stack>
        </form>
      ) : (
        <Stack gap="block">
          <Stack gap="tight">
            <Button intent="primary" onClick={onKeepEditing}>
              {`Keep editing ${forkName}`}
            </Button>
            <Button
              intent="secondary"
              onClick={(): void => {
                setName(suggestedName);
                setNaming(true);
              }}
            >
              Start a new fork
            </Button>
          </Stack>
          <Text voice="gloss">{`Either way this edit is saved — "${forkName}" is just the copy it would join.`}</Text>
        </Stack>
      )}
    </FormDialog>
  );
}

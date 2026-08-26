// The Characters LIST band's create cluster — the ratified band anatomy (the presets band's landed
// precedent): exactly ONE primary (New) with Import beside it as a GHOST icon, a secondary entry into the
// same "get a character" job. Replaces the former `+` split MENU, which buried both verbs one click deep
// and homed import outside the band grammar.
//
// Two exports, because the band and the pane's empty states want different halves:
//   • `CharacterCreateActions` — the BAND cluster (Import ghost + New primary). Import's ONE home.
//   • `CharacterCreateButton`  — New alone, for the empty states (an empty pane may not dead-end); import
//     is deliberately NOT echoed there — the band's ghost sits directly above the same pane.
// Both share the one `NewCharacterDialog`, so the two entry points can never mint differently.

import { slugifyHandle } from "@orb/kit/slug";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { Icon, Plus, Upload } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import { FormDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { selectCharacter } from "#state";
import { useCreateCharacter } from "../hooks/use-character-mutations.ts";
import { characterRefusalCopy } from "../lib/character-refusal-notice.ts";
import { CharacterImportDialog } from "./character-import-dialog.tsx";

/** The minimal create: name + one-line description, handle auto-derived from the name. */
function NewCharacterDialog({ open, onOpenChange }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateCharacter({ trpc, invalidation });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  /** The refusal line's own id — what `aria-errormessage` on the Name field points at (#548). */
  const refusalId = useId();
  const incomplete = name.trim() === "" || description.trim() === "";
  // The typed, user-fixable refusal for the last attempt (#542) — `null` for a fault, which the toast owns
  // alone. `clearError` on the name edit is what makes it a live claim: the sticky error slot would
  // otherwise keep accusing a name the user has already changed.
  const refusal = characterRefusalCopy(create.error);
  const onNameChange = (next: string): void => {
    setName(next);
    create.clearError();
  };

  const onCreate = (): void => {
    if (incomplete) {
      return;
    }
    create.mutate(
      {
        input: {
          handle: slugifyHandle(name.trim()),
          name: name.trim(),
          description: description.trim(),
        },
      },
      {
        onSuccess: (character): void => {
          selectCharacter(character.id);
          onOpenChange(false);
          setName("");
          setDescription("");
        },
      },
    );
  };

  return (
    <FormDialog
      description="Give them a name and a one-line description — you can flesh out the rest in the editor."
      onOpenChange={onOpenChange}
      open={open}
      title="New character"
    >
      <Stack gap="field">
        {/* The four-voice grammar (density §2.3): a field caption is the NAME OF ONE DATUM → `label`.
            Tone rides a className, the landed dialog precedent (create-schedule-dialog). */}
        <Text as="span" className="text-muted-foreground" voice="label">
          Name
        </Text>
        {/* THE FIELD SAYS IT IS THE ONE THAT WAS REFUSED (#548, se-verify-3 P2). #542 announced the refusal
            with `role="alert"` and stopped there: the Name input carried `aria-invalid=null` and pointed at
            nothing, so a screen-reader user who tabbed BACK to the field — the whole point of keeping the
            dialog open — heard a plain, apparently-fine text box. WCAG 3.3.1 wants the error IDENTIFIED,
            not merely announced; `aria-errormessage` is the pair's other half and is honoured only while
            `aria-invalid="true"`, which is why both track the same `refusal !== null` and clear together on
            the next keystroke (`onNameChange` → `clearError`). Every refusal this mapper produces is about
            the NAME (a duplicate handle is derived from it), so the binding is unconditional on the field
            rather than routed per code. */}
        <Input
          aria-label="Character name"
          onValueChange={onNameChange}
          placeholder="Elara Vance"
          value={name}
          {...(refusal === null ? {} : { "aria-errormessage": refusalId, "aria-invalid": true })}
        />
        {/* THE LINE SITS UNDER THE FIELD IT IS ABOUT (#548). It used to render below BOTH controls, where
            its only tie to the Name box was the sentence's own wording — for a sighted reader "at the
            control" (the #542 note's own WCAG 3.3.1 cite) means adjacent, not somewhere in the dialog. */}
        {refusal === null ? null : (
          <Text className="text-destructive" id={refusalId} role="alert" voice="label">
            {refusal}
          </Text>
        )}
        <Text as="span" className="text-muted-foreground" voice="label">
          Description
        </Text>
        <Textarea
          aria-label="Character description"
          onChange={(event): void => setDescription(event.target.value)}
          placeholder="A wandering cartographer with a sharp tongue."
          value={description}
        />
      </Stack>
      {/* LOAD-BEARING: it names why Create is disabled, so it keeps the `label` voice (the landed
          requirement/error line grammar), never the receding `gloss`. It speaks for BOTH fields, so this
          is where it belongs — unlike the #542 refusal line, which moved up under the Name field it is
          about (#548, see its note there). The string is the mapper's, so the toast and that line can
          never become two spellings of one refusal. */}
      {incomplete ? (
        <Text className="text-muted-foreground" voice="label">
          A name and a description are both required.
        </Text>
      ) : null}
      <Row gap="field" justify="end">
        <DialogClose render={<Button intent="ghost">Cancel</Button>} />
        <Button disabled={incomplete || create.isPending} intent="primary" onClick={onCreate}>
          Create
        </Button>
      </Row>
    </FormDialog>
  );
}

/** The pane's ONE primary create affordance — also the empty states' un-dead-ending action. */
export function CharacterCreateButton(): ReactElement {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <Button intent="primary" onClick={(): void => setCreateOpen(true)} size="sm">
        <Icon icon={Plus} size="sm" />
        New
      </Button>
      <NewCharacterDialog onOpenChange={setCreateOpen} open={createOpen} />
    </>
  );
}

/** The band cluster: Import (ghost) + New (primary), each with its dialog. */
export function CharacterCreateActions(): ReactElement {
  const [importOpen, setImportOpen] = useState(false);
  return (
    <>
      {/* ONE flex child, so the band's space-between keeps the cluster hard against the trailing edge. */}
      <Row align="center" gap="field">
        <Button aria-label="Import a character card" intent="ghost" onClick={(): void => setImportOpen(true)} size="sm">
          <Icon icon={Upload} size="sm" />
        </Button>
        <CharacterCreateButton />
      </Row>
      <CharacterImportDialog onOpenChange={setImportOpen} open={importOpen} />
    </>
  );
}

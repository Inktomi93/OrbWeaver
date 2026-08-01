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
import { useState } from "react";
import { FormDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { selectCharacter } from "#state";
import { useCreateCharacter } from "../hooks/use-character-mutations";
import { CharacterImportDialog } from "./character-import-dialog";

/** The minimal create: name + one-line description, handle auto-derived from the name. */
function NewCharacterDialog({ open, onOpenChange }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateCharacter({ trpc, invalidation });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const incomplete = name.trim() === "" || description.trim() === "";

  const onCreate = (): void => {
    if (incomplete) {
      return;
    }
    void (async (): Promise<void> => {
      try {
        const character = await create.mutateAsync({
          input: {
            handle: slugifyHandle(name.trim()),
            name: name.trim(),
            description: description.trim(),
          },
        });
        selectCharacter(character.id);
        onOpenChange(false);
        setName("");
        setDescription("");
      } catch {
        // `createEntityMutation`'s `errorToast` already surfaced the failure — keep the dialog open.
      }
    })();
  };

  return (
    <FormDialog
      description="Give them a name and a one-line description — you can flesh out the rest in the editor."
      onOpenChange={onOpenChange}
      open={open}
      title="New character"
    >
      <Stack gap="field">
        <Text as="span" size="label" tone="muted">
          Name
        </Text>
        <Input aria-label="Character name" onValueChange={setName} placeholder="Elara Vance" value={name} />
        <Text as="span" size="label" tone="muted">
          Description
        </Text>
        <Textarea
          aria-label="Character description"
          onChange={(event): void => setDescription(event.target.value)}
          placeholder="A wandering cartographer with a sharp tongue."
          value={description}
        />
      </Stack>
      {incomplete ? (
        <Text size="label" tone="muted">
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

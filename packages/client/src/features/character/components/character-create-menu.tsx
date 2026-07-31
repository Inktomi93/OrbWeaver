// The `+` create/import picker — a `@orb/ui/menu` offering "New character" / "Import card", each opening
// its own picker Dialog. "New" is a minimal create (handle auto-derived from the name); "Import card" is
// a PNG/JSON dropzone over the multipart import route. Both refresh the LIST via the user-bus
// `charactersChanged` path-invalidate.

import { slugifyHandle } from "@orb/kit/slug";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Icon, Plus } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog } from "#components";
import type { CardImportResult } from "#data";
import { importCharacters, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { selectCharacter } from "#state";
import { useCreateCharacter } from "../hooks/use-character-mutations";

const CARD_ACCEPT = ".png,.json,image/png,application/json";

/** The toast line for one rejected card: the server's own reason, prefixed with the file it came from
 *  (the reason is already written for the owner — see the `card_unreadable` throw in domain/import). */
function cardFailureMessage(failure: CardImportResult["failed"][number]): string {
  return failure.filename === null ? failure.error : `${failure.filename}: ${failure.error}`;
}

/** The toast to fire for one import batch — `kind` indexes `notify`. */
interface ImportNotice {
  readonly kind: "success" | "info" | "error";
  readonly message: string;
}

/** Derive the toast from the REAL per-file outcome. The route answers 200 for an accepted batch even when
 *  every card inside it failed (per-card isolation), so "it didn't throw" is never a success signal — an
 *  all-failed batch says WHY (the server's own reason), and a partial says how many of how many. */
function importNotice({ imported, failed }: CardImportResult): ImportNotice {
  const [firstFailure] = failed;
  if (imported.length === 0) {
    return { kind: "error", message: firstFailure === undefined ? "Couldn't import the card." : cardFailureMessage(firstFailure) };
  }
  if (firstFailure === undefined) {
    return { kind: "success", message: imported.length === 1 ? "Card imported." : `${imported.length} cards imported.` };
  }
  return {
    kind: "info",
    message: `${imported.length} of ${imported.length + failed.length} imported — ${cardFailureMessage(firstFailure)}`,
  };
}

/** The `+` split entry (New / Import card) with its two picker dialogs. */
export function CharacterCreateMenu(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateCharacter({ trpc, invalidation });
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
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
        setCreateOpen(false);
        setName("");
        setDescription("");
      } catch {
        // `createEntityMutation`'s `errorToast` already surfaced the failure — keep the dialog open.
      }
    })();
  };

  const onImportFiles = (accepted: readonly File[]): void => {
    if (accepted.length === 0) {
      return;
    }
    void (async (): Promise<void> => {
      try {
        const result = await importCharacters(accepted);
        const notice = importNotice(result);
        notify[notice.kind](notice.message);
        if (result.imported.length === 0) {
          // Nothing landed — the toast named why; keep the dialog open so the owner can try another file.
          return;
        }
        // A raw multipart POST (not a tRPC mutation) — fire the same user-bus path-invalidate manually.
        invalidation.invalidateUser({ type: "charactersChanged" });
        setImportOpen(false);
      } catch {
        notify.error("Couldn't import the card.");
      }
    })();
  };

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button aria-label="New or import a character" intent="primary" size="icon">
              <Icon icon={Plus} size="sm" />
            </Button>
          }
        />
        <MenuPopup>
          <MenuItem onClick={(): void => setCreateOpen(true)}>New character</MenuItem>
          <MenuItem onClick={(): void => setImportOpen(true)}>Import card</MenuItem>
        </MenuPopup>
      </Menu>

      <FormDialog
        description="Give them a name and a one-line description — you can flesh out the rest in the editor."
        onOpenChange={setCreateOpen}
        open={createOpen}
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

      <FormDialog description="Drop a SillyTavern character card (PNG or JSON)." onOpenChange={setImportOpen} open={importOpen} title="Import card">
        <FileDropzone accept={CARD_ACCEPT} multiple={true} onFilesSelected={({ accepted }): void => onImportFiles(accepted)} />
      </FormDialog>
    </>
  );
}

// The Databank character-scope manager: authoritative attached rows plus the owner-library picker.
// Both writes reconcile from `databankChanged`; the rendered roster never guesses before the bus readback.

import type { CharacterId, DocumentId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// @orb-waive dialog-via-composite(Dialog): this keyset-paged CharacterPicker attaches on selection and has no submit; ends if a picker composite owns this flow.
import { Dialog, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Icon, Plus, Users } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { CharacterPicker } from "#components";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { selectCharacter, setActiveSection } from "#state";
import { useAttachDocumentToCharacter, useDetachDocumentFromCharacter } from "../hooks/use-databank-mutations.ts";

type CharacterAttachment = inferOutput<Trpc["databank"]["listAttachments"]>["characters"][number];

/** The attached-character roster, attach picker, and detach actions for one owned document. */
export function CharacterAttachments({
  characters,
  documentId,
  documentName,
}: {
  readonly characters: readonly CharacterAttachment[];
  readonly documentId: DocumentId;
  readonly documentName: string;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attach = useAttachDocumentToCharacter({ trpc, invalidation });
  const detach = useDetachDocumentFromCharacter({ trpc, invalidation });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const detaching = characters.find((character) => character.id === detach.pendingVariables?.characterId);

  return (
    <Stack gap="row">
      <Stack gap="tight">
        {characters.map((character) => {
          const rowPending = detach.pendingVariables?.characterId === character.id;
          return (
            <Row align="center" gap="field" key={character.id}>
              <CharacterDoor id={character.id} name={character.name} />
              <Button
                aria-label={`Detach ${documentName} from ${character.name}`}
                disabled={attach.isPending || detach.isPending}
                intent="ghost"
                onClick={(): void => detach.mutate({ characterId: character.id, documentId })}
                size="sm"
                type="button"
              >
                {rowPending ? "Detaching…" : "Detach"}
              </Button>
            </Row>
          );
        })}
      </Stack>
      {detaching === undefined ? null : (
        <Text role="status" voice="gloss">
          {`Detaching ${documentName} from ${detaching.name}…`}
        </Text>
      )}
      <Button
        disabled={attach.isPending || detach.isPending}
        intent="secondary"
        onClick={(): void => {
          attach.clearError();
          setPickerOpen(true);
        }}
        size="sm"
        type="button"
      >
        <Icon icon={Plus} size="sm" />
        Attach to a character
      </Button>
      {attach.isPending ? (
        <Text role="status" voice="gloss">
          {`Attaching ${pickedName ?? "character"}…`}
        </Text>
      ) : null}
      {attach.error === null ? null : <MutationRetry copy={`Couldn't attach ${pickedName ?? "that character"}.`} onRetry={attach.retry} />}
      {detach.error === null ? null : <MutationRetry copy="Couldn't detach that character." onRetry={detach.retry} />}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogPopup>
          <Stack gap="block">
            <DialogTitle>Attach to a character</DialogTitle>
            <Text voice="gloss">Choose from your character library. This document will feed chats that include that character.</Text>
            <CharacterPicker
              autoFocusSearch={true}
              emptyText="No unattached characters match."
              excludeIds={characters.map((character) => character.id)}
              label="Attach document to a character"
              onEscape={(): void => setPickerOpen(false)}
              onSelect={(characterId, name): void => {
                setPickedName(name);
                setPickerOpen(false);
                attach.mutate({ characterId, documentId });
              }}
              placeholder="Search your characters…"
              reserveKey="databank.attachCharacterPicker"
            />
          </Stack>
        </DialogPopup>
      </Dialog>
    </Stack>
  );
}

function MutationRetry({ copy, onRetry }: { readonly copy: string; readonly onRetry: () => void }): ReactElement {
  return (
    <Stack gap="field">
      <Text role="alert" voice="gloss">
        {copy}
      </Text>
      <Row>
        <Button intent="secondary" onClick={onRetry} size="sm" type="button">
          Retry
        </Button>
      </Row>
    </Stack>
  );
}

function CharacterDoor({ id, name }: { readonly id: CharacterId; readonly name: string }): ReactElement {
  return (
    <Button className="min-w-0 flex-1 justify-start" intent="ghost" onClick={(): void => openCharacter(id)} size="sm" type="button">
      <Icon icon={Users} size="xs" />
      <Text as="span" className="min-w-0 truncate" voice="label">
        {name}
      </Text>
    </Button>
  );
}

function openCharacter(characterId: CharacterId): void {
  setActiveSection("characters");
  selectCharacter(characterId);
}

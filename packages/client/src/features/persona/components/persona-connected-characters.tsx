// The editor's "Connected characters" section (#866 S4) — the character⇄persona junction driven from the
// PERSONA side, over the `persona.listConnectedCharacters` read (the character editor's relations tab
// drives the same junction from the other end; one junction, two doors). Summary rows + Disconnect, plus
// a Connect picker dialog.
//
// DELIBERATELY NOT `RelationManagerSection` (a recorded deviation): its
// add-picker enumerates a flat `available` array, which is honest for personas (a bounded personal list)
// and a lie for CHARACTERS — the library pages by keyset and a flat first-page array would silently omit
// every card past it (the paginate-vs-find trap). The shared `CharacterPicker` is the house scalable
// picker (server search + keyset walk), so the add door uses it.

import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// @orb-waive dialog-via-composite(Dialog): this keyset-paged CharacterPicker connects on selection and has no submit; ends if a picker composite accepts the paged library.
import { Dialog, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Icon, Plus } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { CharacterPicker } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useConnectCharacter, useDisconnectCharacter } from "../hooks/use-persona-mutations.ts";

/** Connected characters: list + disconnect + the connect picker. Non-suspense read — the editor is an
 *  expansion body and must not blank its siblings while the junction loads. */
export function PersonaConnectedCharacters({ personaId }: { readonly personaId: PersonaId }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const connect = useConnectCharacter({ trpc, invalidation });
  const disconnect = useDisconnectCharacter({ trpc, invalidation });
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: connected } = useQuery(trpc.persona.listConnectedCharacters.queryOptions({ personaId }));

  const onPick = (characterId: CharacterId): void => {
    connect.mutate({ characterId, personaId });
    setPickerOpen(false);
  };

  return (
    <Section heading="Connected characters">
      {connected === undefined || connected.length === 0 ? (
        <Text voice="gloss">{connected === undefined ? "Loading…" : "No characters connected."}</Text>
      ) : (
        <Stack gap="row">
          {connected.map((character) => (
            <ListRow
              key={character.id}
              title={character.name}
              actions={
                <Button intent="ghost" onClick={(): void => disconnect.mutate({ characterId: character.id, personaId })}>
                  Disconnect
                </Button>
              }
            />
          ))}
        </Stack>
      )}
      <Row gap="field">
        <Button intent="secondary" size="sm" onClick={(): void => setPickerOpen(true)}>
          <Icon icon={Plus} size="sm" />
          Connect a character
        </Button>
      </Row>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogPopup>
          <Stack gap="block">
            <DialogTitle>Connect a character</DialogTitle>
            <CharacterPicker
              autoFocusSearch={true}
              emptyText="No characters match."
              excludeIds={(connected ?? []).map((character) => character.id)}
              label="Connect a character"
              onEscape={(): void => setPickerOpen(false)}
              onSelect={onPick}
              placeholder="Search characters…"
              reserveKey="persona.connectCharacterPicker"
            />
          </Stack>
        </DialogPopup>
      </Dialog>
    </Section>
  );
}

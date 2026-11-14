// "Whose messages": the author scope, as two lists the user adds to and removes from. Both empty is everyone, and
// the save boundary stores no scope for it. Characters are picked through the shared `CharacterPicker`; personas
// come from the viewer's own persona list. A stored selector the add menu does not offer (a user id, or a message
// kind with no app word) still lists with its remove control, so nothing stored is invisible.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { PARTICIPANT_KINDS, PARTICIPANT_ROLES } from "@orb/kit/message-author";
import type { RegexAuthorScope, RegexAuthorSelector } from "@orb/kit/regex";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { removeActionName } from "@orb/ui/lib";
import { ListRow } from "@orb/ui/list-row";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { CharacterPicker } from "#components";
import { useTRPC } from "#data";
import type { AppFormInstance } from "#forms/editor";
import { DIALOG_VERBS } from "#lib";
import {
  REGEX_EVERY_AUTHOR,
  REGEX_MESSAGE_KIND_LABELS,
  REGEX_OFFERED_MESSAGE_KINDS,
  REGEX_PARTICIPANT_LABELS,
  REGEX_STANDING_LABELS,
  REGEX_STANDING_NOTE,
  regexSelectorKey,
  withoutSelector,
  withSelector,
} from "../lib/regex-authors.ts";
import {
  REGEX_AUTHORS_ADD_CHARACTER_NAME,
  REGEX_AUTHORS_ADD_NAME,
  REGEX_AUTHORS_CLOSE_CHARACTERS_NAME,
  REGEX_AUTHORS_NOT_NAME,
  REGEX_AUTHORS_ONLY_NAME,
} from "../lib/regex-names.ts";

type RegexEditorForm = Omit<AppFormInstance<CreateRegexScriptInput>, "reset">;

/** What a row says for a selector whose subject is gone: a character deleted from the library, a persona removed. */
const GONE_CHARACTER = "A character no longer in your library";
const GONE_PERSONA = "A persona you no longer have";
const BY_ACCOUNT = "One person, by account";
const LOADING_CHARACTER = "Loading the character…";
const LOADING_PERSONA = "Loading the persona…";

export function RegexAuthorScopeFields({ form }: { readonly form: RegexEditorForm }): ReactElement {
  return (
    <form.AppField name="authors">
      {(field): ReactElement => {
        const scope: RegexAuthorScope = field.state.value ?? REGEX_EVERY_AUTHOR;
        return (
          <Section heading="Whose messages">
            <Stack gap="block">
              <Text voice="gloss">Leave both lists empty to change everyone's messages.</Text>
              <AuthorList
                label={REGEX_AUTHORS_ONLY_NAME}
                selectors={scope.include}
                onChange={(include): void => field.handleChange({ include, exclude: [...scope.exclude] })}
              />
              <AuthorList
                label={REGEX_AUTHORS_NOT_NAME}
                selectors={scope.exclude}
                onChange={(exclude): void => field.handleChange({ include: [...scope.include], exclude })}
              />
              <Text voice="gloss">{REGEX_STANDING_NOTE}</Text>
            </Stack>
          </Section>
        );
      }}
    </form.AppField>
  );
}

function AuthorList({
  label,
  selectors,
  onChange,
}: {
  readonly label: string;
  readonly selectors: readonly RegexAuthorSelector[];
  readonly onChange: (next: RegexAuthorSelector[]) => void;
}): ReactElement {
  const [picking, setPicking] = useState(false);
  const chosen = new Set(selectors.map(regexSelectorKey));
  const add = (selector: RegexAuthorSelector): void => onChange(withSelector(selectors, selector));
  const toggleName = picking ? REGEX_AUTHORS_CLOSE_CHARACTERS_NAME : REGEX_AUTHORS_ADD_CHARACTER_NAME;
  return (
    <Section kicker={label}>
      <Stack gap="field">
        {selectors.length === 0 ? (
          <Text voice="gloss">Nobody yet.</Text>
        ) : (
          <Stack gap="tight" role="list">
            {selectors.map((selector) => (
              <Stack key={regexSelectorKey(selector)} role="listitem">
                <AuthorRow onRemove={(): void => onChange(withoutSelector(selectors, selector))} selector={selector} />
              </Stack>
            ))}
          </Stack>
        )}
        <Row gap="field" wrap={true}>
          <AddMenu chosen={chosen} label={label} onAdd={add} />
          {/* Both lists carry this button, so its name says which list it adds to. */}
          <Button aria-label={`${toggleName}: ${label}`} onClick={(): void => setPicking(!picking)} size="sm" type="button" variant="ghost">
            {toggleName}
          </Button>
        </Row>
        {picking ? (
          <CharacterPicker
            emptyText="No characters found."
            excludeIds={selectors.flatMap((selector) => (selector.by === "character" ? [selector.characterId] : []))}
            label={`${label}: add a character`}
            onSelect={(characterId: CharacterId): void => {
              add({ by: "character", characterId });
              setPicking(false);
            }}
            placeholder="Search characters…"
            reserveKey={`regex.authors.character.${label}`}
          />
        ) : null}
      </Stack>
    </Section>
  );
}

/** The fixed choices and the viewer's personas, minus the ones this list already holds. */
function AddMenu({
  label,
  chosen,
  onAdd,
}: {
  readonly label: string;
  readonly chosen: ReadonlySet<string>;
  readonly onAdd: (selector: RegexAuthorSelector) => void;
}): ReactElement {
  const trpc = useTRPC();
  const personas = useQuery(trpc.persona.list.queryOptions()).data ?? [];
  const fixed: readonly { readonly selector: RegexAuthorSelector; readonly name: string }[] = [
    ...PARTICIPANT_KINDS.map((participant) => ({ selector: { by: "participant", participant } as const, name: REGEX_PARTICIPANT_LABELS[participant] })),
    ...PARTICIPANT_ROLES.map((standing) => ({ selector: { by: "standing", standing } as const, name: REGEX_STANDING_LABELS[standing] })),
    ...REGEX_OFFERED_MESSAGE_KINDS.map((kind) => ({ selector: { by: "kind", kind } as const, name: REGEX_MESSAGE_KIND_LABELS[kind] })),
  ];
  const openFixed = fixed.filter((item) => !chosen.has(regexSelectorKey(item.selector)));
  const openPersonas = personas.filter((persona) => !chosen.has(regexSelectorKey({ by: "persona", personaId: persona.id })));
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button aria-label={`${REGEX_AUTHORS_ADD_NAME} to ${label}`} size="sm" type="button" variant="outline">
            {REGEX_AUTHORS_ADD_NAME}
          </Button>
        }
      />
      <MenuPopup align="start">
        {openFixed.map((item) => (
          <MenuItem key={regexSelectorKey(item.selector)} onClick={(): void => onAdd(item.selector)}>
            {item.name}
          </MenuItem>
        ))}
        {openPersonas.length === 0 ? null : (
          <>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Your personas</MenuGroupLabel>
              {openPersonas.map((persona) => (
                <MenuItem key={persona.id} onClick={(): void => onAdd({ by: "persona", personaId: persona.id })}>
                  {persona.name}
                </MenuItem>
              ))}
            </MenuGroup>
          </>
        )}
      </MenuPopup>
    </Menu>
  );
}

/** One chosen selector. A character or persona row reads its name by id, never by a search over a list page. */
function AuthorRow({ selector, onRemove }: { readonly selector: RegexAuthorSelector; readonly onRemove: () => void }): ReactElement {
  switch (selector.by) {
    case "participant":
      return <NamedAuthorRow name={REGEX_PARTICIPANT_LABELS[selector.participant]} onRemove={onRemove} />;
    case "standing":
      return <NamedAuthorRow name={REGEX_STANDING_LABELS[selector.standing]} onRemove={onRemove} />;
    case "kind":
      return <NamedAuthorRow name={REGEX_MESSAGE_KIND_LABELS[selector.kind]} onRemove={onRemove} />;
    case "character":
      return <CharacterAuthorRow characterId={selector.characterId} onRemove={onRemove} />;
    case "persona":
      return <PersonaAuthorRow onRemove={onRemove} personaId={selector.personaId} />;
    case "user":
      return <NamedAuthorRow name={BY_ACCOUNT} onRemove={onRemove} />;
    default:
      return assertNeverSelector(selector);
  }
}

function assertNeverSelector(selector: never): never {
  throw new Error(`unhandled regex author selector ${JSON.stringify(selector)}`);
}

function CharacterAuthorRow({ characterId, onRemove }: { readonly characterId: CharacterId; readonly onRemove: () => void }): ReactElement {
  const trpc = useTRPC();
  const query = useQuery(trpc.character.get.queryOptions({ characterId }));
  // A pending read is not a deleted character: only a finished read without one says it is gone.
  const name = query.isPending ? LOADING_CHARACTER : (query.data?.name ?? GONE_CHARACTER);
  return <NamedAuthorRow name={name} onRemove={onRemove} />;
}

function PersonaAuthorRow({ personaId, onRemove }: { readonly personaId: PersonaId; readonly onRemove: () => void }): ReactElement {
  const trpc = useTRPC();
  const query = useQuery(trpc.persona.list.queryOptions());
  const name = query.isPending ? LOADING_PERSONA : (query.data?.find((persona) => persona.id === personaId)?.name ?? GONE_PERSONA);
  return <NamedAuthorRow name={name} onRemove={onRemove} />;
}

function NamedAuthorRow({ name, onRemove }: { readonly name: string; readonly onRemove: () => void }): ReactElement {
  return (
    <ListRow
      actions={
        <Button aria-label={removeActionName(name)} onClick={onRemove} size="sm" type="button" variant="ghost">
          {DIALOG_VERBS.remove}
        </Button>
      }
      title={name}
    />
  );
}

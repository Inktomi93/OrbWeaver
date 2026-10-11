// persona-collision-review — the SillyTavern folder preflight's per-persona question: a persona in the folder
// shares a name with one you own but differs in content. Each block says WHAT differs, shows the differing
// text in full (clamped, expandable), and states what each answer does inside the option itself, so tapping
// the sentence selects it. Merge is the preselected answer; nothing is applied until Import is pressed.

import type { PersonaCollision, PersonaCollisionChoice, PersonaCollisionChoices, PersonaDifference } from "@orb/contracts/import";
import { DEFAULT_PERSONA_COLLISION_CHOICE } from "@orb/contracts/import";
import { Button } from "@orb/ui/button";
import { Fieldset, FieldsetLegend } from "@orb/ui/fieldset";
import { Row, Stack } from "@orb/ui/layout";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { Fragment, useId, useState } from "react";

/** Past this many characters a description is clamped to a few lines with a Show all control. */
const CLAMP_CHARS = 280;

const DIFFERENCE_NOUN: Readonly<Record<PersonaDifference, string>> = {
  description: "description",
  avatar: "avatar",
  title: "title",
  placement: "placement settings",
};

/** "description", "description and avatar", "description, avatar and title". */
function nounList(differs: readonly PersonaDifference[]): string {
  const nouns = differs.map((d) => DIFFERENCE_NOUN[d]);
  const last = nouns.at(-1);
  return nouns.length < 2 ? (last ?? "") : `${nouns.slice(0, -1).join(", ")} and ${last ?? ""}`;
}

/** The sentence under the persona's name: what the two versions do and do not share. */
function differenceSentence(differs: readonly PersonaDifference[]): string {
  const same = differs.includes("description") ? "" : "Same description. ";
  const verb = differs.length === 1 ? "differs" : "differ";
  return `${same}The ${nounList(differs)} ${verb}.`;
}

/** A description in full, in the reading voice; long ones are clamped and expand in place. The whole text is
 *  always in the DOM, so a screen reader hears it all whether or not it is expanded. `id` names the label and
 *  text only (what a description reference should read); the Show all button sits outside it and controls
 *  the text. */
function DescriptionBlock({ label, text, id }: { readonly label: string; readonly text: string; readonly id: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const textId = `${id}-text`;
  const long = text.length > CLAMP_CHARS;
  const shown = text.trim().length === 0 ? "No description." : text;
  return (
    <Stack gap="tight">
      <Stack gap="tight" id={id}>
        <Text voice="label">{label}</Text>
        <Text id={textId} voice="reading" className={`max-w-(--reading-measure-prose) whitespace-pre-wrap break-words ${long && !open ? "line-clamp-4" : ""}`}>
          {shown}
        </Text>
      </Stack>
      {long ? (
        <Row justify="start">
          <Button intent="secondary" size="sm" aria-controls={textId} aria-expanded={open} onClick={(): void => setOpen(!open)}>
            {open ? "Show less" : "Show all"}
          </Button>
        </Row>
      ) : null}
    </Stack>
  );
}

/** An option's label: its name, then what choosing it does, in the same tap target. */
function OptionLabel({ title, consequence }: { readonly title: string; readonly consequence: string }): ReactElement {
  return (
    <Stack gap="tight" className="min-w-0">
      <Text as="span" voice="label">
        {title}
      </Text>
      <Text as="span" voice="quiet" className="max-w-(--reading-measure-prose)">
        {consequence}
      </Text>
    </Stack>
  );
}

function PersonaCollisionBlock({
  collision,
  choice,
  onChoose,
}: {
  readonly collision: PersonaCollision;
  readonly choice: PersonaCollisionChoice;
  readonly onChoose: (choice: PersonaCollisionChoice) => void;
}): ReactElement {
  const base = useId();
  const ids = { diff: `${base}-diff`, yours: `${base}-yours`, theirs: `${base}-import` };
  const name = collision.name.trim();
  const descriptionDiffers = collision.differs.includes("description");
  const comparison = descriptionDiffers ? `${ids.diff} ${ids.yours} ${ids.theirs}` : `${ids.diff} ${ids.yours}`;
  return (
    <Fieldset data-slot="persona-collision">
      <Stack gap="field">
        <FieldsetLegend>
          <Text as="span" voice="promoted">{`“${name}”`}</Text>
        </FieldsetLegend>
        <Text voice="reading" id={ids.diff}>
          {differenceSentence(collision.differs)}
        </Text>
        {descriptionDiffers ? (
          <>
            <DescriptionBlock id={ids.yours} label="Yours" text={collision.existingDescription} />
            <DescriptionBlock id={ids.theirs} label="In the import" text={collision.incomingDescription} />
          </>
        ) : (
          <DescriptionBlock id={ids.yours} label="Description (the same in both)" text={collision.existingDescription} />
        )}
        <RadioGroup aria-describedby={comparison} value={choice} onValueChange={(next): void => onChoose(next === "keep-both" ? "keep-both" : "merge")}>
          <RadioGroupItem value="merge">
            <OptionLabel
              title="Merge into your existing persona"
              consequence={`Keeps your “${name}” as it is and discards the imported ${nounList(collision.differs)}. Chats from this folder link to your persona.`}
            />
          </RadioGroupItem>
          <RadioGroupItem value="keep-both">
            <OptionLabel
              title="Keep both"
              consequence={`Adds the imported persona as “${collision.keepBothName}” beside your “${name}”. Chats from this folder link to the copy.`}
            />
          </RadioGroupItem>
        </RadioGroup>
      </Stack>
    </Fieldset>
  );
}

/** The preflight's persona question: a one-line summary, Merge all / Keep all from two collisions up, then one
 *  block per persona, divided. */
export function PersonaCollisionReview({
  collisions,
  choices,
  onChoose,
  onChooseAll,
}: {
  readonly collisions: readonly PersonaCollision[];
  readonly choices: PersonaCollisionChoices;
  readonly onChoose: (key: string, choice: PersonaCollisionChoice) => void;
  readonly onChooseAll: (choice: PersonaCollisionChoice) => void;
}): ReactElement | null {
  if (collisions.length === 0) {
    return null;
  }
  const many = collisions.length > 1;
  return (
    <Stack gap="block" data-slot="persona-collision-review">
      <Text voice="reading">
        {many
          ? `${String(collisions.length)} personas in this folder share a name with one of yours but differ in content. Choose for each.`
          : "1 persona in this folder shares a name with one of yours but differs in content. Choose what happens to it."}
      </Text>
      {many ? (
        <Row justify="start" gap="field">
          <Button intent="secondary" size="sm" onClick={(): void => onChooseAll("merge")}>
            Merge all
          </Button>
          <Button intent="secondary" size="sm" onClick={(): void => onChooseAll("keep-both")}>
            Keep all
          </Button>
        </Row>
      ) : null}
      {collisions.map((collision, index) => (
        <Fragment key={collision.key}>
          {index === 0 ? null : <Separator />}
          <PersonaCollisionBlock
            collision={collision}
            choice={choices[collision.key] ?? DEFAULT_PERSONA_COLLISION_CHOICE}
            onChoose={(choice): void => onChoose(collision.key, choice)}
          />
        </Fragment>
      ))}
    </Stack>
  );
}

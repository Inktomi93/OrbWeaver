// The Characters create doors — the ratified band anatomy (the presets band's landed precedent): exactly ONE
// primary (New) with Import beside it as a GHOST icon, a secondary entry into the same "get a character" job. Replaces
// the former `+` split MENU, which buried both verbs one click deep and homed import outside the band grammar.
//
// Three exports, one per door:
//   • `CharacterImportDoor`   — Import, the ghost icon, with its dialog.
//   • `CharacterNewDoor`      — New, with its dialog: the word in the band, the icon in the phone topbar.
//   • `CharacterLandingDoors` — the CONTENT landing's pair (#864), spelled out, and rendered only in the
//     arm where the band is off screen (see its own note for how that squares with Import's ONE home).
// The band lists the two band doors as separate actions, and so does the phone's topbar trail, so each row folds Import
// into its menu first and keeps New (`components/overflow-actions.tsx`). Each door answers `characterDoors` for the
// menu command that stands in for it. All three share the one `NewCharacterDialog` and the one `CharacterImportDialog`,
// so no two entry points can mint differently.

import { slugifyHandle } from "@orb/kit/slug";
import { Button } from "@orb/ui/button";
import { Icon, Plus, Upload } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import { FormDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { DIALOG_VERBS, useOpenRequests } from "#lib";
import { selectCharacter } from "#state";
import { useCreateCharacter } from "../hooks/use-character-mutations.ts";
import { characterDoors } from "../lib/character-door-requests.ts";
import {
  CHARACTER_DESCRIPTION_FIELD_NAME,
  CHARACTER_IMPORT_CARD_NAME,
  CHARACTER_IMPORT_NAME,
  CHARACTER_NAME_FIELD_NAME,
  CHARACTER_NEW_NAME,
} from "../lib/character-names.ts";
import { CHARACTER_CREATE_FAILED, characterMutationToast, characterRefusalCopy } from "../lib/character-refusal-notice.ts";
import { CharacterImportDialog } from "./character-import-dialog.tsx";

/** The minimal create: name + one-line description, handle auto-derived from the name. */
function NewCharacterDialog({ open, onOpenChange }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  // Every failure has a line here while the dialog is open, so the toast speaks only once the dialog is gone.
  const create = useCreateCharacter({ trpc, invalidation, failureShownInline: open ? "the create-character refusal line" : undefined });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  /** The refusal line's own id — what `aria-errormessage` on the Name field points at (#548). */
  const refusalId = useId();
  const incomplete = name.trim() === "" || description.trim() === "";
  // The typed, user-fixable refusal for the last attempt (#542) — `null` for a fault, which the line states in the
  // fallback's words without blaming the name. `clearError` on the name edit is what makes it a live claim: the
  // sticky error slot would otherwise keep accusing a name the user has already changed.
  const refusal = characterRefusalCopy(create.error);
  const failure = create.error === null ? null : characterMutationToast(create.error, CHARACTER_CREATE_FAILED);
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
      description="Give them a name and a one-line description. You can flesh out the rest in the editor."
      onOpenChange={onOpenChange}
      open={open}
      submit={{ label: DIALOG_VERBS.create, disabled: incomplete || create.isPending, onSubmit: onCreate }}
      title={CHARACTER_NEW_NAME}
    >
      <Stack gap="field">
        {/* The four-voice grammar (density §2.3): a field caption is the NAME OF ONE DATUM → `label`.
            Tone rides a className, the landed dialog precedent (create-schedule-dialog). */}
        <Text as="span" ink="muted" voice="label">
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
          aria-label={CHARACTER_NAME_FIELD_NAME}
          onValueChange={onNameChange}
          placeholder="e.g. Elara Vance"
          value={name}
          {...(refusal === null ? {} : { "aria-errormessage": refusalId, "aria-invalid": true })}
        />
        {/* THE LINE SITS UNDER THE FIELD IT IS ABOUT (#548). It used to render below BOTH controls, where
            its only tie to the Name box was the sentence's own wording — for a sighted reader "at the
            control" (the #542 note's own WCAG 3.3.1 cite) means adjacent, not somewhere in the dialog. */}
        {failure === null ? null : (
          <Text tone="destructive" id={refusalId} role="alert" voice="label">
            {failure}
          </Text>
        )}
        <Text as="span" ink="muted" voice="label">
          Description
        </Text>
        <Textarea
          aria-label={CHARACTER_DESCRIPTION_FIELD_NAME}
          onChange={(event): void => setDescription(event.target.value)}
          placeholder="A wandering cartographer with a sharp tongue."
          value={description}
        />
      </Stack>
      {/* LOAD-BEARING: it names why Create is disabled, so it keeps the `label` voice (the landed
          requirement/error line grammar), never the receding `gloss`. It speaks for BOTH fields, so this
          is where it belongs — unlike the #542 refusal line, which moved up under the Name field it is
          about (#548, see its note there). */}
      {incomplete ? (
        <Text ink="muted" voice="label">
          A name and a description are both required.
        </Text>
      ) : null}
    </FormDialog>
  );
}

/**
 * The LANDING's door pair — `New character` (primary) + `Import a card` (ghost), each with its LABEL
 * spelled out (#864).
 *
 * WHY IT IS NOT THE BAND'S DOORS (`CharacterNewDoor`, `CharacterImportDoor`): those are tuned for a band — `New`
 * alone (the band's own kicker supplies "characters"), Import as an icon-only ghost. The landing has no
 * kicker over it and no adjacent list, so both verbs have to say what they make.
 *
 * WHY IT ECHOES IMPORT AT ALL, when this file's header records Import's ONE home as the band: THE RULING
 * SURVIVES — ITS INPUT CHANGED. Its stated reason is "the band's ghost sits directly above the same pane",
 * and this pair renders only in the arm where that sentence is FALSE — the list is collapsed, so the band
 * went off screen with it (the same condition #520 puts the hero's New behind, and for the same reason:
 * never two doors on screen at once, never a pane you cannot act from). With the list docked the landing
 * renders no doors at all and points at the band's by its visible label.
 *
 * Both dialogs are the same two this file already owns, so the band and the landing can never mint
 * differently.
 */
export function CharacterLandingDoors(): ReactElement {
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  return (
    <Row align="center" wrap={true} cap="fit" gap="field">
      <Button onClick={(): void => setCreateOpen(true)} size="sm">
        <Icon icon={Plus} size="sm" />
        New character
      </Button>
      {/* THE SECONDARY ENTRY RECEDES (#1256, 2026-09-02 — the #1141/#1244/#1249 fork, sixth instance). This
          file's own header calls Import "beside it as a GHOST icon, a secondary entry into the same 'get a
          character' job" — #969 flipped `ghost` to `text-current`, so it now paints at the same weight as
          the primary beside it. The primitive keeps inheriting; this composite states its own ink. */}
      <Button variant="ghost" ink="muted" onClick={(): void => setImportOpen(true)} size="sm">
        <Icon icon={Upload} size="sm" />
        {CHARACTER_IMPORT_CARD_NAME}
      </Button>
      <NewCharacterDialog onOpenChange={setCreateOpen} open={createOpen} />
      <CharacterImportDialog onOpenChange={setImportOpen} open={importOpen} />
    </Row>
  );
}

/** Import, the band's secondary: a ghost icon, with its dialog. */
export function CharacterImportDoor(): ReactElement {
  const [open, setOpen] = useState(false);
  useOpenRequests(characterDoors, (door): void => {
    if (door === "import") {
      setOpen(true);
    }
  });
  return (
    <>
      {/* An `sm` `square`, NOT a plain `sm` (side-eye 2026-08-30 rail-characters P2, #842). An icon-only `sm` button is a
          control-HEIGHT box with `px-block` of width: 40×44 at a coarse pointer, i.e. 4px under the touch
          floor on its short side, corroborated by a four-cardinal `elementFromPoint` losing the point at
          ±21px horizontally and by `getComputedStyle(el,"::after").content === "none"` (a `sm` button
          carries no hit-area pseudo — the 40px box IS the target). The `sm` square is the same control step as a
          SQUARE (`size-control-sm p-0`), so it is 44×44 on coarse and 32×32 on fine, the height it
          already had and the width it was missing. Not a `glyph-*` step: those are pointer-INDEPENDENT
          display boxes that would have shrunk the visible target beside the `sm` New primary. */}
      {/* THE SAME SECONDARY-ENTRY RULING AS `CharacterLandingDoors` (#1256) — the band's own icon-only
          twin of the same Import door, beside the same `New` primary. */}
      <Button aria-label={CHARACTER_IMPORT_NAME} variant="ghost" ink="muted" onClick={(): void => setOpen(true)} size="sm" square={true}>
        <Icon icon={Upload} size="sm" />
      </Button>
      <CharacterImportDialog onOpenChange={setOpen} open={open} />
    </>
  );
}

/** New, the primary, with its dialog. `iconOnly` is the phone topbar's form; the band shows the word, and the row swaps
 *  in its own icon form when the word does not fit.
 *
 *  An icon-only `New` names nothing, so that form names itself `New character`; "New" is contained in it, so a
 *  voice-control user saying what they can see reaches the door in either form (WCAG 2.5.3). */
export function CharacterNewDoor({ iconOnly = false }: { readonly iconOnly?: boolean }): ReactElement {
  const [open, setOpen] = useState(false);
  useOpenRequests(characterDoors, (door): void => {
    if (door === "create") {
      setOpen(true);
    }
  });
  return (
    <>
      {iconOnly ? (
        <Button aria-label={CHARACTER_NEW_NAME} onClick={(): void => setOpen(true)} size="sm" square={true} type="button">
          <Icon icon={Plus} size="sm" />
        </Button>
      ) : (
        <Button onClick={(): void => setOpen(true)} size="sm">
          <Icon icon={Plus} size="sm" />
          New
        </Button>
      )}
      <NewCharacterDialog onOpenChange={setOpen} open={open} />
    </>
  );
}

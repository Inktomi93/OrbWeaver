// The Characters LIST band's create cluster — the ratified band anatomy (the presets band's landed
// precedent): exactly ONE primary (New) with Import beside it as a GHOST icon, a secondary entry into the
// same "get a character" job. Replaces the former `+` split MENU, which buried both verbs one click deep
// and homed import outside the band grammar.
//
// Two exports, one per SURFACE that carries a door:
//   • `CharacterCreateActions` — the BAND cluster (Import ghost + New primary), the band's tuning.
//   • `CharacterLandingDoors`  — the CONTENT landing's pair (#864), spelled out, and rendered only in the
//     arm where the band is off screen (see its own note for how that squares with Import's ONE home).
// Both share the one `NewCharacterDialog` and the one `CharacterImportDialog`, so no two entry points can
// mint differently.
//
// `CharacterCreateButton` USED TO BE A THIRD EXPORT — New alone, for the empty states, on the ruling that
// "an empty pane may not dead-end". The ruling stands; its CONSUMER is gone. The Characters CONTENT pane at
// rest is a landing now (#864) and carries `CharacterLandingDoors` in exactly the arm the hero's lone New
// used to cover, so the bare button is file-local again — the band's own primary and nothing else. Left
// EXPORTED it is an unused export (knip), which is a door nobody opens.

import { slugifyHandle } from "@orb/kit/slug";
import { Button } from "@orb/ui/button";
import { DialogClose } from "@orb/ui/dialog";
import { Icon, Plus, Upload } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { RECEDED_INK } from "@orb/ui/lib";
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

// ── THE BAND'S NARROW ARM (#1697, side-eye 2026-09-05) ───────────────────────────────────────────────
// THE DEFECT. Docking the CONTEXT pane fires shell.css's #242 conditional squeeze and narrows the LIST
// track 307 → 272px. The band is `space-between` with two flex children, and only ONE of them may shrink:
// the identity cluster carries `min-w-0`, while the action cluster's two buttons hold their intrinsic
// widths. So the section's own NAME was the first thing to give up width, and it gave it up in the state
// the section exists for — measured on the tree, `[data-slot="list-pane-title"] span`:
//
//   pane 307 → band 306 · identity 159 · title lane 127 of 127 needed · import 32 · New 74   → `Characters`
//   pane 272 → band 271 · identity 127 · title lane  95 of 127 needed · import 32 · New 74   → `Chara…`
//
// THE THRESHOLD IS DERIVED, NOT PICKED. The band spends `pane − 1 (border) − 24 (padding-inline) − 8 (band
// gap) − 6 (action gap) − 32 (import) − 74 (labelled New) = pane − 145` on the identity cluster, and the
// identity cluster needs `127 (the word "Characters" at the display step) + 8 (the row gap) + 24 (a bare
// three-digit census) = 159`. So the labelled arm fits exactly while `pane >= 304`, which is 19rem — the
// clean step the measurement lands on, which is why the literal is a rem and not a pixel count.
//
// WIDTH-KEYED, NOT VIEWPORT-KEYED, AND CSS-ONLY. The question is "how wide is THIS PANE", which no viewport
// media query can answer (the same 1440px desktop produces both widths) — and `.shell-panel` is already an
// `inline-size` container, so the unnamed container variants below resolve against exactly the box whose
// squeeze caused the defect. A JS branch would also be the wrong tier: chrome that responds to its own box
// is a CSS decision here by the same reasoning `pager-chrome.ts` records for the swipe strip.
//
// A CONTAINER QUERY CONDITION CANNOT READ A CUSTOM PROPERTY (`var()` is invalid in `@container`), so this
// threshold cannot ride the spacing tokens the band is built from — the derivation above is what keeps it
// honest, exactly as the pager module's own thresholds do.
//
// WHY A DISPLAY PAIR RATHER THAN HIDING THE WORD. `sr-only`-ing the label inside one button would leave a
// 16px glyph wearing a TEXT step's `px-block` padding: a 40px-wide box at a control-step height, which is
// the #842 shape (an icon-only control 4px under the touch floor on its short side at a coarse pointer)
// that the import ghost beside it already had to be rebuilt to escape. Two buttons gated by `display` give
// the narrow arm a real `icon-sm` SQUARE — 32px fine, 44px coarse — and put exactly one of the pair in
// layout, and therefore in the a11y tree, at any given pane width.

/** The LABELLED arm: stands down below the derived 19rem pane width. */
const CREATE_LABELLED_ARM = "@max-[19rem]:hidden";

/** The ICON-ONLY arm: exists only below it. Tailwind v4 emits these as the complementary range conditions
 *  (`width < 19rem` / `width >= 19rem`), so the pair can neither overlap nor leave a gap at the boundary. */
const CREATE_ICON_ARM = "@[19rem]:hidden";

/** The band's primary, alone — file-local (see the header for why it is no longer exported).
 *
 *  TWO ARMS, ONE DOOR: the same dialog state, the same verb, one of them in layout per pane width (see the
 *  block above). The narrow arm names itself `New character` because an icon-only `New` names nothing; the
 *  wide arm is named by the word it paints, and "New" is contained in "New character", so a voice-control
 *  user saying what they can see reaches the door in either arm (WCAG 2.5.3). */
function CharacterCreateButton(): ReactElement {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <Button className={CREATE_LABELLED_ARM} intent="primary" onClick={(): void => setCreateOpen(true)} size="sm">
        <Icon icon={Plus} size="sm" />
        New
      </Button>
      <Button aria-label="New character" className={CREATE_ICON_ARM} intent="primary" onClick={(): void => setCreateOpen(true)} size="icon-sm" type="button">
        <Icon icon={Plus} size="sm" />
      </Button>
      <NewCharacterDialog onOpenChange={setCreateOpen} open={createOpen} />
    </>
  );
}

/**
 * The LANDING's door pair — `New character` (primary) + `Import a card` (ghost), each with its LABEL
 * spelled out (#864).
 *
 * WHY IT IS NOT `CharacterCreateActions`: that cluster is the BAND's, and it is tuned for a band — `New`
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
    <Row align="center" gap="field">
      <Button intent="primary" onClick={(): void => setCreateOpen(true)} size="sm">
        <Icon icon={Plus} size="sm" />
        New character
      </Button>
      {/* THE SECONDARY ENTRY RECEDES (#1256, 2026-09-02 — the #1141/#1244/#1249 fork, sixth instance). This
          file's own header calls Import "beside it as a GHOST icon, a secondary entry into the same 'get a
          character' job" — #969 flipped `ghost` to `text-current`, so it now paints at the same weight as
          the primary beside it. The primitive keeps inheriting; this composite states its own ink. */}
      <Button className={RECEDED_INK} intent="ghost" onClick={(): void => setImportOpen(true)} size="sm">
        <Icon icon={Upload} size="sm" />
        Import a card
      </Button>
      <NewCharacterDialog onOpenChange={setCreateOpen} open={createOpen} />
      <CharacterImportDialog onOpenChange={setImportOpen} open={importOpen} />
    </Row>
  );
}

/** The band cluster: Import (ghost) + New (primary), each with its dialog. */
export function CharacterCreateActions(): ReactElement {
  const [importOpen, setImportOpen] = useState(false);
  return (
    <>
      {/* ONE flex child, so the band's space-between keeps the cluster hard against the trailing edge. */}
      <Row align="center" gap="field">
        {/* `icon-sm`, NOT `sm` (side-eye 2026-08-30 rail-characters P2, #842). An icon-only `sm` button is a
            control-HEIGHT box with `px-block` of width: 40×44 at a coarse pointer, i.e. 4px under the touch
            floor on its short side, corroborated by a four-cardinal `elementFromPoint` losing the point at
            ±21px horizontally and by `getComputedStyle(el,"::after").content === "none"` (a `sm` button
            carries no hit-area pseudo — the 40px box IS the target). `icon-sm` is the same control step as a
            SQUARE (`size-control-sm p-0`), so it is 44×44 on coarse and 32×32 on fine, the height it
            already had and the width it was missing. Not a `glyph-*` step: those are pointer-INDEPENDENT
            display boxes that would have shrunk the visible target beside the `sm` New primary. */}
        {/* THE SAME SECONDARY-ENTRY RULING AS `CharacterLandingDoors` (#1256) — the band's own icon-only
            twin of the same Import door, beside the same `New` primary. */}
        <Button aria-label="Import a character card" className={RECEDED_INK} intent="ghost" onClick={(): void => setImportOpen(true)} size="icon-sm">
          <Icon icon={Upload} size="sm" />
        </Button>
        <CharacterCreateButton />
      </Row>
      <CharacterImportDialog onOpenChange={setImportOpen} open={importOpen} />
    </>
  );
}

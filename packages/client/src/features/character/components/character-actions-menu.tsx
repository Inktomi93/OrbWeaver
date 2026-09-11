// The CONTEXT Actions menu — the persistent options menu above the CONTEXT tab strip. Its items are the
// `open` slice of the ONE character action vocabulary (`../lib/character-actions.ts`); this file owns the
// HANDLERS and the confirm copy, never the item list or its labels. Duplicate and Delete sit behind a
// `ConfirmDialog` interrupt, opened via controlled state outside the Menu (a menu item closes the menu on
// click).
//
// "OPEN IN REFINERY" IS A CROSS-SECTION DOOR, AND IT IS NOT A SIDEWAYS IMPORT (owner scope-add,
// 2026-08-17, #157 — "the CHARACTERS section gains an 'Open in Refinery' affordance that jumps straight
// into a refinery session on that character"). A feature may never import another feature, so the flow
// lives at the shared client seam (`#data`'s `useOpenRefinery`) exactly as this feature's own "New chat"
// rides `#data`'s `useStartChat` — same tier, same reason, and `lib/character-chat-intents.ts` is the
// precedent this follows. It is the SAME flow the refinery's two own doors fire, so this jump obeys the
// resume-or-mint rule (#79) rather than minting a duplicate session per press.
//
// EXPORT WAS DELIBERATELY ABSENT HERE UNTIL 2026-08-30 — THE RULING SURVIVES, ITS INPUT CHANGED (#838,
// orchestrator ruling on the side-eye rail-characters-delta P1). The recorded ruling this file used to
// carry ("card export homes on the character LIST row kebab, its ONE home … no lifecycle chrome in the
// editor") restates D121 clause D: "band = Import · kebab = Export · zero lifecycle chrome in editors and
// rooms … an editor surface or a chat room carries NEITHER". That clause's NEGATIVE half names exactly two
// forbidden hosts, and this menu is neither: it is the CONTEXT pane's kebab, not the CONTENT editor and not
// a room — so D121's POSITIVE half (kebab = Export) is what governs it. What died is the assumption that
// "one home" meant one RENDER SITE. It means one MINT: `Export card`, its two containers and its
// `/api/export/character/:id` route are declared once in the action registry and rendered by both kebabs,
// so there is still exactly one serialization path and no lifecycle chrome anywhere in the editor body.
// What was measured as the cost of the old reading: with a character OPEN there was no on-screen path to
// export her card at all, and the reviewer driving the surface concluded the app could not export.

import type { CharacterId } from "@orb/kit/ids";
import { Icon } from "@orb/ui/icons";
import { MenuItem, MenuLinkItem, MenuPopup, MenuSubmenuRoot, MenuSubmenuTrigger } from "@orb/ui/menu";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, RowActionsMenu } from "#components";
import { useInvalidation, useOpenRefinery, useTRPC } from "#data";
import { clearCharacterSelection, selectCharacter } from "#state";
import { useCreatePersonaFromCharacter, useDuplicateCharacter, useRemoveCharacter, useSetWelcomeGreeter } from "../hooks/use-character-context-mutations.ts";
import { useUpdateCharacter } from "../hooks/use-character-mutations.ts";
import type { CHARACTER_ACTION_SCOPE_IDS } from "../lib/character-actions.ts";
import { CHARACTER_ACTIONS, characterActionItemsForScope, characterActionLabel, EXPORT_CHARACTER_PATH } from "../lib/character-actions.ts";

/** File-local — exactly the verbs the `open` scope offers, so a verb added to that scope is a `tsc` error
 *  here until it is wired. */
type OpenActionId = (typeof CHARACTER_ACTION_SCOPE_IDS)["open"][number];

export interface CharacterActionsMenuProps {
  readonly characterId: CharacterId;
}

export function CharacterActionsMenu({ characterId }: CharacterActionsMenuProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const duplicate = useDuplicateCharacter({ trpc, invalidation });
  const remove = useRemoveCharacter({ trpc, invalidation });
  const convert = useCreatePersonaFromCharacter({ trpc, invalidation });
  const setWelcome = useSetWelcomeGreeter({ trpc, invalidation });
  const update = useUpdateCharacter({ trpc, invalidation });
  const { openRefinery } = useOpenRefinery();
  // NON-suspending (the relations-tab pattern): the archive verb needs the character's CURRENT state to
  // wear the right face, and this kebab renders beside an editor that has already fetched the same detail.
  // An unresolved read degrades to "not archived", which is the same face the menu showed before #838.
  const detail = useQuery(trpc.character.get.queryOptions({ characterId }));
  const archived = detail.data?.archived ?? false;

  const [duplicateOpen, setDuplicateOpen] = useState(false);

  const confirmDuplicate = (): void => {
    void duplicate
      .mutateAsync({ characterId })
      .then((created) => selectCharacter(created.id))
      .catch(() => undefined);
  };
  const confirmDelete = (): void => {
    void remove
      .mutateAsync({ characterId })
      .then(() => clearCharacterSelection())
      .catch(() => undefined);
  };

  /** Every verb the `open` scope offers, wired. `null` = not click-dispatched from this map: `exportCard`
   *  renders as download LINKS (its containers are the registry's), and `delete` rides `RowActionsMenu`'s
   *  destructive slot with the confirm copy below. */
  const handlers: Readonly<Record<OpenActionId, (() => void) | null>> = {
    openInRefinery: (): void => {
      // @orb-waive caught-failure-ownership(openRefinery): useOpenRefinery's own errorToast surfaces the failure; a failed open just leaves the actor on this menu. Ends if useOpenRefinery drops its errorToast.
      void openRefinery(characterId).catch(() => undefined);
    },
    archive: (): void => update.mutate({ characterId, input: { archived: !archived } }),
    duplicate: (): void => setDuplicateOpen(true),
    exportCard: null,
    convertToPersona: (): void => convert.mutate({ characterId, swapMacros: true }),
    setWelcomeGreeter: (): void =>
      setWelcome.mutate({
        section: "seeds",
        patch: { welcomeAssistantCharacterId: characterId },
      }),
    delete: null,
  };

  return (
    <>
      <RowActionsMenu
        align="start"
        label="Character actions"
        destructive={{
          label: CHARACTER_ACTIONS.delete.label,
          title: "Delete this character?",
          description: "This permanently deletes the character and everything attached to it. This can't be undone.",
          onConfirm: confirmDelete,
        }}
      >
        {characterActionItemsForScope("open").map((action) => {
          const label = characterActionLabel(action, { archived });
          if (action.formats.length > 0) {
            return (
              <MenuSubmenuRoot key={action.id}>
                <MenuSubmenuTrigger>
                  <Icon icon={action.glyph} size="sm" />
                  {label}
                </MenuSubmenuTrigger>
                <MenuPopup>
                  {action.formats.map((format) => (
                    <MenuLinkItem download={true} href={`${EXPORT_CHARACTER_PATH}${characterId}${format.query}`} key={format.query}>
                      {format.label}
                    </MenuLinkItem>
                  ))}
                </MenuPopup>
              </MenuSubmenuRoot>
            );
          }
          const onClick = handlers[action.id];
          return onClick === null ? null : (
            <MenuItem key={action.id} onClick={onClick}>
              <Icon icon={action.glyph} size="sm" />
              {label}
            </MenuItem>
          );
        })}
      </RowActionsMenu>

      <ConfirmDialog
        confirmIntent="primary"
        confirmLabel={CHARACTER_ACTIONS.duplicate.label}
        description="This creates an independent copy of the card. The copy opens in the editor."
        onConfirm={confirmDuplicate}
        onOpenChange={setDuplicateOpen}
        open={duplicateOpen}
        title="Duplicate this character?"
      />
    </>
  );
}

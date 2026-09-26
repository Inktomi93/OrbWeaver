// The one roster start door: the picker, the library editor and the Home tile all start a chat here.
// `startChat` mints the room atomically, with the roster's game when it carries one (D264). The additive,
// idempotent `applyToChat` polish follows, so a failed polish is retried through "Add to chat".

import type { ApplyRosterPresetResult, RosterPresetSummary } from "@orb/contracts/roster-preset";
import { useInvalidation, useStartChat, useTRPC } from "#data";
import { notify } from "#lib";
import { applyNotice } from "../lib/roster-copy.ts";
import { useApplyRosterPreset } from "./use-roster-preset-mutations.ts";
import { useRulePresetCatalogue } from "./use-saved-rosters.ts";

/** What a start reads off a roster. Both the list summary and the editor's full view carry these fields. */
type StartableRoster = Pick<RosterPresetSummary, "anchorPersonaId" | "game" | "id" | "members" | "name">;

export interface UseStartRosterResult {
  /** Start a chat from `roster` and report what landed. Failures are toasted by the two mutations' own
   *  `errorToast`s, so the caller has nothing to await or catch. */
  readonly startRoster: (roster: StartableRoster) => void;
  /** True from the press until the apply report lands — the doors disable off this, so a double press
   *  cannot mint two rooms for one intent. */
  readonly isPending: boolean;
}

/** `onEntered` runs once the room exists and the app is in it, before the polish call — the picker closes
 *  its modal there so the room paints while the apply runs. */
export function useStartRoster(options: { readonly onEntered?: () => void } = {}): UseStartRosterResult {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const apply = useApplyRosterPreset({ trpc, invalidation });
  const { startChat, isPending: isStarting } = useStartChat();
  // A refused rule is reported by its catalogue title, whatever the roster carries.
  const { titleOf } = useRulePresetCatalogue(true);
  const isPending = isStarting || apply.isPending;

  const report = (rosterName: string, result: ApplyRosterPresetResult): void => {
    const notice = applyNotice({ rosterName, result, started: true, ruleTitleOf: titleOf });
    notify[notice.channel](notice.line);
  };

  return {
    isPending,
    startRoster: (roster): void => {
      if (isPending) {
        return;
      }
      // @orb-waive caught-failure-ownership(startChat): startChat and apply.mutateAsync each carry their own errorToast (use-start-chat.ts, useApplyRosterPreset); the swallow only silences the unhandled-rejection warning, and the roster survives for retry. Ends if either mutation stops owning its failure copy.
      startChat({
        characterIds: roster.members.map((member) => member.characterId),
        anchorPersonaId: roster.anchorPersonaId,
        // The room is named after the roster it was started from.
        title: roster.name,
        // The game is born inside the room's own creation batch, so a failed birth leaves no room behind (D264).
        ...(roster.game === null ? {} : { startAsGame: roster.game }),
      })
        .then(async (chatId) => {
          options.onEntered?.();
          report(roster.name, await apply.mutateAsync({ presetId: roster.id, chatId }));
        })
        .catch(() => undefined); // both mutations toast their own failures.
    },
  };
}

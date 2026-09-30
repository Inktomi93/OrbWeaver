// The ruleset-gated dice items in Message tools. The roll promise retains its room and settlement handlers
// after the popup unmounts on Escape; TanStack's per-call mutation callbacks do not.

import { isRpgEngaged, RPG_RULESET_DICE } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Dices, Icon } from "@orb/ui/icons";
import { MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useGatedQuery, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { readComposerDraft, requestComposerFocus, setComposerDraft } from "#state";
import { useRollDice } from "../hooks/use-rpg-mutations.ts";

function insertStamp(chatId: ChatId, stamp: string): void {
  const current = readComposerDraft(chatId);
  setComposerDraft(chatId, current === "" ? stamp : `${current} ${stamp}`);
  requestComposerFocus(chatId);
}

async function rollIntoDraft(chatId: ChatId, notation: string, rollDice: ReturnType<typeof useRollDice>): Promise<void> {
  try {
    const result = await rollDice.mutateAsync({ chatId, notation });
    insertStamp(chatId, result.stamp);
  } catch {
    notify.error("Couldn't roll the dice.");
  }
}

/** Room-scoped dice items for the existing composer utility menu. */
export function RpgDiceComposerItems({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const rollDice = useRollDice({ trpc, invalidation });
  const { data: detail } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const engaged = isRpgEngaged(detail?.rpg ?? null);
  const { data: game } = useGatedQuery(engaged ? chatId : null, (id) => trpc.rpg.getGame.queryOptions({ chatId: id }));
  const ruleset = game?.publicConfig.ruleset;
  const notations = ruleset === undefined ? [] : RPG_RULESET_DICE[ruleset];
  if (!engaged || notations.length === 0) {
    return null;
  }

  // The group leads the menu, so it closes with the separator rather than opening with one.
  return (
    <>
      <MenuGroup>
        <MenuGroupLabel>Dice rolls</MenuGroupLabel>
        {notations.map((notation) => (
          <MenuItem
            disabled={rollDice.isPending}
            key={notation}
            onClick={(): void => {
              // @orb-waive caught-failure-ownership(rollIntoDraft): mutation failures already show a notice; any later exceptional rejection reaches the browser error reporter. Ends if the reporter stops surfacing errors.
              rollIntoDraft(chatId, notation, rollDice).catch(globalThis.reportError);
            }}
          >
            <Icon icon={Dices} size="sm" />
            Roll {notation}
          </MenuItem>
        ))}
      </MenuGroup>
      <MenuSeparator />
    </>
  );
}

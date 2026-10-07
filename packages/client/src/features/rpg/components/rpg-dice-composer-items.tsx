// The ruleset-gated dice items in Message tools. The roll promise retains its room and settlement handlers
// after the popup unmounts on Escape; TanStack's per-call mutation callbacks do not.

import { isRpgEngaged, RPG_RULESET_DICE, rpgAttributeModifier } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Dices, Icon } from "@orb/ui/icons";
import { MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuSubmenuRoot, MenuSubmenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import { useGatedQuery, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { readComposerDraft, requestComposerFocus, setComposerDraft } from "#state";
import { useRollDice } from "../hooks/use-rpg-mutations.ts";

function insertStamp(chatId: ChatId, stamp: string): void {
  const current = readComposerDraft(chatId);
  setComposerDraft(chatId, current === "" ? stamp : `${current} ${stamp}`);
  requestComposerFocus(chatId);
}

async function rollIntoDraft(chatId: ChatId, notation: string, rollDice: ReturnType<typeof useRollDice>, ability?: string): Promise<void> {
  try {
    const result = await rollDice.mutateAsync({ chatId, notation, ...(ability === undefined ? {} : { ability }) });
    insertStamp(chatId, result.stamp);
  } catch {
    notify.error("Couldn't roll the dice.");
  }
}

/** Room-scoped dice items for the existing composer utility menu. */
export function RpgDiceComposerItems({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const reasonId = useId();
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const rollDice = useRollDice({ trpc, invalidation });
  const { data: detail } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const engaged = isRpgEngaged(detail?.rpg ?? null);
  const { data: game } = useGatedQuery(engaged ? chatId : null, (id) => trpc.rpg.getGame.queryOptions({ chatId: id }));
  const ruleset = game?.publicConfig.ruleset;
  const notations = ruleset === undefined ? [] : RPG_RULESET_DICE[ruleset];
  const { data: tracker } = useGatedQuery(ruleset === "d20" && detail?.viewerUserId !== undefined ? chatId : null, (id) =>
    trpc.rpg.getTrackerView.queryOptions({ chatId: id }),
  );
  const ownActor = tracker?.actors.find((actor) => actor.actorRef.kind === "user" && actor.actorRef.userId === detail?.viewerUserId);
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
              rollIntoDraft(chatId, notation, rollDice).catch(globalThis.reportError);
            }}
          >
            <Icon icon={Dices} size="sm" />
            Roll {notation}
          </MenuItem>
        ))}
        <MenuSubmenuRoot>
          <MenuSubmenuTrigger>
            <Icon icon={Dices} size="sm" />
            Ability check
          </MenuSubmenuTrigger>
          <MenuPopup>
            <MenuGroup>
              <MenuGroupLabel>Your ability checks · d20</MenuGroupLabel>
              {(game?.publicConfig.statProfile.attributes ?? []).map((def, index) => {
                const score = ownActor?.sheet.attributes[def.key];
                const modifier = score === undefined || game === undefined ? null : rpgAttributeModifier(game.publicConfig.statProfile, score);
                const descriptionId = `${reasonId}-${index}`;
                return (
                  <MenuItem
                    key={def.key}
                    disabled={modifier === null || rollDice.isPending}
                    aria-describedby={modifier === null ? descriptionId : undefined}
                    onClick={(): Promise<void> => rollIntoDraft(chatId, "d20", rollDice, def.key)}
                  >
                    <Icon icon={Dices} size="sm" />
                    <Text as="span">
                      {def.label}
                      {modifier === null ? "" : ` (${modifier >= 0 ? "+" : ""}${modifier})`}
                    </Text>
                    {modifier === null ? (
                      <Text as="span" voice="gloss" id={descriptionId}>
                        Set your score in Status first.
                      </Text>
                    ) : null}
                  </MenuItem>
                );
              })}
            </MenuGroup>
          </MenuPopup>
        </MenuSubmenuRoot>
      </MenuGroup>
      <MenuSeparator />
    </>
  );
}

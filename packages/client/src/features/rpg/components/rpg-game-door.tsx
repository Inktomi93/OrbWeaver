// The #40 GAME DOOR — the Game meta-tab body for a committed HOST chat that is NOT a live game: the
// product front door rpg-lite never had (`rpg.createGame` was seed/E2E-only). Two arms off the SAME
// `chat.getChat` pointer read the takeover gate uses:
//   • NO game — the "Start a game" empty-state CTA with the freeform|d20 profile pick (`createGame`,
//     mode "lite"; freeform omits the profile — the create default).
//   • a PAUSED game (pointer `engaged:false`) — the game exists with ALL its state preserved; the door
//     offers "Turn the game back on" (`updateConfig { engaged:true }` — reversible, never a re-create).
// A LIVE game never reaches this component (the section routes it to the GM console).

import { isRpgEngaged, RPG_PROFILE_D20 } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Crown, Icon, Play, Swords, WandSparkles } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useCreateGame, useUpdateConfig } from "../hooks/use-rpg-mutations";

export interface RpgGameDoorProps {
  readonly chatId: ChatId;
}

/** The start/resume door (see the module header). Suspends on the chat detail (cache-first — the panel
 *  already holds it). */
export function RpgGameDoor({ chatId }: RpgGameDoorProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const createGame = useCreateGame({ trpc, invalidation });
  const updateConfig = useUpdateConfig({ trpc, invalidation });
  const { data: chat } = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));

  const pointer = chat.rpg ?? null;
  if (pointer !== null && !isRpgEngaged(pointer)) {
    // The PAUSED arm — the state is kept; re-enable restores the sheet/scene/quests as they were.
    return (
      <Stack gap="section" data-slot="rpg-game-door" align="start">
        <Row gap="field" align="center">
          <Icon icon={Crown} size="sm" className="text-highlight" />
          <Text size="micro" transform="caps" weight="semibold" className="tracking-micro text-highlight">
            Game paused
          </Text>
        </Row>
        <Text tone="muted">The game is off — its sheets, scene, and quests are kept exactly as you left them.</Text>
        <Button intent="primary" size="sm" onClick={(): void => updateConfig.mutate({ chatId, patch: { engaged: true } })}>
          <Icon icon={Play} size="xs" /> Turn the game back on
        </Button>
      </Stack>
    );
  }

  // The EMPTY-STATE arm — no game yet: the start CTA with the freeform|d20 profile pick.
  return (
    <Stack gap="section" data-slot="rpg-game-door" align="start">
      <Row gap="field" align="center">
        <Icon icon={Crown} size="sm" className="text-highlight" />
        <Text size="micro" transform="caps" weight="semibold" className="tracking-micro text-highlight">
          Start a game
        </Text>
      </Row>
      <Text tone="muted">Turn this chat into a game — tracked state, quests, and a scene the story keeps current.</Text>
      <Row gap="field" className="flex-wrap">
        <Button intent="primary" size="sm" onClick={(): void => createGame.mutate({ chatId, mode: "lite" })}>
          <Icon icon={WandSparkles} size="xs" /> Freeform story
        </Button>
        <Button intent="secondary" size="sm" onClick={(): void => createGame.mutate({ chatId, mode: "lite", profile: RPG_PROFILE_D20 })}>
          <Icon icon={Swords} size="xs" /> D20 adventure
        </Button>
      </Row>
    </Stack>
  );
}

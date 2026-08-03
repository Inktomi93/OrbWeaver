// The #40 RPG-overlay DOOR — the Game meta-tab body for a committed HOST chat whose overlay is not
// LIVE. Owner model: rpg-lite is an OVERLAY on the roleplay, togglable on/off at ANY time — never a
// game session with pause/resume framing. Two arms off the SAME `chat.getChat` pointer read the
// takeover gate uses:
//   • never enabled — the "Turn on RPG" empty-state CTA with the freeform|d20 profile pick
//     (`createGame`, mode "lite"; freeform omits the profile — the create default).
//   • overlay OFF (pointer `engaged:false`) — the game rows exist with ALL state preserved; the door
//     offers "Turn the overlay on" (`updateConfig { engaged:true }` — reversible, never a re-create,
//     never a profile re-pick).
// A LIVE overlay never reaches this component (the section routes it to the GM console).

import { isRpgEngaged, RPG_PROFILE_D20 } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Crown, Icon, Play, Swords, WandSparkles } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useCreateGame, useUpdateConfig } from "../hooks/use-rpg-mutations.ts";

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
    // Overlay OFF — the state is kept; turning it on restores the sheets/scene/quests as they were.
    return (
      <Stack gap="section" data-slot="rpg-game-door" align="start">
        <Row gap="field" align="center">
          <Icon icon={Crown} size="sm" className="text-highlight" />
          <Text voice="kicker" className="tracking-micro text-highlight">
            RPG overlay off
          </Text>
        </Row>
        <Text>The RPG overlay is off — your sheets, scene, and quests are kept. Turn it on to pick up where you left off.</Text>
        <Button intent="primary" size="sm" onClick={(): void => updateConfig.mutate({ chatId, patch: { engaged: true } })}>
          <Icon icon={Play} size="xs" /> Turn the overlay on
        </Button>
      </Stack>
    );
  }

  // The EMPTY-STATE arm — never enabled here: the first-ever "Turn on RPG" with the profile pick.
  return (
    <Stack gap="section" data-slot="rpg-game-door" align="start">
      <Row gap="field" align="center">
        <Icon icon={Crown} size="sm" className="text-highlight" />
        <Text voice="kicker" className="tracking-micro text-highlight">
          Turn on RPG
        </Text>
      </Row>
      <Text>An overlay for your roleplay — tracked state, quests, and a scene the story keeps current.</Text>
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

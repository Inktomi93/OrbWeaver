// The #40/#862 GAME-MODE DOOR — the Game meta-tab body for a committed HOST chat whose game is not LIVE.
// Owner model: a game is a MODE the roleplay runs in, togglable on/off at ANY time — never a session with
// pause/resume framing. Two arms off the SAME `chat.getChat` pointer read the takeover gate uses:
//   • never started — the "Turn on game mode" empty-state CTA. ONE button (#862, owner ruling 2026-08-30):
//     the freeform|d20 pick that used to live here is a SETTING now (`ruleset`, on this same tab's host
//     console, retunable additively at any time), so a game is born freeform in one click.
//   • game OFF (pointer `engaged:false`) — the rows exist with ALL state preserved; the door offers
//     "Turn game mode back on" (`updateConfig { engaged:true }` — reversible, never a re-create).
// A LIVE game never reaches this component (the section routes it to the host console).
//
// BOTH DOORS SPEAK ONE NOUN AND REVEAL THEIR RESULT (#863): the labels + the announcements are the shared
// `#state` game-mode transition seam, which the ⋯ menu's twin door reads too — one concept can't carry two
// vocabularies (it carried three), and a start from EITHER door lands the panel on the game's Status tab.

import { isRpgEngaged } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Crown, Icon, Play, Swords } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { useInvalidation, useTRPC } from "#data";
import { GAME_MODE_KEPT_LINE, GAME_MODE_OFF_KICKER, GAME_MODE_ON_LABEL, GAME_MODE_RESUME_LABEL, onGameModeStarted } from "#state";
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
  const createAdmission = useRef(false);
  const engageAdmission = useRef(false);

  const create = (): void => {
    if (createAdmission.current) {
      return;
    }
    createAdmission.current = true;
    // No `ruleset` — a game is born freeform; the ruleset control below the door retunes it additively.
    createGame.mutate(
      { chatId, mode: "lite" },
      {
        onSuccess: onGameModeStarted,
        onSettled: (): void => {
          createAdmission.current = false;
        },
      },
    );
  };

  const engage = (): void => {
    if (engageAdmission.current) {
      return;
    }
    engageAdmission.current = true;
    updateConfig.mutate(
      { chatId, patch: { engaged: true } },
      {
        onSuccess: onGameModeStarted,
        onSettled: (): void => {
          engageAdmission.current = false;
        },
      },
    );
  };

  const pointer = chat.rpg ?? null;
  if (pointer !== null && !isRpgEngaged(pointer)) {
    // Game mode OFF — the state is kept; turning it on restores the sheets/scene/quests as they were.
    return (
      <Stack gap="section" data-slot="rpg-game-door" align="start">
        <Row gap="field" align="center">
          <Icon icon={Crown} size="sm" className="text-highlight" />
          <Text voice="kicker" className="tracking-micro text-highlight">
            {GAME_MODE_OFF_KICKER}
          </Text>
        </Row>
        <Text>{`Game mode is off — ${GAME_MODE_KEPT_LINE.toLowerCase()} Turn it back on to pick up where you left off.`}</Text>
        <Button disabled={updateConfig.isPending} intent="primary" size="sm" onClick={engage}>
          <Icon icon={Play} size="xs" /> {GAME_MODE_RESUME_LABEL}
        </Button>
      </Stack>
    );
  }

  // The EMPTY-STATE arm — no game here yet: ONE start action (#862).
  return (
    <Stack gap="section" data-slot="rpg-game-door" align="start">
      <Row gap="field" align="center">
        <Icon icon={Crown} size="sm" className="text-highlight" />
        <Text voice="kicker" className="tracking-micro text-highlight">
          Game mode
        </Text>
      </Row>
      <Text>A game mode for your roleplay — tracked state, quests, and a scene the story keeps current. Pick a ruleset any time once it's on.</Text>
      <Button disabled={createGame.isPending} intent="primary" size="sm" onClick={create}>
        <Icon icon={Swords} size="xs" /> {GAME_MODE_ON_LABEL}
      </Button>
    </Stack>
  );
}

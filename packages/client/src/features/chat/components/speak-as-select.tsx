// SPEAK-AS (task #29 — the composer-adjacent cast control). A dropdown that triggers an on-demand
// assistant turn voiced by a chosen roster character — "Auto" (let arbitration pick the speaker) or a
// specific member. This is the ALREADY-router-exposed `chat.generate` with its `speakerCharacterId`
// param (member-gated, LOCK-FREE — an aside that runs concurrent with the turn lock, distinct from the
// host-only `forceCharacterTurn` round): the verb existed + was on the transport; only the client
// dispatch was missing. No server work.
//
// SCOPE NOTE (#29 v1): the LITERAL "type a line of dialogue and attribute it to a character" speak-as
// (ST-style) is DEFERRED — no verb carries it (`send` has no `speakerCharacterId`; `impersonate` only
// takes a user `personaId`). This dropdown is the buildable v1: it SUMMONS a character to generate.
//
// SIZE-GATED (D16 roster-of-1): renders `null` for a chat of ≤1 character (a solo/1:1 chat has no
// "which character" choice). The roster read is `chat.getChat` — the same warm cache the cast bar +
// message list share (non-suspense; degrades to `null` until populated).

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Drama, Icon } from "@orb/ui/icons";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import { useTurnPhase } from "#state";
import { filterCharacters } from "../lib/roster.ts";
import { turnMutationToast } from "../lib/turn-abort-notice.ts";

/** `chat.generate` vars — an on-demand turn, optionally forced to a specific speaker (null ⇒ arbitrate). */
interface SpeakAsGenerateVars {
  readonly chatId: ChatId;
  readonly speakerCharacterId: CharacterId | null;
}

// TData `unknown`: the turn is bus-driven (`turnStarted`/`messageCommitted`/…), never read back here —
// the guided-generate precedent (use-guided-actions.ts).
const useSpeakAsGenerate = createEntityMutation<SpeakAsGenerateVars, unknown>({
  options: (trpc) => trpc.chat.generate.mutationOptions(),
  // BUS-DRIVEN: `generate` runs a turn (messageCommitted + turnCompleted → chatReads) on the OPEN chat,
  // delivered by the active subscription. `busDriven` (mutation-vs-bus rule, invalidation.ts).
  busDriven: true,
  // The ONE turn-error mapper — a forced-speaker generate refused for CONTENTION (`locked`) says so.
  errorToast: (error) => turnMutationToast(error, "Couldn't generate that response."),
});

export interface SpeakAsSelectProps {
  readonly chatId: ChatId;
}

/** The composer's speak-as dropdown — "Auto" + one item per character; `null` for a solo room. */
export function SpeakAsSelect({ chatId }: SpeakAsSelectProps): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const phase = useTurnPhase(chatId);
  const generate = useSpeakAsGenerate({ trpc, invalidation });

  // Non-suspense roster read (shared cache) — degrades to `null` until populated.
  const rosterQuery = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const cast = filterCharacters(rosterQuery.data?.participants ?? []);

  // Size-gate (D16 roster-of-1): no "which character" choice to make.
  if (cast.length <= 1) {
    return null;
  }

  const turnBusy = phase === "pending" || phase === "streaming" || phase === "stopping";
  const disabled = turnBusy || generate.isPending;

  const fire = (speakerCharacterId: CharacterId | null): void => {
    generate.mutate({ chatId, speakerCharacterId });
  };

  return (
    <Menu>
      <MenuTrigger
        disabled={disabled}
        aria-label="Speak as a character"
        data-testid={testId("speakAsSelect")}
        render={
          <Button type="button" intent="ghost" size="icon">
            <Icon icon={Drama} size="sm" />
          </Button>
        }
      />
      <MenuPopup>
        <MenuItem onClick={(): void => fire(null)}>Auto (arbitrate)</MenuItem>
        {cast.map((member) => (
          <MenuItem key={member.id} onClick={(): void => fire(member.characterId)}>
            {member.displayName}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

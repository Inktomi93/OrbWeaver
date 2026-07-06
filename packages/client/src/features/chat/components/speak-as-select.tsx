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
// "which character" choice) and for a DRAFT handle (no committed roster yet). The roster read is
// `chat.getChat` — the same warm cache the cast bar + message list share (non-suspense; degrades to
// `null` until populated).

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the composer-wand.tsx precedent).
import { Drama, Icon } from "@orb/ui/icons";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { createEntityMutation, useGatedQuery, useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import type { ChatHandle } from "#state";
import { isCommitted, useTurnPhase } from "#state";

/** `chat.generate` vars — an on-demand turn, optionally forced to a specific speaker (null ⇒ arbitrate). */
interface SpeakAsGenerateVars {
  readonly chatId: ChatId;
  readonly speakerCharacterId: CharacterId | null;
}

// TData `unknown`: the turn is bus-driven (`turnStarted`/`messageCommitted`/…), never read back here —
// the guided-generate precedent (use-guided-actions.ts).
const useSpeakAsGenerate = createEntityMutation<SpeakAsGenerateVars, unknown>({
  options: (trpc) => trpc.chat.generate.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.chat.getChat.queryFilter({ chatId: vars.chatId }),
    trpc.chat.listMessages.pathFilter(),
  ],
  errorToast: "Couldn't generate that response.",
});

/** A character participant — narrowed from the roster (only characters can be a `speakerCharacterId`). */
type CharacterParticipant = ParticipantView & {
  readonly characterId: NonNullable<ParticipantView["characterId"]>;
};

function isCharacter(p: ParticipantView): p is CharacterParticipant {
  return p.kind === "character" && p.characterId !== null;
}

export interface SpeakAsSelectProps {
  readonly handle: ChatHandle;
}

/** The composer's speak-as dropdown — "Auto" + one item per character; `null` for solo/draft. */
export function SpeakAsSelect({ handle }: SpeakAsSelectProps): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const chatId = isCommitted(handle) ? handle.id : null;
  const phase = useTurnPhase(chatId);
  const generate = useSpeakAsGenerate({ trpc, invalidation });

  // Non-suspense roster read (shared cache), `skipToken`-gated on a committed chatId (no fetch for a
  // draft) — degrades to `null` until populated (the useGatedQuery seam, kills the `castId("")` sentinel).
  const rosterQuery = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const cast = (rosterQuery.data?.participants ?? []).filter(isCharacter);

  // Size-gate (D16 roster-of-1) + draft: no "which character" choice to make.
  if (chatId === null || cast.length <= 1) {
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

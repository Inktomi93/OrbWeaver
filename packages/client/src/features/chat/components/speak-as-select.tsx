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
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { SPEAK_AS_WAIT_FOR_TURN, testId, turnMutationToast } from "#lib";
import { useTurnPhase } from "#state";
import { useSendAvailability } from "../hooks/use-send-availability.ts";
import { filterCharacters } from "../lib/roster.ts";

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

/** What the control DOES — the lead of its tooltip in both states, so the disabled reading stays an
 *  explanation of this affordance rather than a bare excuse. */
const SPEAK_AS_TOOLTIP = "Choose who speaks next";

export interface SpeakAsSelectProps {
  readonly chatId: ChatId;
}

/** The composer's speak-as dropdown — "Auto" + one item per character; `null` for a solo room. */
export function SpeakAsSelect({ chatId }: SpeakAsSelectProps): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const phase = useTurnPhase(chatId);
  const generate = useSpeakAsGenerate({ trpc, invalidation });
  // The honest-refusal pre-send gate (#54) reaches this control too (owner ruling #397, built as #406). It is
  // read HERE rather than threaded down from the composer because this control is self-contained by design —
  // it takes only a `chatId` and resolves everything else off the same warm caches its siblings share (the
  // roster read above is the precedent); `useSendAvailability` is one keyed query, so the second reader costs
  // no second fetch.
  const sendAvailability = useSendAvailability(chatId);

  // Non-suspense roster read (shared cache) — degrades to `null` until populated.
  const rosterQuery = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const cast = filterCharacters(rosterQuery.data?.participants ?? []);

  // Size-gate (D16 roster-of-1): no "which character" choice to make.
  if (cast.length <= 1) {
    return null;
  }

  const turnBusy = phase === "pending" || phase === "streaming" || phase === "stopping";
  const disabled = turnBusy || generate.isPending || sendAvailability.unavailable;
  // A DISABLED TRIGGER OWES A REASON, and `focusableWhenDisabled` is the promise that it will give one
  // (side-eye 2026-08-21). The control stays aria-disabled IN THE TAB ORDER during a turn precisely so a
  // keyboard reader can land on it and be told why — and it described only what it would do, so landing on
  // it mid-turn was a dead affordance with a cheerful invitation. Same composition as every other composer
  // icon ("<what it does> — <the unlock condition>", composer-guided-cluster.tsx's `reasonFor`).
  //
  // THE OPEN QUESTION THIS COMMENT USED TO RECORD IS CLOSED. It read "whether speak-as should ALSO idle on an
  // unserveable connection (#54) is an open owner decision, deliberately untouched" — the owner ruled it in
  // #397 and it is built here (#406): speak-as fires `chat.generate`, a TURN, so an unserveable connection
  // dooms it exactly as it dooms the four guided icons. The rule that produced the old text survives intact —
  // never state a gate this control does not have — its INPUT changed: the gate now exists.
  //
  // PRECEDENCE mirrors `reasonFor` (composer-guided-cluster.tsx): the send cause is PERSISTENT and the phase
  // cause is transient, so the send cause wins — a disabled trigger on an off engine reads "Local engine is
  // off…", never "wait for the current reply to finish", which would point at a turn that will never start.
  const persistentOffReason = sendAvailability.unavailable ? sendAvailability.reason : undefined;
  const tooltip = disabled ? `${SPEAK_AS_TOOLTIP} — ${persistentOffReason ?? SPEAK_AS_WAIT_FOR_TURN}` : SPEAK_AS_TOOLTIP;

  const fire = (speakerCharacterId: CharacterId | null): void => {
    generate.mutate({ chatId, speakerCharacterId });
  };

  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              disabled={disabled}
              aria-label="Speak as a character"
              data-testid={testId("speakAsSelect")}
              render={
                // `data-disabled:pointer-events-auto` IS HALF THE REASON (measured 2026-08-21). A disabled
                // Button drops pointer events, so the tooltip carrying the disabled cause could not be
                // reached by hover at all — `elementFromPoint` over the trigger returned its parent div. The
                // composer's four guided icons carry this exact utility for this exact purpose
                // (`ICON_CONTROL_CLASS`, composer-guided-buttons.tsx); this one was the odd control out, and
                // a reason nobody can hover is not a reason. The trigger stays inert to CLICKS (Base UI's
                // aria-disabled MenuTrigger swallows those); what comes back is hover.
                <Button type="button" className="data-disabled:pointer-events-auto" focusableWhenDisabled={true} intent="ghost" size="icon">
                  <Icon icon={Drama} size="sm" />
                </Button>
              }
            />
          }
        />
        <TooltipPopup side="top">{tooltip}</TooltipPopup>
      </Tooltip>
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

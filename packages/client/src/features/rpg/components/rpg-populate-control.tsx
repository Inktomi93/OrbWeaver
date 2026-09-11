// The POPULATE control (owner ruling 2026-08-01) — the host's BORN-STATE doorway on the character takeover,
// per character, BUTTON-ONLY (nothing auto-runs it, ever). One host-initiated model call reads this
// character's card + the room's opening line and fills what play cannot write: the title/level on the sheet
// (hand-only everywhere else), the gear and coin they walked in with, and the quests their background implies.
//
// The consequence line is honest about BOTH costs the host is agreeing to: a model call, and a write. The
// fill-don't-overwrite rule is stated because it is what makes a second click safe.
//
// The two REFUSALS the server owns are mirrored as DISABLED-WITH-A-REASON, never a hidden control (the
// APPLICABILITY class): a `user`/`npc` actor has no card to read, and a connection with no structured writer
// could only no-op. Host-only is the separate PERMISSION-omit — the takeover renders this at all only for the
// host, mirroring `populateFromCharacter`'s own `resolveHost` gate.
//
// POPLOUD — THE OUTCOME IS SPOKEN. The verb answers with a `PopulateResult` and all three endings reach the
// host: a refusal toasts through the mutation factory's `refusal` seam (`populateRefusal`, the hook file), a
// fill that landed repaints the panel (its own feedback), and a round that filled NOTHING says so here as an
// INFO line — the one ending with no other observable. Before this, a provider that refused every structured
// request looked exactly like an empty card: the button settled and nothing else happened.

import type { RpgActorView } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, Sparkles } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { usePopulateFromCharacter } from "../hooks/use-rpg-mutations.ts";
import { Kicker } from "./rpg-kicker.tsx";

/** Why this character CANNOT be filled from a card, or `""` when the round is available — the two
 *  server-owned refusals, as the button's stated reason. */
function populateRefusal(actor: RpgActorView, canPopulate: boolean): string {
  if (actor.actorRef.kind !== "character") {
    return `${actor.name} has no character card to read.`;
  }
  return canPopulate ? "" : "This chat's model can't write structured state, so there's nothing to fill from.";
}

export interface RpgPopulateControlProps {
  readonly chatId: ChatId;
  readonly actor: RpgActorView;
  /** The room connection's structured-writer verdict (`RpgGameView.canPopulate`) — the honest disabled arm. */
  readonly canPopulate: boolean;
}

export function RpgPopulateControl({ chatId, actor, canPopulate }: RpgPopulateControlProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const populate = usePopulateFromCharacter({ trpc, invalidation });
  const reason = populateRefusal(actor, canPopulate);

  // POPLOUD's THIRD ending: the round RAN and filled nothing (an empty card, or a sheet the fill rule fully
  // absorbed). The mutation's `refusal` seam owns `{ok:false}` (it toasts an error, which this is not), and a
  // real fill announces itself by repainting the panel — so this arm is the only one with no signal of its
  // own. The host paid for a model call; say what it found.
  const onFill = async (): Promise<void> => {
    // @orb-waive caught-failure-ownership(catch): the failed mutation's own errorToast already
    // spoke — the toast is the surface. Ends if usePopulateFromCharacter drops its errorToast.
    try {
      const verdict = await populate.mutateAsync({ chatId, actorRef: actor.actorRef });
      if (verdict.ok && !verdict.populated) {
        notify.info(`Nothing to fill — ${actor.name}'s card added nothing that isn't already set.`);
      }
    } catch {
      // The failed mutation's own error toast has already spoken.
    }
  };
  return (
    <Stack gap="field" data-slot="rpg-populate-control">
      <Kicker>Fill from card</Kicker>
      <Text voice="gloss">
        Reads {actor.name}'s card and the story's opening, then fills what play can't: title and level, starting gear and coin, and the goals their background
        implies. Runs one model call (a few seconds) and only fills what's still empty.
      </Text>
      <Row gap="field">
        <Button
          intent="secondary"
          size="sm"
          disabled={populate.isPending || reason !== ""}
          {...(reason === "" ? {} : { title: reason })}
          onClick={(): void => {
            // @orb-waive caught-failure-ownership(onFill): onFill already catches its own
            // mutation rejection internally (errorToast-backed), so it never rejects — belt-and-suspenders.
            // Ends if onFill stops catching internally.
            onFill().catch(() => undefined); // onFill owns and surfaces mutation failure.
          }}
        >
          <Icon icon={Sparkles} size="xs" />
          {populate.isPending ? "Filling…" : "Fill from card"}
        </Button>
      </Row>
    </Stack>
  );
}

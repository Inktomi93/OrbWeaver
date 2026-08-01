// The POPULATE control (owner ruling 2026-08-01) — the host's BORN-STATE doorway on the character takeover,
// per character, BUTTON-ONLY (nothing auto-runs it, ever). One host-initiated model call reads this
// character's card + the room's opening line and fills what play cannot write: the title/level on the sheet
// (hand-only everywhere else), the gear and coin they walked in with, and the quests their background implies.
//
// The consequence line is honest about BOTH costs the host is agreeing to: a model call, and a write. The
// fill-don't-overwrite rule is stated because it is what makes a second click safe.
//
// The two REFUSALS the server owns are mirrored as DISABLED-WITH-A-REASON, never a hidden control (the
// APPLICABILITY class): a `user`/`cast` actor has no card to read, and a connection with no structured writer
// could only no-op. Host-only is the separate PERMISSION-omit — the takeover renders this at all only for the
// host, mirroring `populateFromCharacter`'s own `resolveHost` gate.

import type { RpgActorView } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, Sparkles } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { usePopulateFromCharacter } from "../hooks/use-rpg-mutations";
import { Kicker } from "./rpg-kicker";

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
  return (
    <Stack gap="field" data-slot="rpg-populate-control">
      <Kicker>Fill from card</Kicker>
      <Text size="micro" tone="muted">
        Reads {actor.name}'s card and the story's opening, then fills what play can't: title and level, starting gear and coin, and the goals their background
        implies. Runs one model call (a few seconds) and only fills what's still empty.
      </Text>
      <Row gap="field">
        <Button
          intent="secondary"
          size="sm"
          disabled={populate.isPending || reason !== ""}
          {...(reason === "" ? {} : { title: reason })}
          onClick={(): void => populate.mutate({ chatId, actorRef: actor.actorRef })}
        >
          <Icon icon={Sparkles} size="xs" />
          {populate.isPending ? "Filling…" : "Fill from card"}
        </Button>
      </Row>
    </Stack>
  );
}

// The ROSTER controls panel (task #29 — the CONTEXT-panel's Roster tab body). Per-member HOST controls
// for a group chat: mute/unmute · talkativeness (the 0–1 `natural`-policy sampling weight) · force-turn
// (summon the member to speak next). HOST-ONLY: the tab itself is host-gated in the surface (like the
// Preview tab), so this body assumes the host — every control is live.
//
// D16 (solo = roster-of-1, no `isGroup` branch): the panel renders whatever character participants exist;
// a roster of 1 shows one row (the controls are near-useless there, but the mechanism is uniform). The
// three writes are `use-roster-mutations.ts` (`setParticipantDisabled`/`setParticipantTalkativeness`/
// `forceCharacterTurn`); the roster read is `chat.getChat` (the SAME query the panel + cast bar share).
//
// FORCE-TURN IS NOT GATED BY MUTE (#29 decision): a muted member is still force-summonable server-side
// (mute = passive arbitration exclusion, force-turn = explicit host override), so the Zap button stays
// enabled for a muted row — only an in-flight force-turn disables it (racing a second would double-drive).

import type { ParticipantView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the composer-wand.tsx precedent).
import { Icon, Volume2, VolumeX, Zap } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Slider } from "@orb/ui/slider";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { useTRPC } from "#data";
import { useInvalidation } from "../hooks/use-invalidation";
import {
  useForceCharacterTurn,
  useSetParticipantDisabled,
  useSetParticipantTalkativeness,
} from "../hooks/use-roster-mutations";

/** A character participant — narrowed from the roster (only characters carry these controls). */
type CharacterParticipant = ParticipantView & {
  readonly characterId: NonNullable<ParticipantView["characterId"]>;
};

function isCharacter(p: ParticipantView): p is CharacterParticipant {
  return p.kind === "character" && p.characterId !== null;
}

/** The single-thumb scalar from a slider value (a range slider carries an array; ours is single-thumb). */
function firstThumb(value: number | readonly number[]): number {
  return typeof value === "number" ? value : (value[0] ?? 0);
}

export interface RosterPanelProps {
  readonly chatId: ChatId;
}

/** The Roster tab body — the per-member control rows (host-only; the tab gates on host in the surface). */
export function RosterPanel({ chatId }: RosterPanelProps): ReactElement {
  const trpc = useTRPC();
  // The SAME getChat the surface already suspended on (shared cache) — no extra fetch for the roster.
  const { data: chat } = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const cast = chat.participants.filter(isCharacter);

  return (
    <Stack gap="section">
      <Text size="label" tone="muted">
        Mute a member (still contributes cards + world-info, but never auto-speaks), tune how often
        they take a turn, or summon one to speak next.
      </Text>

      {cast.length === 0 ? (
        <Text tone="muted">No characters in this chat yet.</Text>
      ) : (
        <Stack gap="block">
          {cast.map((member) => (
            <RosterRow key={member.id} chatId={chatId} member={member} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

interface RosterRowProps {
  readonly chatId: ChatId;
  readonly member: CharacterParticipant;
}

/** One member's control row: mute toggle · talkativeness slider · force-turn. */
function RosterRow({ chatId, member }: RosterRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setDisabled = useSetParticipantDisabled({ trpc, invalidation });
  const setTalkativeness = useSetParticipantTalkativeness({ trpc, invalidation });
  const forceTurn = useForceCharacterTurn({ trpc, invalidation });

  // Local mirror for smooth drag; the row is keyed by member id so this re-seeds from the server value
  // on any roster change. Commit-on-release (`onValueCommitted`) fires the mutation — not one per frame.
  const [weight, setWeight] = useState(member.talkativeness);
  const name = member.displayName;

  return (
    <Row gap="field" align="center" justify="between" data-slot="roster-row">
      <Text as="span" size="label" weight="medium" tone={member.disabled ? "muted" : undefined}>
        {name}
      </Text>

      <Row gap="field" align="center">
        {/* Talkativeness — uncontrolled + commit-on-release (Base UI `onValueCommitted`), so a drag
            doesn't fire one mutation per frame; the accessible name carries the member so a CT can
            target a specific slider. `defaultValue` re-seeds from the server on remount (the row is
            keyed by member id). */}
        <Slider
          value={weight}
          min={0}
          max={1}
          step={0.05}
          thumbLabels={[`Talkativeness: ${name}`]}
          disabled={setTalkativeness.isPending}
          onValueChange={(value): void => setWeight(firstThumb(value))}
          onValueCommitted={(value): void => {
            setTalkativeness.mutate({
              chatId,
              characterId: member.characterId,
              talkativeness: firstThumb(value),
            });
          }}
        />

        <Button
          type="button"
          intent="ghost"
          size="icon"
          aria-pressed={member.disabled}
          aria-label={member.disabled ? `Unmute ${name}` : `Mute ${name}`}
          disabled={setDisabled.isPending}
          onClick={(): void => {
            setDisabled.mutate({
              chatId,
              characterId: member.characterId,
              disabled: !member.disabled,
            });
          }}
        >
          <Icon icon={member.disabled ? VolumeX : Volume2} size="sm" />
        </Button>

        {/* Force-turn stays enabled even for a muted member (#29) — only an in-flight force disables it. */}
        <Button
          type="button"
          intent="ghost"
          size="icon"
          aria-label={`Make ${name} speak next`}
          loading={forceTurn.isPending}
          onClick={(): void => {
            forceTurn.mutate({ chatId, characterId: member.characterId });
          }}
        >
          <Icon icon={Zap} size="sm" />
        </Button>
      </Row>
    </Row>
  );
}

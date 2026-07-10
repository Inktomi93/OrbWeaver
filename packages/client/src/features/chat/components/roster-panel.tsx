// The ROSTER controls panel (task #29 — the CONTEXT-panel's Roster tab body). Per-member controls for a
// group chat: mute/unmute · talkativeness (the 0–1 `natural`-policy sampling weight) · force-turn (summon
// the member to speak next). HOST-ONLY: the tab itself is host-gated in the surface (like Preview), so
// this body assumes the host — every control is live.
//
// SOURCE-AGNOSTIC (dual-mode, J2/J3): this panel is PURE — it takes the `members` (a plain roster view)
// + the three write CALLBACKS, and owns neither the read nor the verbs. A COMMITTED chat's surface builds
// `members` from `ChatDetail.participants` + wires the callbacks to the roster verbs; a DRAFT builds
// `members` from the founding cards (`character.get`) + `draftConfig.rosterOverrides` + wires them to
// `setDraftRosterOverride`. Same panel, same look — only the source + save seam differ. `onForceTurn` is
// COMMITTED-ONLY (a draft has no turn to force): absent ⇒ no Zap button.
//
// D16 (solo = roster-of-1, no `isGroup` branch): the panel renders whatever members it's given; the
// host-AND-group gate lives in the surface (a solo chat shows no Roster tab at all).

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the composer-wand.tsx precedent).
import { Icon, Volume2, VolumeX, Zap } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Slider } from "@orb/ui/slider";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";

/** One member's roster view — the source-agnostic shape both the committed roster (from `ParticipantView`)
 *  and the draft roster (from `character.get` + `draftConfig.rosterOverrides`) project into. */
export interface RosterMember {
  readonly characterId: CharacterId;
  readonly displayName: string;
  readonly disabled: boolean;
  readonly talkativeness: number;
}

/** The single-thumb scalar from a slider value (a range slider carries an array; ours is single-thumb). */
function firstThumb(value: number | readonly number[]): number {
  return typeof value === "number" ? value : (value[0] ?? 0);
}

export interface RosterPanelProps {
  readonly members: readonly RosterMember[];
  /** Mute/unmute a member — committed → `setParticipantDisabled` verb; draft → `setDraftRosterOverride`. */
  readonly onSetDisabled: (characterId: CharacterId, disabled: boolean) => void;
  /** Set a member's talkativeness (commit-on-release) — committed → verb; draft → store. */
  readonly onSetTalkativeness: (characterId: CharacterId, talkativeness: number) => void;
  /** Summon a member to speak next — COMMITTED ONLY (a draft has no turn); absent ⇒ no Zap button. */
  readonly onForceTurn?: ((characterId: CharacterId) => void) | undefined;
}

/** The Roster tab body — the per-member control rows (host-only; the tab gates on host in the surface). */
export function RosterPanel({
  members,
  onSetDisabled,
  onSetTalkativeness,
  onForceTurn,
}: RosterPanelProps): ReactElement {
  return (
    <Stack gap="section">
      <Text size="label" tone="muted">
        Mute a member (still contributes cards + world-info, but never auto-speaks), tune how often
        they take a turn{onForceTurn === undefined ? "." : ", or summon one to speak next."}
      </Text>

      {members.length === 0 ? (
        <Text tone="muted">No characters in this chat yet.</Text>
      ) : (
        <Stack gap="block">
          {members.map((member) => (
            <RosterRow
              key={member.characterId}
              member={member}
              onSetDisabled={onSetDisabled}
              onSetTalkativeness={onSetTalkativeness}
              onForceTurn={onForceTurn}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

interface RosterRowProps {
  readonly member: RosterMember;
  readonly onSetDisabled: (characterId: CharacterId, disabled: boolean) => void;
  readonly onSetTalkativeness: (characterId: CharacterId, talkativeness: number) => void;
  readonly onForceTurn?: ((characterId: CharacterId) => void) | undefined;
}

/** One member's control row: mute toggle · talkativeness slider · (committed) force-turn. */
function RosterRow({
  member,
  onSetDisabled,
  onSetTalkativeness,
  onForceTurn,
}: RosterRowProps): ReactElement {
  // CONTROLLED from `member.talkativeness` (the authoritative roster value); a local override holds ONLY
  // the in-progress drag so the thumb stays smooth mid-gesture, and is cleared on release. This is what
  // makes BOTH a bus/other-device change AND a failed-write revert re-seed the thumb: a once-seeded
  // `useState` could not (the row is keyed by member id, so a value-only change never remounts). The drag
  // value goes null on commit, so the thumb falls back to the prop — its confirmed value until a refetch.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const weight = dragValue ?? member.talkativeness;
  const { characterId, displayName: name } = member;

  return (
    <Row gap="field" align="center" justify="between" data-slot="roster-row">
      <Text as="span" size="label" weight="medium" tone={member.disabled ? "muted" : undefined}>
        {name}
      </Text>

      <Row gap="field" align="center">
        {/* Talkativeness — commit-on-release (Base UI `onValueCommitted`), so a drag doesn't fire one
            write per frame; the accessible name carries the member so a CT can target a specific slider. */}
        <Slider
          value={weight}
          min={0}
          max={1}
          step={0.05}
          thumbLabels={[`Talkativeness: ${name}`]}
          onValueChange={(value): void => setDragValue(firstThumb(value))}
          onValueCommitted={(value): void => {
            setDragValue(null);
            onSetTalkativeness(characterId, firstThumb(value));
          }}
        />

        <Button
          type="button"
          intent="ghost"
          size="icon"
          aria-pressed={member.disabled}
          aria-label={member.disabled ? `Unmute ${name}` : `Mute ${name}`}
          onClick={(): void => onSetDisabled(characterId, !member.disabled)}
        >
          <Icon icon={member.disabled ? VolumeX : Volume2} size="sm" />
        </Button>

        {/* Force-turn — committed only (a draft has no turn to force). Stays enabled even for a muted
            member (#29): mute is passive arbitration exclusion, force-turn is an explicit host override. */}
        {onForceTurn === undefined ? null : (
          <Button
            type="button"
            intent="ghost"
            size="icon"
            aria-label={`Make ${name} speak next`}
            onClick={(): void => onForceTurn(characterId)}
          >
            <Icon icon={Zap} size="sm" />
          </Button>
        )}
      </Row>
    </Row>
  );
}

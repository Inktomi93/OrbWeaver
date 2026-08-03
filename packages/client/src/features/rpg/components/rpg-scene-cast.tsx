// The Scene tab's CAST section — the on-stage cards AND the R2 "Known characters" disclosure. Split out of
// `rpg-scene-tab.tsx` for the component-size gate; the two lists are ONE anatomy, so they live together.
//
// R2 — THE OFFSTAGE NPC IS FINALLY A PERSON THE HOST CAN SEE. A departure used to DESTROY a cast NPC's
// identity row (name, emoji, mood, relationship, the standing guides) while her tracked state survived on a
// plane NO surface projected: the host could not read her, edit her or remove her, and the model could still
// be told to wound her. Departure is a PRESENCE drop now, and everything is retained — so the disclosure
// below is where the retained person lives: readable, editable through the SAME card the stage uses, and
// DISMISSABLE (`rpg.dismissActor`, the gesture the actor plane's additive merge policy always named and
// never had).
//
// Every edit here is an OP on the actor's own row — identity and volatile alike. It used to be a whole-
// `presentCharacters` IMAGE rebuilt from the live cast on every keystroke, which pinned the ENTIRE plane on
// one NPC's mood edit and could only ever author the members this client could see.

import type { RpgActorRef, RpgActorView, RpgCastGuideField, RpgCastRef, RpgRelationship, RpgTrackerDef, RpgTrackerEntry } from "@orb/contracts/rpg";
import { RPG_CAST_GUIDE_FIELDS, trackerCeiling, trackerNumber, trackerReading } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { ChevronDown, ChevronRight, Icon, UserPlus, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { CastCard, MeterRow } from "#components";
import { actorKey } from "../lib/actor-key.ts";
import { RELATIONSHIP_GLYPHS } from "../lib/glyphs.ts";
import { resolveTrackerColor, trackColorProps } from "../lib/track-color.ts";
import { RpgDoorwayLine } from "./rpg-doorway-line.tsx";
import { Kicker } from "./rpg-kicker.tsx";

/** The standing guides this actor actually carries (RV-11) — spread onto the card so an UNWRITTEN guide is
 *  simply absent (no line, never a "none" placeholder). The story authors them; the host may correct what is
 *  there, and there is nothing honest to show for one nobody has written. */
function guideProps(identity: NonNullable<RpgActorView["identity"]>): Partial<Record<RpgCastGuideField, string>> {
  const out: Partial<Record<RpgCastGuideField, string>> = {};
  for (const field of RPG_CAST_GUIDE_FIELDS) {
    const text = identity[field]?.trim() ?? "";
    if (text !== "") {
      out[field] = text;
    }
  }
  return out;
}

/** The host's writers for ONE cast actor's row (R2) — every one an OP against the actor's own ref, identity
 *  and volatile alike. The retired shape rebuilt the whole `presentCharacters` array on every keystroke. */
export interface SceneCastEdit {
  /** Write one identity TEXT field (`mood`, a standing guide, the display `name` — the rename R2's slug key
   *  exists to make safe). The server pins the FINE `…identity.<field>` path, so pinning one NPC's mood no
   *  longer freezes the whole cast the way the plane-level `presentCharacters` lock did. */
  readonly onEditIdentityText: (targetRef: RpgActorRef, field: "name" | "mood" | RpgCastGuideField, text: string) => void;
  readonly onEditRelationship: (targetRef: RpgActorRef, relationship: RpgRelationship) => void;
  /** Write ONE tracked value on a cast actor. The CURRENT reading is not passed: `patchActor`'s `setTracker`
   *  merges onto whatever the true head carries, so the panel never hands back a value it read a beat ago. */
  readonly onEditTracker: (targetRef: RpgActorRef, def: RpgTrackerDef, next: string | number) => void;
  /** Drop this actor from the game entirely — state, presence and locks (`rpg.dismissActor`). */
  readonly onDismiss: (targetRef: RpgActorRef) => void;
  /** PROMOTE this known character to the roster (`rpg.promoteActor`, R4) — mint her a character card + a seat
   *  in the room and re-key her tracked row onto that identity. Takes the CAST arm only: promoting a roster
   *  actor is meaningless, and the wire cannot express it either. */
  readonly onPromote: (targetRef: RpgCastRef) => void;
}

/** ONE cast actor's card — identity, its carried trackers, its readings. Shared by the on-stage list and the
 *  Known-characters disclosure, because they are two views of ONE row (R2), never two shapes. */
function SceneCastCard({ actor, edit }: { readonly actor: RpgActorView; readonly edit?: SceneCastEdit }): ReactElement | null {
  const identity = actor.identity;
  if (identity === null) {
    return null;
  }
  // The trackers THIS actor carries, resolved server-side through the ONE carrier predicate — so the card
  // shows exactly the set the model's write schema offered for them (never a re-derivation).
  const values = actor.volatile?.trackerValues ?? {};
  const entries: RpgTrackerEntry[] = actor.trackers.map((def) => ({ def, value: values[def.key] ?? null }));
  const meters = entries.filter((e) => e.def.shape === "meter");
  const texts = entries
    .filter((e) => e.def.shape !== "meter")
    .map((e) => ({ name: e.def.label, value: trackerReading(e.def, e.value ?? undefined)?.replace(`${e.def.label}: `, "") ?? "" }));
  const ref = actor.actorRef;
  const editProps =
    edit === undefined
      ? {}
      : {
          onEditMood: (next: string): void => edit.onEditIdentityText(ref, "mood", next),
          onEditGuide: (field: RpgCastGuideField, next: string): void => edit.onEditIdentityText(ref, field, next),
          onEditRelationshipKind: (next: RpgRelationship["kind"]): void =>
            edit.onEditRelationship(ref, { kind: next, label: next === "custom" ? identity.relationship.label : "" }),
          onEditField: (label: string, next: string): void => {
            const entry = entries.find((e) => e.def.label === label);
            if (entry !== undefined) {
              edit.onEditTracker(ref, entry.def, next);
            }
          },
        };
  return (
    <CastCard
      name={actor.name}
      {...(identity.emoji === "" ? {} : { emoji: identity.emoji })}
      {...(identity.mood === "" ? {} : { mood: identity.mood })}
      {...guideProps(identity)}
      relationship={identity.relationship}
      fields={texts}
      // The relationship KIND glyph (the §12.5.5 closed-vocab Record) leads the edit-mode picker.
      relationshipGlyph={<Icon icon={RELATIONSHIP_GLYPHS[identity.relationship.kind]} size="xs" className="shrink-0 text-muted-foreground" />}
      {...editProps}
      {...(meters.length === 0
        ? {}
        : {
            meters: meters.map((m, i) => (
              <MeterRow
                key={m.def.key}
                label={m.def.label}
                // WHOSE meter — two cast cards on one tab otherwise offer two "Vitality value" buttons.
                subject={actor.name}
                // NULL stays null (side-eye 08-01): `?? 0` published "0/0" as this NPC's reading.
                value={trackerNumber(m.value ?? undefined)}
                // The EFFECTIVE ceiling (this carrier's override, else the def default) — one resolver.
                max={trackerCeiling(m.def, m.value ?? undefined)}
                // The def's own color, else the ordinal ramp — the SAME derivation the host-console
                // definition row and the band orb use (definition and display one system, §3).
                {...trackColorProps(resolveTrackerColor(m.def.color, i))}
                {...(edit === undefined ? {} : { onEditValue: (next: number): void => edit.onEditTracker(ref, m.def, Math.max(0, next)) })}
              />
            )),
          })}
    />
  );
}

export function SceneCast({
  cast,
  edit,
  lockPin,
}: {
  readonly cast: readonly RpgActorView[];
  readonly edit?: SceneCastEdit;
  /** The section-scoped presence hand-lock pin (§12.3) — `null` when unlocked/not-host. */
  readonly lockPin?: ReactNode;
}): ReactElement {
  if (cast.length === 0) {
    // The honest empty-cast doorway (§12.1.5): the scene fills from the story; nothing to author by hand here.
    return <RpgDoorwayLine>No one on stage yet — the story brings them in.</RpgDoorwayLine>;
  }

  return (
    <Stack gap="field">
      <Kicker trailing={lockPin}>On stage — {cast.length}</Kicker>
      {cast.map((actor) => (
        <SceneCastCard key={actorKey(actor)} actor={actor} {...(edit === undefined ? {} : { edit })} />
      ))}
    </Stack>
  );
}

/** THE KNOWN-CHARACTERS DISCLOSURE (R2) — every cast actor the game has met who is NOT on stage.
 *
 *  This section is the visible half of the reshape. Departure used to DESTROY an NPC's identity while keeping
 *  her tracked state in a plane no surface projected, so the state was simultaneously permanent and invisible:
 *  the host could not see her, edit her, or remove her, and the model could still be told to wound her. Now
 *  departure is a presence drop and nothing else, and this is where the retained person lives — readable,
 *  editable through the same card the stage uses, DISMISSABLE (`rpg.dismissActor`, the gesture the plane's
 *  additive merge policy always named and never had) and — R4 — PROMOTABLE (`rpg.promoteActor`): the recurring
 *  stranger earns a real character card and a seat in the room. The two durable doorways home here together,
 *  and only here: the on-stage cards are the NOW window, and neither of these is a move in the scene.
 *
 *  Collapsed by default: it is a memory, not the scene. The count rides the summary so a host knows there is
 *  something behind it without opening it. */
export function SceneKnownCharacters({ offstage, edit }: { readonly offstage: readonly RpgActorView[]; readonly edit?: SceneCastEdit }): ReactElement | null {
  const [open, setOpen] = useState(false);
  if (offstage.length === 0) {
    return null;
  }
  return (
    <Stack gap="field" data-slot="rpg-known-characters">
      <Row gap="field" align="center" justify="between">
        <Kicker>Known characters — {offstage.length}</Kicker>
        <Button
          intent="ghost"
          size="sm"
          aria-expanded={open}
          aria-label={open ? "Hide known characters" : "Show known characters"}
          title={open ? "Hide the characters who are not in this scene" : "Characters the story has met who are not in this scene"}
          onClick={(): void => setOpen(!open)}
        >
          <Icon icon={open ? ChevronDown : ChevronRight} size="xs" />
          {open ? "Hide" : "Show"}
        </Button>
      </Row>
      {open ? (
        <Stack gap="field">
          {offstage.map((actor) => (
            <Stack key={actorKey(actor)} gap="field">
              <SceneCastCard actor={actor} {...(edit === undefined ? {} : { edit })} />
              {edit === undefined ? null : <KnownCharacterDoorways actor={actor} edit={edit} />}
            </Stack>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

/** The two DURABLE doorways a known character has, and the only two gestures in this panel that reach outside
 *  the swipe-volatile plane: DISMISS forgets her (the row, her presence, her pins), PROMOTE keeps her forever
 *  (a character card in the host's library + a seat in this room). They live together because they are the same
 *  decision asked twice — "is this person finished, or is she part of the story now?" — and they are the reason
 *  this section is a disclosure rather than a list: an accidental click here is not undoable by a re-edit.
 *
 *  BOTH ASK FIRST, and only ONE can be asking (`pending` is a single state, not two booleans): a row offering
 *  two open confirmations is a row where the wrong button is one mis-aim away. Every control is NAMED BY WHOSE
 *  IT IS (the side-eye 08-01 rule) — a disclosure of N characters would otherwise offer N buttons all called
 *  "Dismiss", with the name in the DOM and not in the control's accessible name. */
function KnownCharacterDoorways({ actor, edit }: { readonly actor: RpgActorView; readonly edit: SceneCastEdit }): ReactElement {
  const [pending, setPending] = useState<"dismiss" | "promote" | null>(null);
  const ref = actor.actorRef;

  if (pending === "dismiss") {
    return (
      <Row gap="field" align="center" justify="end">
        <Text as="span" voice="gloss">
          Forget {actor.name} and everything tracked on them?
        </Text>
        <Button intent="ghost" size="sm" aria-label={`Keep ${actor.name}`} onClick={(): void => setPending(null)}>
          Keep
        </Button>
        <Button intent="destructive" size="sm" aria-label={`Confirm dismissing ${actor.name}`} onClick={(): void => edit.onDismiss(ref)}>
          Dismiss
        </Button>
      </Row>
    );
  }
  if (pending === "promote" && ref.kind === "cast") {
    return (
      <Row gap="field" align="center" justify="end">
        {/* THE CONFIRM IS WHERE THE PANEL SAYS WHAT DOES NOT CARRY. Her tracked state, her scene presence and
            the host's pins all follow her across the re-key; her mood and her stance toward the player have no
            home on a roster member (a stance is a cast actor's datum), so they end here. A host who discovers
            that afterwards discovers it as a bug. */}
        <Text as="span" voice="gloss">
          Give {actor.name} a character card and a seat in this room? Everything tracked on them comes along; their mood and their stance toward you do not.
        </Text>
        <Button intent="ghost" size="sm" aria-label={`Cancel promoting ${actor.name}`} onClick={(): void => setPending(null)}>
          Cancel
        </Button>
        <Button intent="primary" size="sm" aria-label={`Confirm promoting ${actor.name}`} onClick={(): void => edit.onPromote(ref)}>
          Promote
        </Button>
      </Row>
    );
  }
  return (
    <Row gap="field" align="center" justify="end">
      {/* PERMISSION-shaped ABSENCE, not a disabled control: a roster actor has nothing to promote (she already
          has a card), so the doorway simply is not there for one. */}
      {ref.kind === "cast" ? (
        <Button
          intent="ghost"
          size="sm"
          aria-label={`Promote ${actor.name} to the roster`}
          title={`Give ${actor.name} a character card and a seat in this room`}
          onClick={(): void => setPending("promote")}
        >
          <Icon icon={UserPlus} size="xs" />
          Promote
        </Button>
      ) : null}
      <Button
        intent="ghost"
        size="sm"
        aria-label={`Dismiss ${actor.name}`}
        title={`Forget ${actor.name} — removes their state from this game`}
        onClick={(): void => setPending("dismiss")}
      >
        <Icon icon={X} size="xs" />
        Dismiss
      </Button>
    </Row>
  );
}

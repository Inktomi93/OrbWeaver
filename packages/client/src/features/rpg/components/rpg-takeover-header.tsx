// The takeover HEADER BAND (THE WAYSTONE) — the signature composite where
// OSRS puts the world orb: the 24h-dial + sky-disc waystone (kit `<Waystone>`, aria-hidden), the location
// column (location · `day N · <time> · <weather>` · the cues row), then the satellite row — up to 3 pool-orb
// `<RingGauge>`s + the honest `<CoinFigure>` wallet disc (a max-less quantity never wears an arc).
// Every datum on the composite is decoration; the band's TEXT lines carry it all (tracker-kit a11y model).
//
// Nullable-honesty: a null ambient clock ⇒ the unset waystone (neutral ring, no marker, dim sky)
// and the band text says the story hasn't set the scene yet. Weather needs no resolution step: `weather.type`
// is already the stone's CLOSED vocabulary (`@orb/kit/weather` — one axis, model-bound at the wire), while the
// band text shows the model's free `weather.label` when it wrote one.
// SATELLITE ELIGIBILITY — the rule, stated (side-eye 08-01: it was unstated, and the band drew a poolless
// tracker as a FULL ring). It is SHAPE FOLLOWS THE DATUM, not "which plane the number came from": the server
// hands the band exactly the trackers the HOST PINNED (`trackerOrbs`, envelope-capped there — the one
// derivation home), and this composition picks each one's FIGURE from whether it has a ceiling. A ceilinged
// pool is an ARC (`RingGauge` — the arc means value/max); a max-less quantity is a DISC (`CoinFigure`), the
// same grammar the wallet already wears, because "a max-less quantity wearing an arc would be a lie of
// shape" — and `max ?? value` was drawing exactly that lie, a permanently-full ring for a
// tracker that has no full. That one rule answers both halves of the finding: a poolless tracker (Grit) is a
// disc, not a missing orb; the wallet (Gold) is a disc for the same reason, not an exception.
// The band stays the GLANCE and the character list/sheet stay the READING: the same numbers appear in both because
// the band is persistent chrome across all seven tabs while a character row is one tab's body (the OSRS orb
// idiom the design set is built on). The design pins the orb's own text ("label + `value/max` text beneath —
// text is the datum"), so the band does not drop its readout to de-duplicate against a body it cannot see.
// Orb color rides the ONE `resolveTrackerColor` derivation (`def.color ?? trackColor(ordinal)` — the owner
// free-hex ruling): the orb label joins back to the defining actor's `poolDefs` row for its picked color.
// The cues row = freshness (the EFFECTIVE delivery, honest — EFF-3) + the host-only `veiledCue` slot (the band's
// crown-gold "N veiled" count, supplied by the band host off `rpg.revealHidden`) + the read-only pill.

import type { RpgClockTime, RpgDateMode, RpgEffectiveDelivery, RpgTrackerOrb, RpgTrackerView } from "@orb/contracts/rpg";
import { clockTimeOfDay, rpgWeatherText } from "@orb/contracts/rpg";
import { Badge } from "@orb/ui/badge";
import { Icon, Lock } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Waystone } from "@orb/ui/meter";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { RpgFreshnessIndicator } from "./rpg-freshness-indicator.tsx";
import { RpgSatelliteRow } from "./rpg-satellite-row.tsx";

// The band renders the SERVER-derived orb set (satellites): the host's PINNED trackers, envelope-capped
// SERVER-SIDE (`trackerOrbs`, and each orb carries its own host-picked color). The client renders them all — no second cap (a client
// slice would silently drop a pinned orb the host asked for, the orb-pinning bug).
/** Line 2's when/where caption from the ambient strip. `dateMode` (#9): `narrated` (the default) leads
 *  with the FREEFORM date string and drops the sequential `day N` counter (the model narrates the date;
 *  no forced day-count display); `structured` keeps the counter. Time-of-day + weather render in BOTH
 *  modes (they drive the Waystone visual). Empty segments drop. */
function whenLine(ambient: NonNullable<RpgTrackerView["ambient"]>, dateMode: RpgDateMode): string {
  const parts: string[] = [];
  // A clock can carry a day with NO time (the story never stated an hour, or the host cleared it), so the
  // label and the counter are pushed independently — a `day 4` scene must not lose its counter just because
  // nobody has said whether it is morning.
  const label = clockTimeOfDay(ambient.clock);
  if (dateMode === "narrated") {
    if (ambient.calendarDate !== null) {
      parts.push(ambient.calendarDate);
    }
    if (label !== null) {
      parts.push(label);
    }
  } else if (ambient.clock !== null) {
    parts.push(`day ${ambient.clock.day}`);
    if (label !== null) {
      parts.push(label);
    }
  } else if (ambient.calendarDate !== null) {
    parts.push(ambient.calendarDate);
  }
  // The numeric hour the Waystone actually draws from (side-eye F17): the stone points at 21:40 while the
  // text said only "night", so the picture carried a datum the text didn't. TEXT IS THE DATUM — it has to be
  // a superset of the decoration, never the other way round. A time-less clock draws no hand, so there is no
  // decoration to be a superset of and the reading is omitted rather than printed as `--:--`.
  const reading = clockTime(ambient.clock);
  if (reading !== null) {
    parts.push(reading);
  }
  if (ambient.weather !== null) {
    // The model's own phrasing when it wrote one ("torrential sleet"), else the canonical type — the band
    // TEXT is the datum, the stone's sky is the decoration bound to `weather.type`.
    parts.push(rpgWeatherText(ambient.weather));
  }
  return parts.join(" · ");
}

/** The stored clock as a plain 24h reading (`21:40`) — the same number the stone's hand points at, or `null`
 *  when the clock carries a day but no time (the stone draws no hand either). An hour with no minute renders
 *  the minute as the em-dash arm (`21:—`, the `StatCell` unset-reading precedent) rather than synthesizing
 *  `:00` — a minute this sparse omitted is absent, not midnight past the hour. */
function clockTime(clock: RpgClockTime | null): string | null {
  if (clock === null || clock.hour === null) {
    return null;
  }
  const minute = clock.minute === null ? "—" : String(clock.minute).padStart(2, "0");
  return `${String(clock.hour).padStart(2, "0")}:${minute}`;
}

/** What the STONE is handed — the hour/minute pair, or `null` when there is no time to draw. A clock with a
 *  day but no hour takes the Waystone's EXISTING time-less treatment rather than a substituted midnight,
 *  which would paint a night sky over a story that never said it was night. */
function stoneClockOf(clock: RpgClockTime | null): { readonly hour: number; readonly minute: number } | null {
  if (clock === null || clock.hour === null) {
    return null;
  }
  return { hour: clock.hour, minute: clock.minute ?? 0 };
}

/** THE SEPARATORS A NAME AND ITS ELABORATION ARE JOINED BY, in the order a longest-match wants them. */
const ECHO_SEPARATORS = [" — ", " – ", " - ", ": ", ", "] as const;

/**
 * The location line WITHOUT the words the heading directly above it just said (#899 N5).
 *
 * MEASURED: the band renders `Example — The Ashen Spire` as its `h2` and, 28px beneath,
 * `The Ashen Spire — the throne hall, a fire built off the draft-line…`. F3's fix put the room's name in
 * the heading; this is its residue — the model writes the place into its own location string, so the two
 * lines stutter.
 *
 * IT IS A DE-DUP, NOT NEW COPY. The heading's own trailing segment is the room's name
 * (`Example — The Ashen Spire` → `The Ashen Spire`); when the location OPENS with that exact segment
 * followed by a
 * separator, the echo and its separator are dropped and what remains is the elaboration the line is for.
 * REFUSES rather than mangling in the three cases where dropping would lie:
 *   · the location IS the name and nothing more (there is no elaboration to promote — the line would go
 *     empty, and an empty when-line is worse than a repeated one);
 *   · the echo is not at the START (a place named mid-sentence is prose, not a stutter);
 *   · the match is not on a whole segment (a room called "The Ash" must not eat "The Ashen Spire").
 * Case-insensitive because the model's casing is its own; the comparison is trimmed for the same reason.
 */
function withoutHeadingEcho(location: string, heading: string): string {
  const name = ECHO_SEPARATORS.reduce((tail, candidate) => {
    const at = tail.lastIndexOf(candidate);
    return at === -1 ? tail : tail.slice(at + candidate.length);
  }, heading.trim());
  if (name === "") {
    return location;
  }
  const lower = location.trim().toLowerCase();
  const prefix = name.toLowerCase();
  if (!lower.startsWith(prefix)) {
    return location;
  }
  const rest = location.trim().slice(name.length);
  const joiner = ECHO_SEPARATORS.find((candidate) => rest.startsWith(candidate));
  if (joiner === undefined) {
    return location;
  }
  const elaboration = rest.slice(joiner.length).trim();
  return elaboration === "" ? location : elaboration;
}

/** THE BAND'S FIRST LINE IS THE ROOM'S NAME, IN THE BAND'S OWN VOICE (#875 F3, side-eye 2026-08-30).
 *
 *  The mock design rules the head band as "one slot, three contents — never a second head … the band owns the
 *  name's budget", and the chat and character bands both render an `h2` at 16px/600 with a two-line clamp.
 *  This band rendered a 13px `label` span carrying the SCENE LOCATION instead, so: a docked game room had
 *  NO heading anywhere on screen (the topbar correctly yields, #846) and `snap --aria` returned one flat
 *  text node a rotor cannot reach; and at 1024 overlay the topbar's "Example — The Ashen Spire" and the
 *  band's "The Ashen Spire — the throne hall, a fire built off the draft-line…" were both on screen,
 *  disagreeing about what the room is called.
 *
 *  The mock design's "Coupled sites" lists the Waystone as *Unchanged*, and it still is: the stone, the dial, the
 *  weather, the cues and the orbs are untouched. What changed is the TEXT COLUMN beside it, which the same
 *  ruling promoted into the slot whose contract is naming the artifact. Deviation recorded there. */
function RoomName({ title }: { readonly title: string }): ReactElement {
  return (
    <Heading level={2} data-slot="rpg-band-room-name" className="line-clamp-2 text-balance" title={title}>
      {title}
    </Heading>
  );
}

export interface RpgTakeoverHeaderProps {
  /** The ROOM's name — the band's first line, at the band's own heading voice (#875 F3). */
  readonly roomTitle: string;
  /** Does the game tab's BODY hold the satellite row right now (#878 F7)? Then the band does not. */
  readonly satellitesInBody: boolean;
  readonly ambient: RpgTrackerView["ambient"];
  readonly actors: RpgTrackerView["actors"];
  readonly trackerOrbs: readonly RpgTrackerOrb[];
  readonly viewerUserId: string;
  readonly trackersReadOnly: boolean;
  /** The room's EFFECTIVE state delivery (EFF-3) — drives the freshness indicator's honest posture (the
   *  ruling). NOT the raw `extractionMode` knob: a folded game that cannot fold must not read "Live". */
  readonly delivery: RpgEffectiveDelivery;
  /** The #9 ambient-date mode — `narrated` leads with the date string (no day counter); `structured` keeps it. */
  readonly dateMode: RpgDateMode;
  /** Reliable-mode transient: a character turn is live, so this beat's extraction hasn't flushed yet. */
  readonly freshnessPending: boolean;
  /** The host-only "N veiled" cue for the cues row (crown gold; the doorway to Status → Veiled).
   *  Supplied by the band host (it owns the host gate + the reveal read); `null`/absent ⇒ nothing. */
  readonly veiledCue?: ReactNode;
}

/** The waystone band — the signature composite + the text lines that carry its data.
 *
 *  TWO ARRANGEMENTS, ONE ANATOMY (F6 defect 4's second half). With an ambient set, this is the
 *  panel's signature composite and it is not the problem: stone + location + when-line + cues, then the
 *  satellite row beneath. With NO ambient set — no location, no clock, no date, no weather, the exact state
 *  F6 measured at 138px, 68% of the pane's chrome — every one of those lines is a blank, and the band was
 *  spending the pane's vertical budget on the word "No". The COMPRESSED form is one slim row: the unset copy
 *  on a single line and the cues + satellites inline beside the stone instead of stacked below it. The stone
 *  drops a size step on its OWN — an unset stone has no layers to carry, so `variants.ts` derives that from
 *  `clock === null` rather than taking a flag from here. (An earlier sketch had a `compact` prop; the
 *  no-layout-context-props gate / D42-D43 bans exactly that shape, and deriving it is what that flag was
 *  reaching for anyway.)
 *
 *  The cues and the satellites are built ONCE and placed by the arm, so the two forms cannot drift into two
 *  different bands — only the arrangement forks, which is the same discipline the HUD applies to the pane. */
export function RpgTakeoverHeader({
  roomTitle,
  satellitesInBody,
  ambient,
  actors,
  trackerOrbs,
  viewerUserId,
  trackersReadOnly,
  delivery,
  dateMode,
  freshnessPending,
  veiledCue,
}: RpgTakeoverHeaderProps): ReactElement {
  const stoneClock = stoneClockOf(ambient?.clock ?? null);
  const when = ambient === null ? "" : whenLine(ambient, dateMode);
  const location = ambient?.location ?? "";
  // THE COMPRESSED ARM'S CONDITION: nothing to read. `when` already folds date + clock + weather into
  // one string, so an empty location AND an empty when-line is exactly "no ambient set" — the same absence
  // the copy below states, derived from the rendered text rather than re-walking the ambient shape.
  const ambientUnset = location === "" && when === "";

  const cues = (
    <>
      <RpgFreshnessIndicator delivery={delivery} pending={freshnessPending} />
      {veiledCue}
      {trackersReadOnly ? (
        <Badge tone="soft" size="sm" title="This model can't update trackers — they still steer the story; edit them by hand.">
          <Icon icon={Lock} size="xs" />
          <Text as="span" voice="gloss" className="text-inherit">
            Read-only
          </Text>
        </Badge>
      ) : null}
    </>
  );

  // THE SATELLITE ROW HAS TWO POSSIBLE HOMES, AND THE BAND IS ONLY ONE OF THEM (#878 F7, owner-ruled
  // 2026-08-30). At a large type scale the row leaves this band for the game tab's own scroll region
  // (`rpg-game-tab-body.tsx`); `satellitesInBody` is the ONE derivation of which home it is in
  // (`use-rpg-context-state.ts`), so the two mounts can never both render it or both drop it. The row
  // itself, its coarse drop and its no-wrap ruling all live in `rpg-satellite-row.tsx`.
  const satellites = satellitesInBody ? null : <RpgSatelliteRow trackerOrbs={trackerOrbs} actors={actors} viewerUserId={viewerUserId} />;

  const stone = (
    <Waystone
      // The stone reads the HOUR continuously (its sky interpolates and its sun/moon walks a real arc);
      // the `clockTimeOfDay` label above is the TEXT half of the same datum, never a second source of truth.
      clock={stoneClock}
      // Already canonical: `weather.type` IS the Waystone's closed vocabulary (one axis, homed in
      // `@orb/kit/weather`) — there is no binning step left to get wrong.
      weather={ambient?.weather?.type ?? null}
      className="shrink-0"
    />
  );

  if (ambientUnset) {
    return (
      <Row gap="block" align="center" data-slot="rpg-takeover-header" data-compact={true}>
        {stone}
        <Stack gap="field" className="min-w-0 flex-1">
          <RoomName title={roomTitle} />
          {/* The absence, in the GLOSS voice — it explains, it is not a datum, and the compressed row is
              exactly where a 13px "No" was buying nothing (the four-voice grammar). */}
          <Text as="span" voice="gloss" className="truncate">
            No ambient set — the story fills it.
          </Text>
          {/* Cues and satellites share one wrapping row BESIDE the stone: with nothing to read above them
              they fit in the stone's own height, which is what makes the band a single row. */}
          <Row gap="row" align="center" className="flex-wrap">
            {cues}
            {satellites}
          </Row>
        </Stack>
      </Row>
    );
  }

  return (
    <Stack gap="block" data-slot="rpg-takeover-header" data-compact={false}>
      <Row gap="block" align="center">
        {stone}
        <Stack gap="field" className="min-w-0 flex-1">
          <RoomName title={roomTitle} />
          {/* A clock or a date WITHOUT a place: honest about which half is missing. "No ambient set" is the
              COMPRESSED arm's copy and would be a lie here — the when-line right below it is ambient.
              THE PLACE IS NOT THE NAME (#875 F3): this line used to be the band's first and only line, at
              `label`, carrying the SCENE's location where the chat and character bands carry the artifact's
              name — a whole narrated sentence, hard-ellipsised at 383px. It keeps the WHEN-line's voice
              directly above the when-line it belongs with, and gets two lines before it clips. */}
          <Text as="span" voice="gloss" className="line-clamp-2">
            {withoutHeadingEcho(location, roomTitle) || "No location set"}
          </Text>
          {when === "" ? null : (
            <Text as="span" voice="gloss" className="truncate tabular-nums">
              {when}
            </Text>
          )}
          <Row gap="field" align="center" className="flex-wrap">
            {cues}
          </Row>
        </Stack>
      </Row>

      {satellites}
    </Stack>
  );
}

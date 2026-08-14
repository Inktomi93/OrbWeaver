// The takeover HEADER BAND (panel-redesign DESIGN.md §2 — THE WAYSTONE) — the signature composite where
// OSRS puts the world orb: the 24h-dial + sky-disc waystone (kit `<Waystone>`, aria-hidden), the location
// column (location · `day N · <time> · <weather>` · the cues row), then the satellite row — up to 3 pool-orb
// `<RingGauge>`s + the honest `<CoinFigure>` wallet disc (a max-less quantity never wears an arc, §8.1).
// Every datum on the composite is decoration; the band's TEXT lines carry it all (tracker-kit a11y model).
//
// Nullable-honesty (§12.2.1): a null ambient clock ⇒ the unset waystone (neutral ring, no marker, dim sky)
// and the band text says the story hasn't set the scene yet. Weather needs no resolution step: `weather.type`
// is already the stone's CLOSED vocabulary (`@orb/kit/weather` — one axis, model-bound at the wire), while the
// band text shows the model's free `weather.label` when it wrote one.
// SATELLITE ELIGIBILITY — the rule, stated (side-eye 08-01: it was unstated, and the band drew a poolless
// tracker as a FULL ring). It is SHAPE FOLLOWS THE DATUM, not "which plane the number came from": the server
// hands the band exactly the trackers the HOST PINNED (`trackerOrbs`, envelope-capped there — the one
// derivation home), and this composition picks each one's FIGURE from whether it has a ceiling. A ceilinged
// pool is an ARC (`RingGauge` — the arc means value/max); a max-less quantity is a DISC (`CoinFigure`), the
// same grammar the wallet already wears, because "a max-less quantity wearing an arc would be a lie of
// shape" (DESIGN §2/§8.1) — and `max ?? value` was drawing exactly that lie, a permanently-full ring for a
// tracker that has no full. That one rule answers both halves of the finding: a poolless tracker (Grit) is a
// disc, not a missing orb; the wallet (Gold) is a disc for the same reason, not an exception.
// The band stays the GLANCE and the roster/sheet stay the READING: the same numbers appear in both because
// the band is persistent chrome across all seven tabs while a roster row is one tab's body (the OSRS orb
// idiom the design set is built on). DESIGN §2 pins the orb's own text ("label + `value/max` text beneath —
// text is the datum"), so the band does not drop its readout to de-duplicate against a body it cannot see.
// Orb color rides the ONE `resolveTrackerColor` derivation (`def.color ?? trackColor(ordinal)` — the owner
// free-hex ruling): the orb label joins back to the defining actor's `poolDefs` row for its picked color.
// The cues row = freshness (the EFFECTIVE delivery, honest — EFF-3) + the host-only `veiledCue` slot (§6 P3 — the band's
// crown-gold "N veiled" count, supplied by the band host off `rpg.revealHidden`) + the read-only pill.

import type { RpgClockTime, RpgDateMode, RpgEffectiveDelivery, RpgTrackerOrb, RpgTrackerView } from "@orb/contracts/rpg";
import { clockTimeOfDay, rpgWeatherText } from "@orb/contracts/rpg";
import { Badge } from "@orb/ui/badge";
import { Icon, Lock } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { CoinFigure, RingGauge, Waystone } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { HIDE_AT_COARSE } from "#components";
import { cn } from "#lib";
import { resolveTrackerColor, trackColorProps } from "../lib/track-color.ts";
import { RpgFreshnessIndicator } from "./rpg-freshness-indicator.tsx";

// The band renders the SERVER-derived orb set (§2 — satellites): the host's PINNED trackers, envelope-capped
// SERVER-SIDE (`trackerOrbs`, and each orb carries its own host-picked color). The client renders them all — no second cap (a client
// slice would silently drop a pinned orb the host asked for, the orb-pinning bug).
/** The 3-char uppercase tag the orb caption shows ("VIT"), the OSRS glanceable-vitals idiom. */
const ORB_TAG_LEN = 3;

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

/** ONE pinned tracker as a band SATELLITE, on the eligibility rule at the top of this file: a CEILINGED pool
 *  wears the arc (`RingGauge` — value/max, with its 3-char glance tag); a max-less quantity wears the wallet's
 *  disc instead, because an arc with no domain can only ever draw itself full. Both keep the tracker's own
 *  resolved ramp colour, so the definition→orb→bar colour identity (§3) survives the shape fork. */
function Satellite({ orb, ordinal }: { readonly orb: RpgTrackerOrb; readonly ordinal: number }): ReactElement {
  const color = trackColorProps(resolveTrackerColor(orb.color, ordinal));
  if (orb.max === null) {
    // The disc is a QUANTITY figure — it carries no arc, so a host-picked free hex has nothing to paint;
    // the ramp step is the honest colour channel it does have.
    return <CoinFigure amount={orb.value} label={orb.label} color={color.color} showCaption={true} />;
  }
  return (
    <RingGauge value={orb.value} max={orb.max} {...color} label={orb.label} showCaption={true} captionLabel={orb.label.slice(0, ORB_TAG_LEN).toUpperCase()} />
  );
}

/** The viewer's primary wallet — the FIRST named amount (§12.2.2 ordinal rule); null when unfunded. */
function primaryWallet(actors: RpgTrackerView["actors"], viewerUserId: string): { readonly name: string; readonly amount: number } | null {
  const viewer = actors.find((a) => a.actorRef.kind === "user" && a.actorRef.userId === viewerUserId) ?? actors[0];
  const first = viewer?.volatile?.wallet[0];
  return first ?? null;
}

export interface RpgTakeoverHeaderProps {
  readonly ambient: RpgTrackerView["ambient"];
  readonly actors: RpgTrackerView["actors"];
  readonly trackerOrbs: readonly RpgTrackerOrb[];
  readonly viewerUserId: string;
  readonly trackersReadOnly: boolean;
  /** The room's EFFECTIVE state delivery (EFF-3) — drives the freshness indicator's honest posture (§4.5, the
   *  ruling). NOT the raw `extractionMode` knob: a folded game that cannot fold must not read "Live". */
  readonly delivery: RpgEffectiveDelivery;
  /** The #9 ambient-date mode — `narrated` leads with the date string (no day counter); `structured` keeps it. */
  readonly dateMode: RpgDateMode;
  /** Reliable-mode transient: a character turn is live, so this beat's extraction hasn't flushed yet. */
  readonly freshnessPending: boolean;
  /** The host-only "N veiled" cue for the cues row (§2 — crown gold; the doorway to Status → Veiled).
   *  Supplied by the band host (it owns the host gate + the reveal read); `null`/absent ⇒ nothing. */
  readonly veiledCue?: ReactNode;
}

/** The waystone band — the signature composite + the text lines that carry its data.
 *
 *  TWO ARRANGEMENTS, ONE ANATOMY (HUD-1 §7.3, F6 defect 4's second half). With an ambient set, this is the
 *  panel's signature composite and it is not the problem: stone + location + when-line + cues, then the
 *  satellite row beneath. With NO ambient set — no location, no clock, no date, no weather, the exact state
 *  F6 measured at 138px, 68% of the pane's chrome — every one of those lines is a blank, and the band was
 *  spending the pane's vertical budget on the word "No". The COMPRESSED form is one slim row: the unset copy
 *  on a single line and the cues + satellites inline beside the stone instead of stacked below it. The stone
 *  drops a size step on its OWN — an unset stone has no layers to carry, so `variants.ts` derives that from
 *  `clock === null` rather than taking a flag from here. (§7.3 sketched a `compact` prop; the
 *  no-layout-context-props gate / D42-D43 bans exactly that shape, and deriving it is what that flag was
 *  reaching for anyway.)
 *
 *  The cues and the satellites are built ONCE and placed by the arm, so the two forms cannot drift into two
 *  different bands — only the arrangement forks, which is the same discipline the HUD applies to the pane. */
export function RpgTakeoverHeader({
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
  const wallet = primaryWallet(actors, viewerUserId);
  // THE COMPRESSED ARM'S CONDITION (§7.3): nothing to read. `when` already folds date + clock + weather into
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

  // THE SATELLITE ROW IS FINE-POINTER CHROME (side-eye 2026-08-07 finding 2). MEASURED on the live stack at
  // 320×568: the claimed pane is 464px tall, this row alone is 100 of it, and the whole HUD column left the
  // active tabpanel EIGHTEEN pixels against a 558px body — Status, Inventory, Scene, Quests and Journal were
  // all unreadable and the weather picker painted its chips entirely outside the visible strip. The band is
  // the GLANCE and the tab bodies are the READING (this file's own §2 framing): on a phone there is no room
  // for both, and the READING is what the pane is for. `pointer-coarse`, not a width query: the constraint
  // is the phone's vertical budget, which a container query cannot see.
  //
  // WHERE THE DROPPED FIGURES ACTUALLY GO (owner ruling 2026-08-07 — KEEP the drop, CORRECT this text). The
  // original claim here was "every one of them is a tracker row in Status", and side-eye measured that to be
  // broader than the truth. Per figure, on the seeded d20 shape:
  //   · HP · Mana · Focus — YES, tracker rows on the Status roster card. One tap (Status is the rail's first
  //     cell and the default selection), and the reclaimed height is what makes them readable there.
  //   · The WALLET (gold) — NOT a Status row, and never was. It renders in the INVENTORY tab header (one
  //     tap) and again in the character takeover (two). The "every one of them" claim never covered it.
  // AND THE CLAIM IS SHAPE-SPECIFIC, not general: the orb set is derived server-side
  // (`rpg/chat-ops/tracker-view.ts`) from the pinned METER trackers of the first actor with state, then the
  // pinned GAME trackers — and a pinned game-level tracker is not an actor tracker row at all, while an orb
  // from a `kind:"cast"` actor homes on SCENE (rpg-status-tab.tsx filters `kind !== "cast"` out of the
  // roster by design). So it is true for the seeded d20 profile and not guaranteed in general.
  // THE ACCEPTED COST: at coarse, on Scene/Quests/Journal/Map there are no vitals and no wallet on screen.
  // The owner ruled that acceptable rather than spend a text line of the phone's budget re-stating them.
  const satellites =
    trackerOrbs.length === 0 && wallet === null ? null : (
      <Row gap="block" align="start" className={cn("flex-wrap", HIDE_AT_COARSE) ?? ""} data-slot="rpg-band-satellites">
        {trackerOrbs.map((orb, i) => (
          <Satellite key={orb.key} orb={orb} ordinal={i} />
        ))}
        {wallet === null ? null : <CoinFigure amount={wallet.amount} label={wallet.name} showCaption={true} />}
      </Row>
    );

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
          {/* The absence, in the GLOSS voice — it explains, it is not a datum, and the compressed row is
              exactly where a 13px "No" was buying nothing (§7.4's four-voice grammar). */}
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
          {/* A clock or a date WITHOUT a place: honest about which half is missing. "No ambient set" is the
              COMPRESSED arm's copy and would be a lie here — the when-line right below it is ambient. */}
          <Text as="span" voice="label" className="truncate">
            {location || "No location set"}
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

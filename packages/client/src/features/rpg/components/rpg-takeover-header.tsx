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
// Orb color rides the ONE `resolveTrackerColor` derivation (`def.color ?? trackColor(ordinal)` — the owner
// free-hex ruling): the orb label joins back to the defining actor's `poolDefs` row for its picked color.
// The cues row = freshness (extractionMode, honest) + the host-only `veiledCue` slot (§6 P3 — the band's
// crown-gold "N veiled" count, supplied by the band host off `rpg.revealHidden`) + the read-only pill.

import type { RpgClockTime, RpgDateMode, RpgExtractionMode, RpgTrackerOrb, RpgTrackerView } from "@orb/contracts/rpg";
import { rpgWeatherText, timeOfDayAtHour } from "@orb/contracts/rpg";
import { Badge } from "@orb/ui/badge";
import { Icon, Lock } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { CoinFigure, RingGauge, Waystone } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { resolveTrackerColor, trackColorProps } from "../lib/track-color";
import { RpgFreshnessIndicator } from "./rpg-freshness-indicator";

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
  if (dateMode === "narrated") {
    if (ambient.calendarDate !== null) {
      parts.push(ambient.calendarDate);
    }
    if (ambient.clock !== null) {
      parts.push(timeOfDayAtHour(ambient.clock.hour));
    }
  } else if (ambient.clock !== null) {
    parts.push(`day ${ambient.clock.day}`, timeOfDayAtHour(ambient.clock.hour));
  } else if (ambient.calendarDate !== null) {
    parts.push(ambient.calendarDate);
  }
  // The numeric hour the Waystone actually draws from (side-eye F17): the stone points at 21:40 while the
  // text said only "night", so the picture carried a datum the text didn't. TEXT IS THE DATUM — it has to be
  // a superset of the decoration, never the other way round.
  if (ambient.clock !== null) {
    parts.push(clockTime(ambient.clock));
  }
  if (ambient.weather !== null) {
    // The model's own phrasing when it wrote one ("torrential sleet"), else the canonical type — the band
    // TEXT is the datum, the stone's sky is the decoration bound to `weather.type`.
    parts.push(rpgWeatherText(ambient.weather));
  }
  return parts.join(" · ");
}

/** The stored clock as a plain 24h reading (`21:40`) — the same number the stone's hand points at. */
function clockTime(clock: RpgClockTime): string {
  return `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
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
  /** The game's delivery-model knob — drives the freshness indicator's honest posture (§4.5, the ruling). */
  readonly extractionMode: RpgExtractionMode;
  /** The #9 ambient-date mode — `narrated` leads with the date string (no day counter); `structured` keeps it. */
  readonly dateMode: RpgDateMode;
  /** Reliable-mode transient: a character turn is live, so this beat's extraction hasn't flushed yet. */
  readonly freshnessPending: boolean;
  /** The host-only "N veiled" cue for the cues row (§2 — crown gold; the doorway to Status → Veiled).
   *  Supplied by the band host (it owns the host gate + the reveal read); `null`/absent ⇒ nothing. */
  readonly veiledCue?: ReactNode;
}

/** The waystone band — the signature composite + the text lines that carry its data. */
export function RpgTakeoverHeader({
  ambient,
  actors,
  trackerOrbs,
  viewerUserId,
  trackersReadOnly,
  extractionMode,
  dateMode,
  freshnessPending,
  veiledCue,
}: RpgTakeoverHeaderProps): ReactElement {
  const clock = ambient?.clock ?? null;
  const when = ambient === null ? "" : whenLine(ambient, dateMode);
  const location = ambient?.location ?? "";
  const wallet = primaryWallet(actors, viewerUserId);

  return (
    <Stack gap="block" data-slot="rpg-takeover-header">
      <Row gap="block" align="center">
        <Waystone
          // The stone reads the HOUR continuously (its sky interpolates and its sun/moon walks a real arc);
          // the `timeOfDayAtHour` label above is the TEXT half of the same datum, never a second source of truth.
          clock={clock === null ? null : { hour: clock.hour, minute: clock.minute }}
          // Already canonical: `weather.type` IS the Waystone's closed vocabulary (one axis, homed in
          // `@orb/kit/weather`) — there is no binning step left to get wrong.
          weather={ambient?.weather?.type ?? null}
          className="shrink-0"
        />
        <Stack gap="field" className="min-w-0 flex-1">
          {location === "" ? (
            <Text as="span" size="label" tone="muted" className="truncate">
              No ambient set — the story fills it.
            </Text>
          ) : (
            <Text as="span" size="label" weight="semibold" className="truncate">
              {location}
            </Text>
          )}
          {when === "" ? null : (
            <Text as="span" size="micro" tone="muted" className="truncate tabular-nums">
              {when}
            </Text>
          )}
          <Row gap="field" align="center" className="flex-wrap">
            <RpgFreshnessIndicator extractionMode={extractionMode} pending={freshnessPending} />
            {veiledCue}
            {trackersReadOnly ? (
              <Badge tone="soft" size="sm" title="This model can't update trackers — they still steer the story; edit them by hand.">
                <Icon icon={Lock} size="xs" />
                <Text as="span" size="micro" weight="medium">
                  Read-only
                </Text>
              </Badge>
            ) : null}
          </Row>
        </Stack>
      </Row>

      {trackerOrbs.length === 0 && wallet === null ? null : (
        <Row gap="block" align="start" className="flex-wrap">
          {trackerOrbs.map((orb, i) => (
            <RingGauge
              key={orb.key}
              value={orb.value}
              max={orb.max ?? orb.value}
              {...trackColorProps(resolveTrackerColor(orb.color, i))}
              label={orb.label}
              showCaption={true}
              captionLabel={orb.label.slice(0, ORB_TAG_LEN).toUpperCase()}
            />
          ))}
          {wallet === null ? null : <CoinFigure amount={wallet.amount} label={wallet.name} showCaption={true} />}
        </Row>
      )}
    </Stack>
  );
}

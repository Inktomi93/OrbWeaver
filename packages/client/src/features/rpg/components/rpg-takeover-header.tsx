// The takeover HEADER BAND (panel-redesign DESIGN.md §2 — THE WAYSTONE) — the signature composite where
// OSRS puts the world orb: the 24h-dial + sky-disc waystone (kit `<Waystone>`, aria-hidden), the location
// column (location · `day N · <time> · <weather>` · the cues row), then the satellite row — up to 3 pool-orb
// `<RingGauge>`s + the honest `<CoinFigure>` wallet disc (a max-less quantity never wears an arc, §8.1).
// Every datum on the composite is decoration; the band's TEXT lines carry it all (tracker-kit a11y model).
//
// Nullable-honesty (§12.2.1): a null ambient clock ⇒ the unset waystone (neutral ring, no marker, dim sky)
// and the band text says the story hasn't set the scene yet. Weather resolves through the ONE glyph-resolver
// weather home (`resolveWeatherOverlay`); an unresolvable type = plain sky, the text still names it.
// Orb color rides the ONE `resolvePoolColor` derivation (`def.color ?? trackColor(ordinal)` — the owner
// free-hex ruling): the orb label joins back to the defining actor's `poolDefs` row for its picked color.
// The cues row = freshness (extractionMode, honest) + the host-only `veiledCue` slot (§6 P3 — the band's
// crown-gold "N veiled" count, supplied by the band host off `rpg.revealHidden`) + the read-only pill.

import type { RpgClockTime, RpgExtractionMode, RpgPoolOrb, RpgTrackerView } from "@orb/contracts/rpg";
import { TIME_OF_DAY_HOURS } from "@orb/contracts/rpg";
import { Badge } from "@orb/ui/badge";
import { Icon, Lock } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { CoinFigure, RingGauge, Waystone } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { resolveWeatherOverlay } from "../lib/glyphs";
import { resolvePoolColor, trackColorProps } from "../lib/track-color";
import { RpgFreshnessIndicator } from "./rpg-freshness-indicator";

// The band renders the SERVER-derived orb set (§2 — satellites): auto-first-3 ∪ the host's pinned pools,
// deduped + envelope-capped SERVER-SIDE (`poolOrbs`). The client renders them all — no second cap (a client
// slice would silently drop a pinned orb the host asked for, the orb-pinning bug).
/** The 3-char uppercase tag the orb caption shows ("VIT"), the OSRS glanceable-vitals idiom. */
const ORB_TAG_LEN = 3;

/** Derive the lite time-of-day LABEL back from the stored clock hour (§2.7 — the banner inverts the
 *  `TIME_OF_DAY_HOURS` mapping to the nearest representative hour). */
function timeOfDayLabel(clock: RpgClockTime): string {
  let best = "";
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [label, hour] of Object.entries(TIME_OF_DAY_HOURS)) {
    const dist = Math.abs(hour - clock.hour);
    if (dist < bestDist) {
      bestDist = dist;
      best = label;
    }
  }
  return best;
}

/** Line 2's `day N · <time> · <weather>` when/where caption from the ambient strip. Empty segments drop. */
function whenLine(ambient: NonNullable<RpgTrackerView["ambient"]>): string {
  const parts: string[] = [];
  if (ambient.clock !== null) {
    parts.push(`day ${ambient.clock.day}`, timeOfDayLabel(ambient.clock));
  } else if (ambient.calendarDate !== null) {
    parts.push(ambient.calendarDate);
  }
  if (ambient.weather !== null) {
    parts.push(ambient.weather.type);
  }
  return parts.join(" · ");
}

/** Join an orb's label back to its defining actor's poolDef row for the host-picked color (the orb list is
 *  the server first-3 derivation and carries no color itself). First matching def wins. */
function orbColor(label: string, actors: RpgTrackerView["actors"], ordinal: number): ReturnType<typeof resolvePoolColor> {
  for (const actor of actors) {
    const def = actor.sheet.poolDefs.find((d) => d.name === label);
    if (def !== undefined) {
      return resolvePoolColor(def.color, ordinal);
    }
  }
  return resolvePoolColor(null, ordinal);
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
  readonly poolOrbs: readonly RpgPoolOrb[];
  readonly viewerUserId: string;
  readonly trackersReadOnly: boolean;
  /** The game's delivery-model knob — drives the freshness indicator's honest posture (§4.5, the ruling). */
  readonly extractionMode: RpgExtractionMode;
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
  poolOrbs,
  viewerUserId,
  trackersReadOnly,
  extractionMode,
  freshnessPending,
  veiledCue,
}: RpgTakeoverHeaderProps): ReactElement {
  const clock = ambient?.clock ?? null;
  const weatherType = ambient?.weather?.type ?? null;
  const when = ambient === null ? "" : whenLine(ambient);
  const location = ambient?.location ?? "";
  const wallet = primaryWallet(actors, viewerUserId);

  return (
    <Stack gap="block" data-slot="rpg-takeover-header">
      <Row gap="block" align="center">
        <Waystone
          hour={clock === null ? null : clock.hour}
          minute={clock === null ? 0 : clock.minute}
          weather={weatherType === null ? null : resolveWeatherOverlay(weatherType)}
          className="@max-md:size-16 shrink-0"
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

      {poolOrbs.length === 0 && wallet === null ? null : (
        <Row gap="block" align="start" className="flex-wrap">
          {poolOrbs.map((orb, i) => (
            <RingGauge
              key={orb.label}
              value={orb.value}
              max={orb.max}
              {...trackColorProps(orbColor(orb.label, actors, i))}
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

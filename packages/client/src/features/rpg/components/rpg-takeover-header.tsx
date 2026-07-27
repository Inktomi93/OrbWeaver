// The takeover HEADER (Context-Panel-Program §4.5) — scene banner + pool orbs + the read-only pill. Two
// lines at the 17rem floor: line 1 = orientation (location · `day N · <time> · <weather>`, from the ambient
// strip data — mode-agnostic scene DATA, §3.2); line 2 = up to 3 pool-orb ring gauges (`trackerView.poolOrbs`,
// value inside, label as the visually-hidden datum + a caption tag). The read-only pill (§4.4) shows when
// `trackersReadOnly` — the honest-arms signal that this model can't write trackers (edit them by hand).
//
// SEAM (W3c): §4.5 mounts this in the `ResolvedContextTabs.header` band ABOVE both strips. That slot is owned
// by CHAT's `defineContextTabs<ChatContextState>` and chat may not import rpg — so W3c extended the §6c
// contributor mechanism with an optional `ContextTabDef.header` (registry-contracts.ts): the rpg contributor
// supplies this band content on its `rpg.status` tab, `resolveContextTabs` lifts the first `when`-passing
// contributor header into `ResolvedContextTabs.header`, and `RpgHeaderBand` (the header-contributor host)
// re-resolves the same panel state and renders this component into the real band. rpg never imports chat.

import type { RpgClockTime, RpgPoolOrb, RpgTrackerView } from "@orb/contracts/rpg";
import { TIME_OF_DAY_HOURS } from "@orb/contracts/rpg";
import { Badge } from "@orb/ui/badge";
import { Compass, Icon, Lock } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { RingGauge } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { trackColor } from "../lib/track-color";

// The header shows up to 3 pool orbs (§4.5), each on the next track-ramp step (categorical, by pool order).
const MAX_ORBS = 3;
/** The first 4-char uppercase tag the orb caption shows ("VITA"), matching the OSRS glanceable-vitals idiom. */
const ORB_TAG_LEN = 4;

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

/** Line 1's `day N · <time> · <weather>` when/where caption from the ambient strip. Empty segments drop. */
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

export interface RpgTakeoverHeaderProps {
  readonly ambient: RpgTrackerView["ambient"];
  readonly poolOrbs: readonly RpgPoolOrb[];
  readonly trackersReadOnly: boolean;
}

/** The scene banner + pool orbs + read-only pill (§4.5). */
export function RpgTakeoverHeader({ ambient, poolOrbs, trackersReadOnly }: RpgTakeoverHeaderProps): ReactElement {
  const when = ambient === null ? "" : whenLine(ambient);
  return (
    <Stack gap="block" data-slot="rpg-takeover-header">
      {ambient !== null && (ambient.location !== "" || when !== "") ? (
        <Row gap="field" align="start">
          <Icon icon={Compass} size="sm" className="text-muted-foreground" />
          <Stack gap="field" className="min-w-0">
            {ambient.location === "" ? null : (
              <Text as="span" size="label" weight="semibold" className="truncate">
                {ambient.location}
              </Text>
            )}
            {when === "" ? null : (
              <Text as="span" size="micro" tone="muted" className="tabular-nums">
                {when}
              </Text>
            )}
          </Stack>
        </Row>
      ) : null}

      {trackersReadOnly ? (
        <Badge tone="soft" size="sm" title="This model can't update trackers — they still steer the story; edit them by hand.">
          <Icon icon={Lock} size="xs" />
          <Text as="span" size="micro" weight="medium">
            Trackers read-only
          </Text>
        </Badge>
      ) : null}

      {poolOrbs.length === 0 ? null : (
        <Row gap="block" align="center" className="flex-wrap">
          {poolOrbs.slice(0, MAX_ORBS).map((orb, i) => (
            <RingGauge
              key={orb.label}
              value={orb.value}
              max={orb.max}
              color={trackColor(i)}
              label={orb.label}
              showCaption={true}
              captionLabel={orb.label.slice(0, ORB_TAG_LEN).toUpperCase()}
            />
          ))}
        </Row>
      )}
    </Stack>
  );
}

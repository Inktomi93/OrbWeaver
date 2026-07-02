// <Meter> — the ONE 1-D magnitude display (D52/D58; rpg-design/11 §2). Deliberately NOT Base UI's
// Meter: that component is linear-DOM-shaped, and the arc/bipolar kinds need SVG/center-origin
// rendering — so ONE hand-rolled ARIA mechanism (role="meter" + value semantics) covers all three
// kinds (decision recorded in ui-package-design.md §10.4).
import type { ReactElement } from "react";
import { arcMeter, bipolarMeter, linearMeter } from "./variants";

export interface MeterProps {
  /** Presentation of the magnitude — same data, different dress (rpg-design/11 §2). */
  kind: "linear" | "arc" | "bipolar";
  value: number;
  /** Upper bound. Defaults to 100. */
  max?: number;
  /** Lower bound. Defaults to 0 (bipolar: −max, the −100..100 domain style — taken generically). */
  min?: number;
  /** Tick positions in value space (rendered on linear/bipolar; arc has no tick geometry in v1). */
  milestones?: number[];
  /** When `value < dangerBelow` the fill swaps to the danger INTENT token — never a color calc. */
  dangerBelow?: number;
  /** Accessible name (aria-label) — required; the meter itself renders no text. */
  label: string;
  className?: string;
}

const DEFAULT_MAX = 100;
const PERCENT_MAX = 100;

// Arc geometry (SVG viewBox units — named per biome noMagicNumbers).
const ARC_SIZE = 48;
const ARC_STROKE = 6;
const ARC_CENTER = ARC_SIZE / 2;
const ARC_RADIUS = ARC_CENTER - ARC_STROKE / 2;
/** 270° gauge sweep — the classic dial, gap centered at the bottom. */
const ARC_SWEEP = 0.75;
const ARC_START_DEG = 135;
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;

interface MeterAria {
  readonly role: "meter";
  readonly "aria-valuemin": number;
  readonly "aria-valuemax": number;
  readonly "aria-valuenow": number;
  readonly "aria-label": string;
}

function toFraction(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function pct(fraction: number): string {
  return `${fraction * PERCENT_MAX}%`;
}

interface TrackProps {
  readonly aria: MeterAria;
  readonly fraction: number;
  readonly ticks: number[];
  readonly danger: boolean;
  readonly className?: string | undefined;
}

function LinearTrack({ aria, fraction, ticks, danger, className }: TrackProps): ReactElement {
  const slots = linearMeter({ danger });
  return (
    <div {...aria} className={slots.root({ className })}>
      <div data-slot="fill" className={slots.fill()} style={{ width: pct(fraction) }} />
      {ticks.map((tick) => (
        <div key={tick} data-slot="tick" className={slots.tick()} style={{ left: pct(tick) }} />
      ))}
    </div>
  );
}

function ArcTrack({ aria, fraction, danger, className }: TrackProps): ReactElement {
  const slots = arcMeter({ danger });
  const rotate = `rotate(${ARC_START_DEG} ${ARC_CENTER} ${ARC_CENTER})`;
  return (
    <svg {...aria} viewBox={`0 0 ${ARC_SIZE} ${ARC_SIZE}`} className={slots.root({ className })}>
      <title>{aria["aria-label"]}</title>
      <circle
        className={slots.track()}
        cx={ARC_CENTER}
        cy={ARC_CENTER}
        r={ARC_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={ARC_STROKE}
        strokeLinecap="round"
        strokeDasharray={`${ARC_SWEEP * ARC_CIRCUMFERENCE} ${ARC_CIRCUMFERENCE}`}
        transform={rotate}
      />
      <circle
        data-slot="fill"
        className={slots.fill()}
        cx={ARC_CENTER}
        cy={ARC_CENTER}
        r={ARC_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={ARC_STROKE}
        strokeLinecap="round"
        strokeDasharray={`${fraction * ARC_SWEEP * ARC_CIRCUMFERENCE} ${ARC_CIRCUMFERENCE}`}
        transform={rotate}
      />
    </svg>
  );
}

interface BipolarTrackProps extends TrackProps {
  /** The zero point of the value domain, as a track fraction — the fill's origin. */
  readonly origin: number;
}

function BipolarTrack({
  aria,
  fraction,
  origin,
  ticks,
  danger,
  className,
}: BipolarTrackProps): ReactElement {
  const slots = bipolarMeter({ danger });
  const start = Math.min(origin, fraction);
  const width = Math.abs(fraction - origin);
  return (
    <div {...aria} className={slots.root({ className })}>
      <div
        data-slot="fill"
        className={slots.fill()}
        style={{ left: pct(start), width: pct(width) }}
      />
      <div data-slot="origin" className={slots.origin()} style={{ left: pct(origin) }} />
      {ticks.map((tick) => (
        <div key={tick} data-slot="tick" className={slots.tick()} style={{ left: pct(tick) }} />
      ))}
    </div>
  );
}

/**
 * Pure magnitude display — knows NOTHING of HP/reputation (rpg-design/11 §2; the D58 spec):
 * `linear` = div track+fill, `arc` = SVG radial gauge, `bipolar` = center-origin −/+ fill with
 * milestone ticks. `dangerBelow` swaps the fill to the destructive intent token.
 *
 * Usage: `<Meter kind="linear" value={hp} max={maxHp} dangerBelow={maxHp / 4} label="HP" />`.
 */
export function Meter({
  kind,
  value,
  max = DEFAULT_MAX,
  min,
  milestones,
  dangerBelow,
  label,
  className,
}: MeterProps): ReactElement {
  const lower = min ?? (kind === "bipolar" ? -max : 0);
  const fraction = toFraction(value, lower, max);
  const danger = dangerBelow !== undefined && value < dangerBelow;
  const ticks = (milestones ?? []).map((milestone) => toFraction(milestone, lower, max));
  const aria: MeterAria = {
    role: "meter",
    "aria-valuemin": lower,
    "aria-valuemax": max,
    "aria-valuenow": Math.min(max, Math.max(lower, value)),
    "aria-label": label,
  };
  if (kind === "arc") {
    return (
      <ArcTrack
        aria={aria}
        fraction={fraction}
        ticks={ticks}
        danger={danger}
        className={className}
      />
    );
  }
  if (kind === "bipolar") {
    return (
      <BipolarTrack
        aria={aria}
        fraction={fraction}
        origin={toFraction(0, lower, max)}
        ticks={ticks}
        danger={danger}
        className={className}
      />
    );
  }
  return (
    <LinearTrack
      aria={aria}
      fraction={fraction}
      ticks={ticks}
      danger={danger}
      className={className}
    />
  );
}

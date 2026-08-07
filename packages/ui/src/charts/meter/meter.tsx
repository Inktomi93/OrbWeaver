// PREBUILT[for:rpg-design/11-client-ui.md] — no current consumer; sealed for the rpg HUD's
// resource/pool widgets (bindings table §"HUD widget vocabulary"). Delete this marker (and
// re-check for consumers) if that plan is ever dropped instead of built.
// Base UI Meter.Root supplies the a11y shell (role="meter", aria-valuemin/max/now, aria-valuetext)
// while custom SVG/div geometry (arc/bipolar/milestone) rides as its CHILDREN, not via `render` —
// Meter.Root always appends a visually-hidden span into `children`, and replacing the root with an
// `<svg>` would inject that span inside it (invalid).
import type { MeterRootProps as BaseMeterRootProps } from "@base-ui/react/meter";
import { Meter as BaseMeter } from "@base-ui/react/meter";
import type { ReactElement, ReactNode } from "react";
import { arcMeterVariants, bipolarMeterVariants, linearMeterVariants, meterVariants } from "./variants.ts";

export interface MeterProps {
  /** Presentation of the magnitude — same data, different dress. */
  kind: "linear" | "arc" | "bipolar";
  value: NonNullable<BaseMeterRootProps["value"]>;
  /** @defaultValue 100 */
  max?: BaseMeterRootProps["max"];
  /** @defaultValue 0 (bipolar: `-max`) */
  min?: BaseMeterRootProps["min"];
  /** Tick positions in value space (rendered on linear/bipolar; arc has no tick geometry). */
  milestones?: number[];
  /** When `value < dangerBelow` the fill swaps to the danger INTENT token. */
  dangerBelow?: number;
  /** Accessible name — names the meter (aria); also the visible label text when `showValue`. */
  label: string;
  /** Render the visible label + value readout row above the geometry. @defaultValue false */
  showValue?: boolean;
  formatValue?: (formattedValue: string, value: number) => ReactNode;
  format?: BaseMeterRootProps["format"];
  locale?: BaseMeterRootProps["locale"];
  getAriaValueText?: BaseMeterRootProps["getAriaValueText"];
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

function toFraction(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function pct(fraction: number): string {
  return `${fraction * PERCENT_MAX}%`;
}

interface GeometryProps {
  readonly fraction: number;
  readonly ticks: number[];
  readonly danger: boolean;
}

function LinearGeometry({ fraction, ticks, danger }: GeometryProps): ReactElement {
  const slots = linearMeterVariants({ danger });
  return (
    <div className={slots.root()} data-slot="meter-track">
      <div className={slots.fill()} data-slot="fill" style={{ width: pct(fraction) }} />
      {ticks.map((tick) => (
        <div className={slots.tick()} data-slot="tick" key={tick} style={{ left: pct(tick) }} />
      ))}
    </div>
  );
}

function ArcGeometry({ fraction, danger }: GeometryProps): ReactElement {
  const slots = arcMeterVariants({ danger });
  const rotate = `rotate(${ARC_START_DEG} ${ARC_CENTER} ${ARC_CENTER})`;
  return (
    <svg aria-hidden={true} className={slots.root()} data-slot="meter-track" viewBox={`0 0 ${ARC_SIZE} ${ARC_SIZE}`}>
      <circle
        className={slots.track()}
        cx={ARC_CENTER}
        cy={ARC_CENTER}
        fill="none"
        r={ARC_RADIUS}
        stroke="currentColor"
        strokeDasharray={`${ARC_SWEEP * ARC_CIRCUMFERENCE} ${ARC_CIRCUMFERENCE}`}
        strokeLinecap="round"
        strokeWidth={ARC_STROKE}
        transform={rotate}
      />
      <circle
        className={slots.fill()}
        cx={ARC_CENTER}
        cy={ARC_CENTER}
        data-slot="fill"
        fill="none"
        r={ARC_RADIUS}
        stroke="currentColor"
        strokeDasharray={`${fraction * ARC_SWEEP * ARC_CIRCUMFERENCE} ${ARC_CIRCUMFERENCE}`}
        strokeLinecap="round"
        strokeWidth={ARC_STROKE}
        transform={rotate}
      />
    </svg>
  );
}

interface BipolarGeometryProps extends GeometryProps {
  /** The zero point of the value domain, as a track fraction. */
  readonly origin: number;
}

function BipolarGeometry({ fraction, origin, ticks, danger }: BipolarGeometryProps): ReactElement {
  const slots = bipolarMeterVariants({ danger });
  const start = Math.min(origin, fraction);
  const width = Math.abs(fraction - origin);
  return (
    <div className={slots.root()} data-slot="meter-track">
      <div className={slots.fill()} data-slot="fill" style={{ left: pct(start), width: pct(width) }} />
      <div className={slots.origin()} data-slot="origin" style={{ left: pct(origin) }} />
      {ticks.map((tick) => (
        <div className={slots.tick()} data-slot="tick" key={tick} style={{ left: pct(tick) }} />
      ))}
    </div>
  );
}

function renderGeometry(kind: MeterProps["kind"], geo: GeometryProps, origin: number): ReactElement {
  if (kind === "arc") {
    return <ArcGeometry {...geo} />;
  }
  if (kind === "bipolar") {
    return <BipolarGeometry {...geo} origin={origin} />;
  }
  return <LinearGeometry {...geo} />;
}

/** Pure magnitude display — knows nothing of HP/reputation. */
export function Meter({
  kind,
  value,
  max = DEFAULT_MAX,
  min,
  milestones,
  dangerBelow,
  label,
  showValue = false,
  formatValue,
  format,
  locale,
  getAriaValueText,
  className,
}: MeterProps): ReactElement {
  const lower = min ?? (kind === "bipolar" ? -max : 0);
  const fraction = toFraction(value, lower, max);
  const danger = dangerBelow !== undefined && value < dangerBelow;
  const ticks = (milestones ?? []).map((milestone) => toFraction(milestone, lower, max));
  const wrap = meterVariants({ kind });
  const geometry = renderGeometry(kind, { fraction, ticks, danger }, toFraction(0, lower, max));

  return (
    <BaseMeter.Root
      // With the visible label shown, Meter.Label names the meter; otherwise the name rides aria-label.
      aria-label={showValue ? undefined : label}
      className={wrap.root({ className })}
      data-slot="meter"
      format={format}
      getAriaValueText={getAriaValueText}
      locale={locale}
      max={max}
      min={lower}
      value={value}
    >
      {showValue ? (
        <div className={wrap.header()} data-slot="meter-header">
          <BaseMeter.Label className={wrap.label()} data-slot="meter-label">
            {label}
          </BaseMeter.Label>
          <BaseMeter.Value className={wrap.value()} data-slot="meter-value">
            {formatValue ?? null}
          </BaseMeter.Value>
        </div>
      ) : null}
      {geometry}
    </BaseMeter.Root>
  );
}

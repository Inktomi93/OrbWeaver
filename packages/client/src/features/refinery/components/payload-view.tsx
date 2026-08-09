// PayloadView — the schema-driven payload renderer (refinery R3; schema-renderer §3): walks a
// `RenderPlan` + the payload TOGETHER. The plan decided every widget from the SCHEMA alone; this file
// only fills values — no datum ever picks a widget here (the anti-sniffing law). The FIXED payloads and
// every custom schema render through this ONE component: the built-in surface is literally the general
// renderer applied to a hinted schema, and the schema-editor's test preview mounts the same component,
// which is what keeps the renderer honest under customs (if a custom renders poorly, THIS is the defect).
//
// PRESENTATION ORDER (the mock anatomy, generalized): verdict banners lead (the analyze frame), then the
// hero gauge with its docked prose (the score frame's gauge + summary), then everything else in schema
// order. Empty/absent values are LOAD-BEARING designed states ("—" / "none listed"), never collapses.

import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Row, Stack } from "@orb/ui/layout";
import { Meter } from "@orb/ui/meter";
import { Skeleton } from "@orb/ui/skeleton";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { testId } from "#lib";
import { useCountUp } from "../hooks/use-count-up.ts";
import type { PlanField, RenderPlan, RowPlan } from "../lib/render-plan.ts";
import { armFits } from "../lib/render-plan.ts";
import { RefineryChip } from "./refinery-chip.tsx";

export interface PayloadViewProps {
  readonly plan: RenderPlan;
  readonly payload: Record<string, unknown>;
  /** A model call for THIS payload is in flight. Drives the plan-shaped skeleton / running dim (see
   *  `PayloadView`). Optional so every existing caller keeps its meaning. @defaultValue false */
  readonly pending?: boolean;
  /** This payload LANDED from a mutation the surface itself just made (live e2e 2026-08-09): on a
   *  session's FIRST run the pane shows `RunningPane` — a different component — so this view mounts
   *  already settled and its own `awaited` latch (below) can never have fired. The surface knows which
   *  run ids its mutations produced; a run the user just watched land animates, a session merely
   *  opened does not. @defaultValue false */
  readonly arrived?: boolean;
}

type GaugeWidget = Extract<PlanField["widget"], { kind: "gauge" }>;
type ChipEnumWidget = Extract<PlanField["widget"], { kind: "chip-enum" }>;
type SectionWidget = Extract<PlanField["widget"], { kind: "section" }>;
type UnionWidget = Extract<PlanField["widget"], { kind: "union" }>;

const ABSENT_TEXT = "—";
const NONE_LISTED = "none listed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A scalar's display text — the generic floor's formatter (never raw JSON: objects/arrays cannot reach
 *  it, the plan routed them to sections/rows/lists). */
function scalarText(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return ABSENT_TEXT;
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

function fieldOrder(fields: readonly PlanField[]): { banners: PlanField[]; hero: PlanField | null; heroProse: PlanField | null; rest: PlanField[] } {
  const banners = fields.filter((f) => f.widget.kind === "chip-enum" && f.widget.verdict);
  const hero = fields.find((f) => f.widget.kind === "gauge" && f.widget.hero) ?? null;
  const firstProse = fields.find((f) => f.widget.kind === "prose") ?? null;
  const heroProse = hero !== null ? firstProse : null;
  // A banner CLAIMS what it docks (the axis gauge pill + the body prose) — those fields render ON the
  // banner and must never paint a second time in the rest walk (the mock shows soul exactly once).
  const bannerAxis = banners.length > 0 ? (fields.find((f) => f.widget.kind === "gauge" && !f.widget.hero) ?? null) : null;
  const bannerProse = banners.length > 0 ? firstProse : null;
  const claimed = new Set<PlanField>([...banners, hero, heroProse, bannerAxis, bannerProse].filter((f): f is PlanField => f !== null));
  return { banners, hero, heroProse, rest: fields.filter((f) => !claimed.has(f)) };
}

/** THE TWO PENDING ARMS (side-eye 2026-08-09 P1-10 + polish items 1 & 2). The feature had ZERO loading
 *  affordance and a status line that read "not run yet" while a run was in flight.
 *
 *  FIRST RUN → the PLAN-SHAPED SKELETON. The plan decided every widget from the SCHEMA alone, so the
 *  anatomy of the answer is fully known BEFORE the model returns: hero block, N verdict banners, one
 *  block per field. A generic spinner throws that away; a skeleton built from the same plan the payload
 *  will render through shows the user the shape of what is coming, and the content lands INTO its own
 *  outline instead of shoving the pane down.
 *
 *  RE-RUN → the previous payload stays, dimmed under a shimmer. The surface's founding law is that the
 *  pane never goes blank between stages, and replacing a settled result with a skeleton would break it
 *  in the one place it matters most (comparing a re-run against what you had). */
function PlanSkeleton({ plan }: { plan: RenderPlan }): ReactElement {
  const { banners, hero, rest } = fieldOrder(plan.fields);
  return (
    <Stack aria-busy={true} data-testid={testId("refineryPayloadSkeleton")} gap="block">
      {banners.map((field) => (
        <Skeleton className="h-control-lg w-full" key={field.key} />
      ))}
      {hero === null ? null : <Skeleton className="h-avatar-hero w-full" />}
      {rest.map((field) => (
        <Skeleton className="h-control-md w-full" key={field.key} />
      ))}
    </Stack>
  );
}

export function PayloadView({ plan, payload, pending = false, arrived = false }: PayloadViewProps): ReactElement {
  const { banners, hero, heroProse, rest } = fieldOrder(plan.fields);
  const settled = Object.keys(payload).length > 0;
  // Did this view show the plan-shaped skeleton before the payload landed? Then the payload ARRIVED and
  // the hero counts up from 0 (`useCountUp`'s `arrived`). This is React's own adjusting-state-during-
  // render pattern, NOT an effect: an effect here would be a cascading render (react-hooks/
  // set-state-in-effect), and a ref written during render is banned outright. It latches ON once — after
  // a user has watched this pane wait, the number that fills it is an answer, not furniture.
  const [awaited, setAwaited] = useState(false);
  if (pending && !settled && !awaited) {
    setAwaited(true);
  }
  if (pending && !settled) {
    return <PlanSkeleton plan={plan} />;
  }
  return (
    <Stack
      aria-busy={pending}
      // The re-run arm: the settled payload recedes rather than vanishing. Compositor-only (`opacity`)
      // and reduced-motion-safe by construction — the globals.css duration floor neutralizes the
      // transition, and a static 60% dim is a legitimate resting state, not a frozen animation frame.
      className={pending ? "opacity-60 transition-opacity duration-(--motion-base) ease-out-expo" : "transition-opacity duration-(--motion-base) ease-out-expo"}
      data-pending={pending}
      data-testid={testId("refineryPayloadView")}
      gap="block"
    >
      {banners.map((field) => (
        <VerdictBanner field={field} key={field.key} payload={payload} siblings={plan.fields} />
      ))}
      {/* Two arrival signals, either suffices: `awaited` (this view showed its own skeleton — the CT-storied
          path) or `arrived` (the surface vouches the run landed under the user — the REAL first-run path,
          where the skeleton was `RunningPane`'s and this view never pended). */}
      {hero !== null ? <HeroGauge arrived={arrived ? true : awaited} field={hero} payload={payload} prose={heroProse} /> : null}
      {rest.map((field) => (
        <FieldBlock field={field} key={field.key} value={payload[field.key]} />
      ))}
    </Stack>
  );
}

/** The verdict banner (§3.3): the enum WORD is primary; the authored tone map is the tint; an
 *  `axis`-hinted bounded number (soul) docks as the side pill; the first prose sibling is the banner
 *  body. A hintless enum never reaches this — it renders as a neutral chip in `FieldBlock`. */
/** The banner's tone TINT (word-primary: the enum member is the signal, the tint is secondary — but the
 *  mock's banner IS tinted, so the tone must paint, not just ride a data attribute). */
const BANNER_TONE_CLASSES: Record<string, string> = {
  good: "border-success/40 bg-success/10",
  warn: "border-warning/40 bg-warning/10",
  bad: "border-destructive/40 bg-destructive/10",
  info: "border-info/40 bg-info/10",
  neutral: "",
};

function VerdictBanner({ field, payload, siblings }: { field: PlanField; payload: Record<string, unknown>; siblings: readonly PlanField[] }): ReactElement {
  const widget = field.widget as ChipEnumWidget;
  const value = typeof payload[field.key] === "string" ? (payload[field.key] as string) : null;
  const tone = value === null ? "neutral" : (widget.tones[value] ?? "neutral");
  const axis = siblings.find((f) => f.widget.kind === "gauge" && !f.widget.hero && f !== field);
  const prose = siblings.find((f) => f.widget.kind === "prose");
  const axisValue = axis !== undefined && typeof payload[axis.key] === "number" ? (payload[axis.key] as number) : null;
  const axisWidget = axis?.widget as GaugeWidget | undefined;
  return (
    <Card className={BANNER_TONE_CLASSES[tone] ?? ""} data-testid={testId("refineryVerdictBanner")} data-tone={tone}>
      <Row align="center" gap="block" padding="block">
        <Stack gap="field">
          <Heading level={3}>{value ?? ABSENT_TEXT}</Heading>
          {prose !== undefined ? <Text prose={true}>{scalarText(payload[prose.key])}</Text> : null}
        </Stack>
        {axis !== undefined && axisWidget !== undefined ? (
          <Row align="center" gap="field">
            <Stack align="center" gap="tight">
              <Text voice="datum">{axisValue === null ? ABSENT_TEXT : `${axisValue}/${axisWidget.max}`}</Text>
              <Text voice="kicker">{axis.label}</Text>
            </Stack>
          </Row>
        ) : null}
      </Row>
    </Card>
  );
}

/** The hero gauge (§3.2's structural elevation): the printed numeral is the signal, the meter fill is
 *  the tint, and the docked prose is the payload's own summary. Scale = the schema's OWN bounds.
 *
 *  SIZE AND ANATOMY (side-eye 2026-08-09 P1-13). The numeral was `voice="datum"` — 13px mono, the same
 *  step as every other value on the surface — for the ONE number the whole run exists to produce, and
 *  the null arm returned `null` for the meter, collapsing the card's anatomy against this file's own
 *  "empty values are LOAD-BEARING designed states, never collapses" header. Now: a display-size numeral
 *  (`size="display"`, the rare hero moment the type scale reserves), and the Meter shape ALWAYS renders
 *  — at `min` with no value, which is the honest drawing of "this has not been scored yet" and keeps
 *  the card the same height before and after a run (so a settling score never shifts the pane). */
function HeroGauge({
  field,
  payload,
  prose,
  arrived,
}: {
  field: PlanField;
  payload: Record<string, unknown>;
  prose: PlanField | null;
  /** This pane showed a skeleton before this payload landed — so the figure counts up (`useCountUp`). */
  arrived: boolean;
}): ReactElement {
  const widget = field.widget as GaugeWidget;
  const value = typeof payload[field.key] === "number" ? (payload[field.key] as number) : null;
  const shown = useCountUp(value, arrived);
  return (
    <Card data-testid={testId("refineryHeroGauge")}>
      <Row align="center" gap="block" padding="block">
        <Stack align="center" gap="tight">
          <Row align="baseline" gap="tight">
            <Text as="span" data-testid={testId("refineryHeroValue")} voice="hero">
              {value === null ? ABSENT_TEXT : String(shown)}
            </Text>
            <Text as="span" voice="gloss">
              /{widget.max}
            </Text>
          </Row>
          <Text voice="kicker">{field.label}</Text>
        </Stack>
        <Stack className="min-w-0 flex-1" gap="field">
          <Meter kind="linear" label={field.label} max={widget.max} min={widget.min} value={value === null ? widget.min : shown} />
          {prose !== null ? <Text prose={true}>{scalarText(payload[prose.key])}</Text> : null}
        </Stack>
      </Row>
    </Card>
  );
}

/** One non-hero field — the total widget dispatch over the value (each arm is its own small renderer;
 *  the dispatch itself stays a flat total switch). */
function FieldBlock({ field, value }: { field: PlanField; value: unknown }): ReactElement {
  const widget = field.widget;
  switch (widget.kind) {
    case "gauge":
      return <GaugeRow field={field} value={value} widget={widget} />;
    case "stat":
    case "const":
    case "boolean":
    case "text":
      return <ScalarRow field={field} value={value} />;
    case "chip-enum":
      return <ChipRow field={field} value={value} widget={widget} />;
    case "prose":
      return <ProseBlock field={field} value={value} />;
    case "bullets":
      return <BulletsBlock field={field} value={value} />;
    case "number-list":
      return <NumberListRow field={field} value={value} />;
    case "rows":
      return <RowsBlock field={field} row={widget.row} value={value} />;
    case "section":
      return <SectionBlock field={field} value={value} widget={widget} />;
    case "union":
      return <UnionBlock field={field} value={value} widget={widget} />;
    default: {
      const never: never = widget;
      throw new Error(`unreachable widget: ${String(never)}`);
    }
  }
}

function GaugeRow({ field, widget, value }: { field: PlanField; widget: GaugeWidget; value: unknown }): ReactElement {
  const n = typeof value === "number" ? value : null;
  return (
    <Row align="center" data-field={field.key} data-testid={testId("refineryField")} gap="row">
      <Text voice="label">{field.label}</Text>
      <Row align="center" gap="field">
        {n === null ? (
          <Text voice="gloss">{ABSENT_TEXT}</Text>
        ) : (
          <Meter kind="linear" label={field.label} max={widget.max} min={widget.min} showValue={true} value={n} />
        )}
      </Row>
    </Row>
  );
}

function ScalarRow({ field, value }: { field: PlanField; value: unknown }): ReactElement {
  return (
    <Row align="center" data-field={field.key} data-testid={testId("refineryField")} gap="row">
      <Text voice="label">{field.label}</Text>
      <Text voice="datum">{scalarText(value)}</Text>
    </Row>
  );
}

function ChipRow({ field, widget, value }: { field: PlanField; widget: ChipEnumWidget; value: unknown }): ReactElement {
  const v = typeof value === "string" ? value : null;
  return (
    <Row align="center" data-field={field.key} data-testid={testId("refineryField")} gap="row">
      <Text voice="label">{field.label}</Text>
      {v === null ? <Text voice="gloss">{ABSENT_TEXT}</Text> : <RefineryChip tone={widget.tones[v] ?? "neutral"}>{v}</RefineryChip>}
    </Row>
  );
}

function ProseBlock({ field, value }: { field: PlanField; value: unknown }): ReactElement {
  return (
    <Stack data-field={field.key} data-testid={testId("refineryField")} gap="tight">
      <Text voice="kicker">{field.label}</Text>
      <Text prose={true}>{scalarText(value)}</Text>
    </Stack>
  );
}

function BulletsBlock({ field, value }: { field: PlanField; value: unknown }): ReactElement {
  const items = Array.isArray(value) ? value : [];
  return (
    <Stack data-field={field.key} data-testid={testId("refineryField")} gap="tight">
      <Text voice="kicker">{field.label}</Text>
      {items.length === 0 ? (
        <Text voice="gloss">{NONE_LISTED}</Text>
      ) : (
        <Stack gap="tight" role="list">
          {items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a read-only payload list never reorders.
            <Row align="start" gap="field" key={i} role="listitem">
              <Text voice="gloss">•</Text>
              <Text>{scalarText(item)}</Text>
            </Row>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function NumberListRow({ field, value }: { field: PlanField; value: unknown }): ReactElement {
  const items = Array.isArray(value) ? value : [];
  return (
    <Row align="center" data-field={field.key} data-testid={testId("refineryField")} gap="row">
      <Text voice="label">{field.label}</Text>
      <Text voice="datum">{items.length === 0 ? NONE_LISTED : items.map(scalarText).join(" · ")}</Text>
    </Row>
  );
}

function SectionBlock({ field, widget, value }: { field: PlanField; widget: SectionWidget; value: unknown }): ReactElement {
  const record = isRecord(value) ? value : {};
  return (
    <Card data-field={field.key} data-testid={testId("refineryField")}>
      <Stack gap="row" padding="block">
        <Text voice="kicker">{field.label}</Text>
        {widget.fields.map((child) => (
          <FieldBlock field={child} key={child.key} value={record[child.key]} />
        ))}
      </Stack>
    </Card>
  );
}

/** Presentation dispatch: the FIRST arm whose broad shape fits renders the value (the lifted zod already
 *  discriminated at the parse seam — `armFits` never validates, only picks a dress). */
function UnionBlock({ field, widget, value }: { field: PlanField; widget: UnionWidget; value: unknown }): ReactElement {
  const arm = widget.arms.find((a) => armFits(a, value)) ?? widget.arms[0];
  return arm === undefined ? <Text voice="gloss">{ABSENT_TEXT}</Text> : <FieldBlock field={{ ...field, widget: arm }} value={value} />;
}

/** The assay rows (§3.2's `array<object>` arm): a fixed per-schema row anatomy — header chips, the
 *  bounded-number score bar, and the accordion body (FORK A: one open at a time). */
function RowsBlock({ field, row, value }: { field: PlanField; row: RowPlan; value: unknown }): ReactElement {
  const items = Array.isArray(value) ? value.filter(isRecord) : [];
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <Stack data-field={field.key} data-testid={testId("refineryField")} gap="tight">
      <Row align="center" gap="row">
        <Text voice="kicker">{field.label}</Text>
        <Text voice="gloss">{items.length === 0 ? NONE_LISTED : `${items.length} entries`}</Text>
      </Row>
      {items.map((item, i) => {
        const scoreWidget = row.score?.widget as GaugeWidget | undefined;
        const scoreValue = row.score !== null && typeof item[row.score.key] === "number" ? (item[row.score.key] as number) : null;
        const open = openIndex === i;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: a read-only payload list never reorders.
          <Card key={i}>
            <Stack gap="field" padding="row">
              <Button
                aria-expanded={open}
                className="justify-start"
                data-testid={testId("refineryAssayRow")}
                intent="ghost"
                onClick={(): void => setOpenIndex(open ? null : i)}
                size="sm"
              >
                <Row align="center" gap="row">
                  {row.header.map((h) => (
                    <Text as="span" key={h.key} voice={h === row.header[0] ? "label" : "gloss"}>
                      {scalarText(item[h.key])}
                    </Text>
                  ))}
                  {scoreValue !== null && scoreWidget !== undefined ? (
                    <Text as="span" voice="datum">
                      {scoreValue}
                    </Text>
                  ) : null}
                </Row>
              </Button>
              {scoreValue !== null && scoreWidget !== undefined && row.score !== null ? (
                <Meter
                  dangerBelow={scoreWidget.min + (scoreWidget.max - scoreWidget.min) / 2}
                  kind="linear"
                  label={row.score.label}
                  max={scoreWidget.max}
                  min={scoreWidget.min}
                  value={scoreValue}
                />
              ) : null}
              {open ? row.body.map((b) => <FieldBlock field={b} key={b.key} value={item[b.key]} />) : null}
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}

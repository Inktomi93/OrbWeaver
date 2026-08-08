// The CONTEXT readout's shared PARTS (preset-surface-redesign.md §7). Every panel is built from the same
// three atoms so six panels read as one instrument rather than six drawings:
//
//   DatumRow   — `label · value ⟨provenance⟩`, the mock's `.drow`: label voice left, datum voice right.
//   EffectiveProfile — the §4.3 resolver's rows, the readout's spine (the no-selection panel and the
//                Params panel are the SAME projection pointed at different presets — stated, not hidden).
//   CapabilityCard   — model · window · output cap · the honored-knob list: WHY a knob is absent or clamps.
//
// READ-ONLY BY CONSTRUCTION (§16 invariant i): nothing here takes a mutation callback. The only
// interactions the whole readout carries are the sanctioned SELECTION echoes, and those live on the
// panels that own a list.

import type { ModelCapability } from "@orb/contracts/connection";
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { SkeletonRows } from "#data";
import type { EffectiveProfileRow } from "../../lib/effective-knobs.ts";
import { knobLabel, provenanceSuffix, resolvedForLabel } from "../../lib/effective-knobs.ts";
import { formatCount } from "../../lib/format-count.ts";

/** ONE number format across the whole readout (side-eye F-29): a cluster printed `1,500` beside `8192`
 *  because two producers formatted independently. EVERY integer groups (`2048` → `2,048`) — this comment
 *  used to claim a `≥ 10 000` threshold that `formatCount` has never had, and a CT written to the prose
 *  rather than the code found it. A fraction prints as authored (a temperature is not a magnitude you
 *  group); a non-number passes through untouched. */
function formatKnobValue(value: number | string | undefined): string {
  if (typeof value !== "number") {
    return String(value);
  }
  return formatCount(value);
}

export interface DatumRowProps {
  readonly label: string;
  readonly value: string;
  /** The terse rung/source suffix, quieter than the value (`2048 default`). */
  readonly suffix?: string | null;
}

export function DatumRow({ label, value, suffix }: DatumRowProps): ReactElement {
  return (
    <Row align="baseline" gap="row" justify="between">
      <Text voice="label">{label}</Text>
      <Row align="baseline" gap="field">
        <Text voice="datum">{value}</Text>
        {suffix === undefined || suffix === null ? null : <Text voice="gloss">{suffix}</Text>}
      </Row>
    </Row>
  );
}

/** One placeholder bar per row the settled profile will fill (the funnel's knobs + the window row) — enough
 *  to hold the panel's height so the readout does not jump when the resolve lands. */
const PENDING_ROWS = 4;

/** The resolved generation profile — the funnel's OWN output (§4.3), never a client re-derivation.
 *
 *  PENDING IS NOT AN EMPTY STATE (the F-02 class, applied here 2026-08-07 — the same fix `CapabilityGate`
 *  took). `preset.resolveEffective` returns a REQUIRED `EffectivePreset` and resolves against whatever chat
 *  model the caller has, THROWING when routing is broken — so an absent profile is a read that has not
 *  LANDED or one that FAILED, and there is no settled "you have no chat model" arm for this component to
 *  render. It used to print "Connect a chat model in Connections…" on every absent read, which meant every
 *  open of the CONTEXT panel flashed that line at users who have one connected, and on a routing failure it
 *  stood there permanently naming the wrong cause. The two REACHABLE arms are now rendered as themselves: a
 *  shape-matched skeleton that asserts nothing while `error === null`, and the server's own message when the
 *  read has failed — named as the routing problem it is, exactly as the deck's gate names it. */
export function EffectiveProfile({
  effective,
  error,
  contextWindow,
}: {
  readonly effective: EffectiveProfileRow | undefined;
  /** The resolve's own failure message — `null` while the read is still PENDING. With `effective`
   *  undefined those two are exhaustive (see above); a settled-successful read always carries a profile. */
  readonly error: string | null;
  /** The model's context window — the ONE row the funnel deliberately does not resolve (`maxContextTokens`
   *  is our history soft-cap, not a wire knob), and which the mock nonetheless prints because it IS part of
   *  what the next turn will do. It came from the capability read, exactly as the deck's own ghost does
   *  (side-eye F-13: the value existed and had no row). */
  readonly contextWindow?: number | undefined;
}): ReactElement {
  if (effective === undefined) {
    return (
      <Section kicker="Effective generation">
        {error === null ? (
          // The ONE placeholder-row home (`SkeletonRows`) — never a hand-assembled stack of `Skeleton`s and
          // never a spinner flash (UIP-309). It carries its own `aria-busy`.
          <SkeletonRows count={PENDING_ROWS} />
        ) : (
          <Row align="start" className="rounded-base border border-warning bg-warning/10 text-warning" gap="field" padding="row">
            <Icon icon={AlertTriangle} size="sm" />
            <Stack gap="tight">
              <Text prose={true} voice="label">
                Your chat model couldn't be resolved, so what the next turn will send can't be shown.
              </Text>
              <Text prose={true} voice="gloss">
                {error}
              </Text>
              <Text prose={true} voice="gloss">
                This is a routing problem, not a missing connection — fix it under Settings → Connections → Model roles.
              </Text>
            </Stack>
          </Row>
        )}
      </Section>
    );
  }
  const rows = Object.entries(effective.knobs).filter(([, reading]) => reading !== undefined);
  return (
    <Section kicker="Effective generation">
      {rows.length === 0 && contextWindow === undefined ? (
        <Text voice="gloss">This model resolves no generation knobs — it takes the prompt and nothing else.</Text>
      ) : (
        <Stack gap="tight">
          {/* DISPLAY names, never the schema key (side-eye F-13): the read is keyed by `maxOutputTokens`,
              the reader wants "max output". */}
          {rows.map(([knob, reading]) => (
            <DatumRow
              key={knob}
              label={knobLabel(knob)}
              suffix={reading === undefined ? null : provenanceSuffix(reading.provenance)}
              value={formatKnobValue(reading?.value)}
            />
          ))}
          {contextWindow === undefined ? null : <DatumRow label={knobLabel("maxContextTokens")} suffix="window" value={formatKnobValue(contextWindow)} />}
        </Stack>
      )}
      <Text voice="gloss">
        {resolvedForLabel(effective.model)} · chat role
        {effective.stale.length === 0
          ? ""
          : ` · ${String(effective.stale.length)} stored knob${effective.stale.length === 1 ? "" : "s"} this model ignores — clear them in the deck`}
      </Text>
    </Section>
  );
}

/** WHY a knob is absent, and what the window costs you — the two questions the deck itself cannot answer
 *  (an absent knob renders as nothing, which is correct doctrine and mute). The MODEL name comes from the
 *  effective read, not the descriptor: `ModelCapability` is keyed by `(model, backend)` and deliberately
 *  names neither. */
export function CapabilityCard({
  capability,
  model,
}: {
  readonly capability: ModelCapability | undefined;
  readonly model: string | undefined;
}): ReactElement | null {
  if (capability === undefined) {
    return null;
  }
  const honored = Object.keys(capability.sampling).map((knob) => knobLabel(knob));
  return (
    <Section kicker="Capability">
      <Stack gap="tight">
        {model === undefined ? null : <DatumRow label="model" value={model} />}
        <DatumRow
          label="context window"
          suffix={capability.context.windowEstimated === true ? "estimated" : null}
          value={formatKnobValue(capability.context.window)}
        />
        <DatumRow label="output cap" value={formatKnobValue(capability.output.maxTokens.max)} />
      </Stack>
      <Text voice="gloss">
        {honored.length === 0 ? "This model honors no sampling knobs — that is why the deck shows none." : `honors ${honored.join(" · ")}`}
      </Text>
    </Section>
  );
}

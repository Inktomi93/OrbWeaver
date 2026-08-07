// The Preview tab's DIAGNOSTICS drawer — the deeper BUILD + SHAPE traces, collapsed beneath the budget
// instrument (`assembly-preview-panel.tsx`, its only consumer). Split out at the 450-line component cap: the
// budget/rows half answers "where did my context go", THIS half answers "why did assembly do that" — the
// per-field provenance (`AssembleTrace.overrideSources`), which sections fired, which world-info entries
// activated, the content-free SHAPE projection (`ShapeTrace`, PD-132: row counts + the §8 cache-breakpoint
// decision, no content bytes by construction), and the DELIVERED WIRE ROWS in order (see {@link WireRows} —
// the block-order/role/voice readout that closes RPG-NO-PROMPT-DEBUG).
//
// Host-only by inheritance: it renders data from the two `requireHost` reads the panel already made.

import type { AssembleTrace, ShapeBreakpointDecision, ShapeRowSource, ShapeTrace, ShapeTraceRow } from "@orb/contracts/chat";
import { Badge } from "@orb/ui/badge";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

/** The instrument's section voice (the mock's `.kicker`): micro-caps, muted — a panel-width heading, never the
 *  `Section` default title size, which at the 17rem floor shouts louder than the data it labels. */
function Kicker({ children }: { readonly children: ReactNode }): ReactElement {
  return <Text voice="kicker">{children}</Text>;
}

export function AssemblyPreviewDiagnostics({
  trace,
  shapeTrace,
  injections,
}: {
  readonly trace: AssembleTrace;
  readonly shapeTrace: ShapeTrace;
  readonly injections: readonly { readonly role: string; readonly depth: number; readonly content: string }[];
}): ReactElement {
  return (
    <Collapsible>
      <CollapsibleTrigger className="w-full">
        <Text voice="label">Diagnostics</Text>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <Stack gap="section">
          <OverrideSources sources={trace.overrideSources} />
          {injections.length > 0 ? (
            <Section heading={<Kicker>{`In-history injections (${injections.length})`}</Kicker>}>
              <Stack gap="row">
                {injections.map((injection, index) => (
                  <Text
                    voice="datum"
                    // The afterHistory entries are positional + contentful, with no stable id on the wire;
                    // the index is the stable key within one immutable preview render.
                    // biome-ignore lint/suspicious/noArrayIndexKey: afterHistory entries are positional + id-less; the index is stable within one immutable preview render.
                    key={index}
                    className="whitespace-pre-wrap"
                  >
                    [{injection.role} @ depth {injection.depth}] {injection.content}
                  </Text>
                ))}
              </Stack>
            </Section>
          ) : null}
          <TraceSummary trace={trace} />
          <WorldInfoActivated activated={trace.worldInfoActivated} />
          <ShapeTraceSummary trace={shapeTrace} />
          <WireRows rows={shapeTrace.rows} />
        </Stack>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/** The resolved source of each room-overrideable field ("room override" / "from <Name>" / "merged"). */
function OverrideSources({ sources }: { readonly sources: AssembleTrace["overrideSources"] }): ReactElement | null {
  if (sources === undefined) {
    return null;
  }
  const rows: readonly { readonly label: string; readonly source: string | undefined }[] = [
    { label: "Main prompt", source: sources.mainPrompt },
    { label: "Post-history", source: sources.postHistory },
    { label: "Scenario", source: sources.scenario },
    { label: "Author's note", source: sources.authorsNote },
  ];
  const present = rows.filter((row) => row.source !== undefined);
  if (present.length === 0) {
    return null;
  }
  return (
    <Section heading={<Kicker>Where each value came from</Kicker>}>
      <Stack gap="field">
        {present.map((row) => (
          <Row key={row.label} gap="block" justify="between" align="center">
            <Text voice="label">{row.label}</Text>
            <Text voice="datum">{row.source}</Text>
          </Row>
        ))}
      </Stack>
    </Section>
  );
}

/** The content-free trace: which sections fired, world-info in/out, and the boolean flags as badges. */
function TraceSummary({ trace }: { readonly trace: AssembleTrace }): ReactElement {
  const flags: readonly { readonly label: string; readonly on: boolean }[] = [
    { label: "Compact summary", on: trace.compactSummaryIncluded },
    { label: "Memory", on: trace.memoryIncluded },
    { label: "Guided instruction", on: trace.guidedInstructionIncluded },
  ];
  const activeFlags = flags.filter((flag) => flag.on);

  return (
    <Section heading={<Kicker>Trace</Kicker>}>
      <Stack gap="field">
        <TraceLine label="Static sections" value={sectionList(trace.staticSections)} />
        <TraceLine label="Dynamic sections" value={sectionList(trace.dynamicSections)} />
        <TraceLine label="World info" value={`${trace.worldInfoIncluded} included, ${trace.worldInfoDropped.length} dropped`} />
        <TraceLine label="Injections" value={String(trace.chatInjectionsIncluded)} />
        {trace.matchedKeys.length > 0 ? <TraceLine label="Matched keys" value={trace.matchedKeys.map((match) => match.key).join(", ")} /> : null}
        {trace.staticCacheBusters.length > 0 ? <TraceLine label="Cache busters" value={trace.staticCacheBusters.join(", ")} /> : null}
        {activeFlags.length > 0 ? (
          <Row gap="field" align="center">
            {activeFlags.map((flag) => (
              <Badge key={flag.label} intent="info">
                {flag.label}
              </Badge>
            ))}
          </Row>
        ) : null}
      </Stack>
    </Section>
  );
}

/** The WI entries that actually FIRED into this turn's prompt (budget-survived), by identity — each row is the
 *  entry id + its keyword list (keys empty ⇒ an always-scope entry). Distinct from the `matchedKeys` line on
 *  the Trace section (keyword strings, not entry identity). Empty ⇒ a one-line explanation, never a blank. */
function WorldInfoActivated({ activated }: { readonly activated: AssembleTrace["worldInfoActivated"] }): ReactElement {
  return (
    <Section heading={<Kicker>{`World info — ${activated.length} activated`}</Kicker>}>
      {activated.length === 0 ? (
        <Text>No world-info entries activated.</Text>
      ) : (
        <Stack gap="field">
          {activated.map((entry) => (
            <Row key={entry.id} gap="block" justify="between" align="center">
              <Text voice="datum">{entry.id}</Text>
              <Text voice="gloss">{entry.keys.length === 0 ? "always" : entry.keys.join(", ")}</Text>
            </Row>
          ))}
        </Stack>
      )}
    </Section>
  );
}

/** A human label for each content-free SHAPE cache-breakpoint outcome (`ShapeTrace.breakpointDecision`). */
const BREAKPOINT_LABELS: Record<ShapeBreakpointDecision, string> = {
  placed: "Placed",
  "no-stable-prefix": "No stable prefix",
  "in-prefix-injection-or-squash": "Prefix injection / squash",
  "second-volatile-tail": "Second volatile tail",
};

/** The content-free SHAPE trace (PD-132): how the canon shaped into the wire history — per-stage row counts,
 *  the adjacent same-role merges the squash performed, and why the §8 cache breakpoint did/didn't land. No
 *  content by construction (the server projection carries only counts + the decision). */
function ShapeTraceSummary({ trace }: { readonly trace: ShapeTrace }): ReactElement {
  const { withTail, injected, squashed, named } = trace.stageCounts;
  const breakpoint =
    trace.cacheBreakpointFromEnd === undefined
      ? BREAKPOINT_LABELS[trace.breakpointDecision]
      : `${BREAKPOINT_LABELS[trace.breakpointDecision]} (offset ${trace.cacheBreakpointFromEnd} from end)`;
  return (
    <Section heading={<Kicker>Shape (wire history)</Kicker>}>
      <Stack gap="field">
        <Text voice="gloss">How the canon shaped into the next turn's wire history — row counts only, no content.</Text>
        <TraceLine label="Stages (tail → inject → squash → name)" value={`${withTail} → ${injected} → ${squashed} → ${named}`} />
        <TraceLine label="Same-role merges" value={String(trace.squashMerges)} />
        <TraceLine label="Cache breakpoint" value={breakpoint} />
        {trace.multiCharacter ? (
          <Row gap="field" align="center">
            <Badge intent="info">Multi-character</Badge>
          </Row>
        ) : null}
      </Stack>
    </Section>
  );
}

/** The human label per provenance arm (`ShapeRowSource`) — a mapped-type Record, so a widened axis fails
 *  `tsc` here (§5.5). Every arm is stated positively: "canon" is a claim, not the absence of a badge. */
const ROW_SOURCE_LABEL: Record<ShapeRowSource, string> = {
  canon: "canon",
  assembled: "assembled",
  merged: "merged",
};

/**
 * The DELIVERED WIRE ROWS, in order — RPG-NO-PROMPT-DEBUG's answer. Every other readout on this tab answers
 * "how much" or "what fired"; this one answers "in what ORDER, and in whose VOICE", which a host previously
 * reconstructed by hand from wire captures because the shape trace projected stage COUNTS only.
 *
 * It is also the lens on the INJECT-NAMED-AS-PLAYER class: a steering block that reaches the model as
 * `role: user` under the player's own name shows up here as a `user` row carrying the player's name with an
 * `injected` (or `merged`) provenance — a fact no count could ever carry, and the exact thing that made that
 * defect survive live play.
 *
 * Content-free, like the trace it reads: roles, speaker labels, provenance and a character COUNT — never the
 * bytes (those ride the attributed source rows on the tab above, under the same host gate).
 */
function WireRows({ rows }: { readonly rows: readonly ShapeTraceRow[] }): ReactElement {
  return (
    <Section heading={<Kicker>{`Wire rows — ${rows.length} delivered`}</Kicker>}>
      {rows.length === 0 ? (
        <Text>This turn delivers no history rows.</Text>
      ) : (
        <Stack gap="field">
          <Text voice="gloss">The order the model receives, before the context fit trims the oldest turns. Roles and speakers only — no content.</Text>
          {/* A long chat delivers a long list: the drawer scrolls it rather than pushing the rest of the
              diagnostics off the panel (the game-state excerpt's precedent on the tab above). */}
          <Stack className="max-h-64 overflow-y-auto" gap="row">
            {numberWireRows(rows).map((row) => (
              <WireRowLine key={row.ordinal} row={row} />
            ))}
          </Stack>
        </Stack>
      )}
    </Section>
  );
}

/** A delivered row plus its 1-based POSITION in the wire history. The ordinal is the row's identity here —
 *  order IS what this readout is about, two rows can be identical in role/voice/size, and the trace is
 *  content-free so nothing else distinguishes them. Modelling it (rather than reaching for the map index at
 *  the JSX) makes it both the rendered datum and the React key, with no suppression in between. */
interface NumberedWireRow extends ShapeTraceRow {
  readonly ordinal: number;
}

function numberWireRows(rows: readonly ShapeTraceRow[]): readonly NumberedWireRow[] {
  return rows.map((row, index) => ({ ...row, ordinal: index + 1 }));
}

/** One delivered row: `<n>. <role> · <speaker>` leads (the stable identity, §13.10 N3) and the volatile
 *  provenance + size trail it. */
function WireRowLine({ row }: { readonly row: NumberedWireRow }): ReactElement {
  const voice = row.name === undefined ? row.role : `${row.role} · ${row.name}`;
  return (
    <Row align="baseline" data-slot="wire-row-trace" gap="block" justify="between">
      <Text voice="datum">{`${row.ordinal}. ${voice}`}</Text>
      <Text className="shrink-0" voice="gloss">{`${ROW_SOURCE_LABEL[row.source]} · ${formatChars(row.chars)} chars`}</Text>
    </Row>
  );
}

const THOUSANDS_RE = /\B(?=(\d{3})+(?!\d))/g;

/** Group a character count for display ("3037" → "3,037"). Hand-rolled for the same reason the sibling panel's
 *  copy is: `.toLocaleString()` is banned repo-wide (`no-raw-intl-time`). */
function formatChars(value: number): string {
  return String(value).replace(THOUSANDS_RE, ",");
}

function TraceLine({ label, value }: { readonly label: string; readonly value: ReactNode }): ReactElement {
  return (
    <Row gap="block" justify="between" align="start">
      <Text className="shrink-0" voice="label">
        {label}
      </Text>
      {/* A section list / key list can be long — wrap it inside the panel rather than overflow its edge. */}
      <Text className="min-w-0 text-end break-words" voice="datum">
        {value}
      </Text>
    </Row>
  );
}

function sectionList(sections: readonly string[]): string {
  return sections.length === 0 ? "—" : sections.join(", ");
}

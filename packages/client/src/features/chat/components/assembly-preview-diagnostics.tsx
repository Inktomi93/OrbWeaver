// The Preview tab's DIAGNOSTICS drawer — the deeper BUILD + SHAPE traces, collapsed beneath the budget
// instrument (`assembly-preview-panel.tsx`, its only consumer). Split out at the 450-line component cap: the
// budget/rows half answers "where did my context go", THIS half answers "why did assembly do that" — the
// per-field provenance (`AssembleTrace.overrideSources`), which sections fired, which world-info entries
// activated, the content-free SHAPE projection (`ShapeTrace`, PD-132: row counts + the §8 cache-breakpoint
// decision, no content bytes by construction), and the DELIVERED WIRE ROWS in order (see {@link WireRows} —
// the block-order/role/voice readout that closes RPG-NO-PROMPT-DEBUG).
//
// Host-only by inheritance: it renders data from the two `requireHost` reads the panel already made.

import type { AssembleTrace, ShapeBreakpointDecision, ShapeFoldReason, ShapeRowSource, ShapeTrace, ShapeTraceRow } from "@orb/contracts/chat";
import { groupThousands } from "@orb/kit/strings";
import { Badge } from "@orb/ui/badge";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { MemoryRecallDetail } from "./memory-recall-detail.tsx";

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
          <MemoryRecallDetail recall={trace.memoryRecall} />
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
    { label: "Databank", on: trace.databankIncluded },
    { label: "Guided instruction", on: trace.guidedInstructionIncluded },
  ];
  const activeFlags = flags.filter((flag) => flag.on);
  // Whose card prose the merged room-override fallback had to CUT to fit its cap — the fact that turns a bare
  // "merged (present characters)" source label into something a host can act on. Both fields fold into one
  // line, deduped: the same member is usually cut in both.
  const cut = trace.mergedFallbackTruncated;
  const truncatedContributors: readonly string[] = [...new Set([...(cut?.mainPrompt ?? []), ...(cut?.postHistory ?? [])])];

  return (
    <Section heading={<Kicker>Trace</Kicker>}>
      <Stack gap="field">
        <TraceLine label="Static sections" value={sectionList(trace.staticSections)} />
        <TraceLine label="Dynamic sections" value={sectionList(trace.dynamicSections)} />
        <TraceLine label="World info" value={`${trace.worldInfoIncluded} included, ${trace.worldInfoDropped.length} dropped`} />
        <TraceLine label="Injections" value={String(trace.chatInjectionsIncluded)} />
        {trace.matchedKeys.length > 0 ? <TraceLine label="Matched keys" value={trace.matchedKeys.map((match) => match.key).join(", ")} /> : null}
        {trace.staticCacheBusters.length > 0 ? <TraceLine label="Cache busters" value={trace.staticCacheBusters.join(", ")} /> : null}
        {truncatedContributors.length > 0 ? <TraceLine label="Merged fallback cut" value={truncatedContributors.join(", ")} /> : null}
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
        {/* `prose` (variants.ts §the reading-length modifier): these two drawer glosses are SENTENCES, and
            the bare `gloss` step sets them at 10.5px on tight leading — the wall that modifier exists for.
            First consumer in features/chat (side-eye 2026-08-06 P3). */}
        <Text prose={true} voice="gloss">
          How the canon shaped into the next turn's wire history — row counts only, no content.
        </Text>
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

/** Does this arm wear a BADGE? (side-eye 2026-08-06 P2 — the anomalous row had no more visual weight than
 *  the twenty ordinary ones around it, in the readout whose entire job is to make the odd row findable.)
 *  `canon` is the expected arm and stays quiet type; the two arms that mean "assembly did something to this
 *  row" get the `Badge intent="info"` weight `ShapeTraceSummary` already uses for a noteworthy shape fact.
 *  A mapped-type Record, so a widened axis fails `tsc` here too. */
const ROW_SOURCE_BADGED: Record<ShapeRowSource, boolean> = {
  canon: false,
  assembled: true,
  merged: true,
};

/** Why a system note reached the model as user text, one clause per `ShapeFoldReason` — a mapped-type Record,
 *  so a widened axis fails `tsc` here. */
const FOLD_REASON_LABEL: Record<ShapeFoldReason, string> = {
  level: "system note folded: the message-handling level folds them",
  slot: "system note folded: no legal slot for a system message here",
  tail: "system note folded: the model takes no trailing system message",
  "mid-array": "system note folded: the model takes no system message mid-history",
};

/** The provenance VOCABULARY, defined where it is read. Three bare words in a trailing gloss ("canon",
 *  "assembled", "merged") are unreadable to anyone who has not read `SHAPE_ROW_SOURCES`' doc comment —
 *  which is everyone using the panel. Kept to one clause each; the contract carries the full definition. */
const ROW_SOURCE_GLOSS = "canon = a stored message · assembled = built for this turn and stored nowhere · merged = adjacent same-role rows squashed into one";

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
          <Text prose={true} voice="gloss">
            The order the model receives, before the context fit trims the oldest turns. Roles and speakers only — no content.
          </Text>
          <Text prose={true} voice="gloss">
            {ROW_SOURCE_GLOSS}
          </Text>
          {/* NO INNER SCROLLER (side-eye 2026-08-06 P2). It used to cap at `max-h-64`, which showed 7 of 24
              rows with no scrollbar, no fade and no count — the tail was undiscoverable, in the readout whose
              entire subject is the ORDER of the whole list. The cap existed to stop a long list pushing the
              rest of the diagnostics off the panel; this is the LAST section of the drawer, so there is
              nothing below it to push, and the drawer already lives inside the panel's own scroller.
              A real LIST, not 24 loose paragraphs: `role="list"`/`role="listitem"` is what makes a screen
              reader say "list, 24 items … 1 of 24" instead of reading an unbounded run of text (the ordinal
              is on screen for the same reason, for sighted readers). Roles rather than a raw `<ol>`, because
              a feature composes @orb/ui primitives and never paints a raw intrinsic. */}
          <Stack gap="row" role="list">
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
  // The row's DECLARED purpose (D129) rides in the IDENTITY half of the line, beside role and voice — it is
  // the third axis of "what is this row", and the one that explains a row the other two make look anomalous
  // (a narrator row carries no speaker label, and an unlabelled assistant row is otherwise indistinguishable
  // from a bug). Omitted for `standard` — the default is not information — and absent entirely on an
  // `assembled` row, which has no slot to declare anything.
  const purpose = row.kind === undefined || row.kind === "standard" ? "" : ` · ${row.kind}`;
  const voice = row.name === undefined ? `${row.role}${purpose}` : `${row.role} · ${row.name}${purpose}`;
  return (
    <Row align="baseline" data-slot="wire-row-trace" gap="block" justify="between" role="listitem">
      <Stack gap="row">
        <Text voice="datum">{`${row.ordinal}. ${voice}`}</Text>
        {row.folded === undefined ? null : <Text voice="gloss">{FOLD_REASON_LABEL[row.folded]}</Text>}
      </Stack>
      <Row align="baseline" className="shrink-0" gap="field">
        {ROW_SOURCE_BADGED[row.source] ? (
          <Badge intent="info" size="sm">
            {ROW_SOURCE_LABEL[row.source]}
          </Badge>
        ) : (
          <Text voice="gloss">{ROW_SOURCE_LABEL[row.source]}</Text>
        )}
        <Text voice="gloss">{`${groupThousands(row.chars)} chars`}</Text>
      </Row>
    </Row>
  );
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

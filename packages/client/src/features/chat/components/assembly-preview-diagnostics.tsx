// The Preview tab's DIAGNOSTICS drawer — the deeper BUILD + SHAPE traces, collapsed beneath the budget
// instrument (`assembly-preview-panel.tsx`, its only consumer). Split out at the 450-line component cap: the
// budget/rows half answers "where did my context go", THIS half answers "why did assembly do that" — the
// per-field provenance (`AssembleTrace.overrideSources`), which sections fired, which world-info entries
// activated, and the content-free SHAPE projection (`ShapeTrace`, PD-132: row counts + the §8 cache-breakpoint
// decision, no content bytes by construction).
//
// Host-only by inheritance: it renders data from the two `requireHost` reads the panel already made.

import type { AssembleTrace, ShapeBreakpointDecision, ShapeTrace } from "@orb/contracts/chat";
import { Badge } from "@orb/ui/badge";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

/** The instrument's section voice (the mock's `.kicker`): micro-caps, muted — a panel-width heading, never the
 *  `Section` default title size, which at the 17rem floor shouts louder than the data it labels. */
function Kicker({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <Text size="micro" tone="muted" transform="caps" weight="semibold">
      {children}
    </Text>
  );
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
        <Text size="label" tone="muted">
          Diagnostics
        </Text>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <Stack gap="section">
          <OverrideSources sources={trace.overrideSources} />
          {injections.length > 0 ? (
            <Section heading={<Kicker>{`In-history injections (${injections.length})`}</Kicker>}>
              <Stack gap="row">
                {injections.map((injection, index) => (
                  <Text
                    // The afterHistory entries are positional + contentful, with no stable id on the wire;
                    // the index is the stable key within one immutable preview render.
                    // biome-ignore lint/suspicious/noArrayIndexKey: afterHistory entries are positional + id-less; the index is stable within one immutable preview render.
                    key={index}
                    size="code"
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
            <Text size="label" tone="muted">
              {row.label}
            </Text>
            <Text size="label">{row.source}</Text>
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
        <Text tone="muted">No world-info entries activated.</Text>
      ) : (
        <Stack gap="field">
          {activated.map((entry) => (
            <Row key={entry.id} gap="block" justify="between" align="center">
              <Text size="label">{entry.id}</Text>
              <Text size="label" tone="muted">
                {entry.keys.length === 0 ? "always" : entry.keys.join(", ")}
              </Text>
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
        <Text size="micro" tone="muted">
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

function TraceLine({ label, value }: { readonly label: string; readonly value: ReactNode }): ReactElement {
  return (
    <Row gap="block" justify="between" align="start">
      <Text className="shrink-0" size="label" tone="muted">
        {label}
      </Text>
      {/* A section list / key list can be long — wrap it inside the panel rather than overflow its edge. */}
      <Text className="min-w-0 text-end break-words" size="label">
        {value}
      </Text>
    </Row>
  );
}

function sectionList(sections: readonly string[]): string {
  return sections.length === 0 ? "—" : sections.join(", ");
}

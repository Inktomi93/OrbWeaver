// The assembly preview (task #28; REBUILT to the panel-redesign mock under D-4) — the CONTEXT panel's Preview
// tab. Read-only: what the model will see on the NEXT turn, as an INSTRUMENT rather than a text dump:
//   1. the stacked CONTEXT-BUDGET bar (`AssemblyBudgetPreview` — server-computed, `Σ sources === total`);
//   2. one row per SOURCE (System · Cards · World info · Steering · Game state · History), swatch-keyed to its
//      segment, each drilling in to that source's assembled text verbatim;
//   3. the game-state excerpt (a game chat only — the mock's mono block, the honesty instrument's core claim:
//      what the panel shows and what the model reads are provably the same bytes);
//   4. the deeper BUILD/SHAPE diagnostics (`AssembleTrace` + the content-free `ShapeTrace`), collapsed — the
//      per-field provenance, WI activation, cache-breakpoint decision a host needs when a turn goes wrong.
// Pure leverage of the `chat.previewAssembly` + `chat.getShapeTrace` verbs (no content bytes in either trace).
//
// The RAW static/dynamic prompt dumps the pre-D-4 tab ended in are GONE: every byte they showed is now
// reachable through the source row that owns it (attributed, not a wall).
//
// HOST-ONLY: both reads are host/admin debug surfaces server-side (the full prompt reveals merged member
// cards; the shape trace is `requireHost`-gated, matrix `getShapeTrace: "host"`). The CONTEXT panel only
// mounts this tab for the host, so a member never reaches the queries (which would refuse). A member-scoped
// `previewSection` affordance is deferred (task #28 flag).

import type { AssembleTrace, AssemblyBudgetPreview, AssemblyBudgetSlice, AssemblySource, ShapeBreakpointDecision, ShapeTrace } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Card } from "@orb/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SegmentBarSegment } from "@orb/ui/meter";
import { SegmentBar } from "@orb/ui/meter";
import type { SeriesColor } from "@orb/ui/series-row";
import { SeriesRow } from "@orb/ui/series-row";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";

export interface AssemblyPreviewPanelProps {
  readonly chatId: ChatId;
}

/** The Preview tab body — suspends on the host-only `previewAssembly` + `getShapeTrace` reads, then
 *  renders them read-only. */
export function AssemblyPreviewPanel({ chatId }: AssemblyPreviewPanelProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Assembling the preview…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the preview" onRetry={retry} />}
    >
      <PreviewBody chatId={chatId} />
    </QueryBoundary>
  );
}

function PreviewBody({ chatId }: AssemblyPreviewPanelProps): ReactElement {
  const trpc = useTRPC();
  // Plural useSuspenseQueries so previewAssembly + getShapeTrace fire in PARALLEL — two sequential
  // useSuspenseQuery calls waterfall the second read behind the first.
  const [{ data }, { data: shapeTrace }] = useSuspenseQueries({
    queries: [trpc.chat.previewAssembly.queryOptions({ chatId }), trpc.chat.getShapeTrace.queryOptions({ chatId })],
  });
  const { prompt, trace, budget } = data;
  const gameState = budget.sources.find((source) => source.source === "game-state");

  return (
    <Stack gap="block">
      <ContextBudget budget={budget} />

      <Stack>
        {budget.sources.map((source, index) => (
          <SourceRow key={source.source} slice={source} divider={index > 0} />
        ))}
      </Stack>

      {gameState === undefined ? null : <GameStateExcerpt text={gameState.text} />}

      <Text size="micro" tone="muted">
        Counts are estimated locally (QuadChars) — the real count is the provider's post-turn usage. Host-only: what the model sees, nothing more, nothing
        hidden from you.
      </Text>

      <Diagnostics injections={prompt.afterHistory} shapeTrace={shapeTrace} trace={trace} />
    </Stack>
  );
}

// ── The budget bar ──────────────────────────────────────────────────────────────────────────────────

/** The categorical ramp step each source keeps — fixed by SOURCE (not by row position), so a source that
 *  drops out of one chat (no game, no lore) never re-colours the others. Mirrors the panel-redesign mock's
 *  swatch assignment exactly. */
const SOURCE_COLOR: Record<AssemblySource, SeriesColor> = {
  ["system"]: 6,
  ["cards"]: 4,
  ["world-info"]: 2,
  ["steering"]: 3,
  ["game-state"]: 1,
  ["history"]: 5,
};

/** The row label per source. The server's `detail` line carries the specifics (which sections, which cast). */
const SOURCE_LABEL: Record<AssemblySource, string> = {
  ["system"]: "System",
  ["cards"]: "Cards",
  ["world-info"]: "World info",
  ["steering"]: "Steering",
  ["game-state"]: "Game state",
  ["history"]: "History",
};

const THOUSANDS_RE = /\B(?=(\d{3})+(?!\d))/g;

/** Group a token count for display ("4300" → "4,300"). Hand-rolled: `.toLocaleString()` is banned repo-wide
 *  (`no-raw-intl-time` — un-memoized Intl by the back door) and ui takes pre-formatted strings. */
function formatCount(value: number): string {
  return String(value).replace(THOUSANDS_RE, ",");
}

/** The mock's budget card: the used/ceiling line + the stacked bar whose segments ARE the rows below. The bar
 *  is decoration (aria-hidden inside `SegmentBar`) — the text line + the rows carry the datum. */
function ContextBudget({ budget }: { readonly budget: AssemblyBudgetPreview }): ReactElement {
  const segments: readonly SegmentBarSegment[] = budget.sources.map((source) => ({
    id: source.source,
    value: source.tokens,
    color: SOURCE_COLOR[source.source],
  }));
  return (
    <Card padding="block">
      <Stack gap="field">
        <Row align="baseline" gap="row" justify="between">
          <Text size="micro" tone="muted">
            context
          </Text>
          <Text size="code">
            {/* `0` = no trustworthy ceiling (no model window + no soft cap) — say so, never fabricate a denominator. */}
            {budget.ceilingTokens === 0
              ? `${formatCount(budget.totalTokens)} tok · no window limit`
              : `${formatCount(budget.totalTokens)} / ${formatCount(budget.ceilingTokens)} tok`}
          </Text>
        </Row>
        <SegmentBar segments={segments} />
      </Stack>
    </Card>
  );
}

// ── The per-source rows ─────────────────────────────────────────────────────────────────────────────

/** One source row: the swatch-keyed `SeriesRow` as a Collapsible TRIGGER, drilling in to that source's
 *  assembled text. EVERY row drills in (uniform rows, one affordance) — the `history` row carries no text by
 *  construction (the wire history is the transcript itself), so its panel says exactly that instead of
 *  serving a copy of canon. */
function SourceRow({ slice, divider }: { readonly slice: AssemblyBudgetSlice; readonly divider: boolean }): ReactElement {
  return (
    <Collapsible>
      <CollapsibleTrigger className="w-full">
        <SeriesRow
          color={SOURCE_COLOR[slice.source]}
          detail={slice.detail === "" ? undefined : slice.detail}
          divider={divider}
          label={SOURCE_LABEL[slice.source]}
          value={formatCount(slice.tokens)}
        />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        {slice.text === "" ? (
          <Text className="block pb-row" size="micro" tone="muted">
            Accounted by cost only — the wire history IS the transcript you're reading, so the preview never re-serves it.
          </Text>
        ) : (
          <Text className="block whitespace-pre-wrap pb-row" size="code" tone="muted">
            {slice.text}
          </Text>
        )}
      </CollapsiblePanel>
    </Collapsible>
  );
}

/** The mock's game-state excerpt: the serialized state block the model reads, verbatim, in mono. Present only
 *  when the chat is a game (the server omits the source otherwise). */
function GameStateExcerpt({ text }: { readonly text: string }): ReactElement {
  return (
    <Card padding="block">
      <Text className="block max-h-40 overflow-y-auto whitespace-pre-wrap" size="code" tone="muted">
        {text}
      </Text>
    </Card>
  );
}

// ── The diagnostics drawer (the pre-D-4 trace surface, collapsed) ───────────────────────────────────

/** The instrument's section voice (the mock's `.kicker`): micro-caps, muted — a panel-width heading, never the
 *  `Section` default title size, which at the 17rem floor shouts louder than the data it labels. */
function Kicker({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <Text size="micro" tone="muted" transform="caps" weight="semibold">
      {children}
    </Text>
  );
}

function Diagnostics({
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

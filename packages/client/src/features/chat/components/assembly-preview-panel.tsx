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

import type { AssemblyBudgetPart, AssemblyBudgetPreview, AssemblyBudgetSlice, AssemblySource } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Card } from "@orb/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Stack } from "@orb/ui/layout";
import type { SegmentBarSegment } from "@orb/ui/meter";
import { SegmentBar } from "@orb/ui/meter";
import type { SeriesColor } from "@orb/ui/series-row";
import { SeriesRow } from "@orb/ui/series-row";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { AssemblyPreviewDiagnostics } from "./assembly-preview-diagnostics.tsx";

export interface AssemblyPreviewPanelProps {
  readonly chatId: ChatId;
}

/** The Preview tab body — suspends on the host-only `previewAssembly` + `getShapeTrace` reads, then
 *  renders them read-only. */
export function AssemblyPreviewPanel({ chatId }: AssemblyPreviewPanelProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Assembling the preview…</Text>}
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

      <Text voice="gloss">
        Counts are estimated locally (QuadChars) — the real count is the provider's post-turn usage. Host-only: what the model sees, nothing more, nothing
        hidden from you.
      </Text>

      <AssemblyPreviewDiagnostics injections={prompt.afterHistory} shapeTrace={shapeTrace} trace={trace} />
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

/** The budget card: the used/window line + the bar. FILL-VS-HEADROOM (owner ruling 2026-07-31, superseding
 *  the mock's composition-only reading): the bar's FILLED LENGTH is `used / window`, the fill keeps its
 *  per-source segments, and the rest of the rail is visible HEADROOM — so 891 of 200k reads as the sliver it
 *  is instead of a full-looking bar. The bar is decoration (aria-hidden inside `SegmentBar`); the text line +
 *  the rows carry the datum.
 *
 *  With NO real window (unknown or unbounded) there is no headroom truth to draw, so no fill geometry is
 *  faked: the bar falls back to composition-only across the full rail, and the headline says which case it is
 *  (the owner's explicit carve-out — a proportion against a fallback would be the same fiction as the ratio). */
function ContextBudget({ budget }: { readonly budget: AssemblyBudgetPreview }): ReactElement {
  const segments: readonly SegmentBarSegment[] = budget.sources.map((source) => ({
    id: source.source,
    value: source.tokens,
    color: SOURCE_COLOR[source.source],
  }));
  const windowKnown = budget.ceilingTokens > 0 && !budget.ceilingEstimated;
  return (
    <Card>
      <Stack gap="field">
        <Row align="baseline" gap="row" justify="between">
          <Text voice="gloss">context</Text>
          <Text voice="datum">{budgetHeadline(budget)}</Text>
        </Row>
        <SegmentBar segments={segments} {...(windowKnown ? { total: budget.ceilingTokens } : {})} />
        {budget.ceilingEstimated ? (
          <Text voice="gloss">
            The connected model's context window isn't published (its catalog couldn't be read), so the fit runs against a fallback — the ratio would be
            fiction.
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}

/** The used/ceiling line, in the THREE honest states — a ratio is drawn only against a real window (and the
 *  bar's fill follows the same verdict, see {@link ContextBudget}):
 *   • a known ceiling  ⇒ "4,300 / 8,192 tok";
 *   • an ESTIMATED one ⇒ the total alone + "window unknown" — never a fabricated denominator (D41). The
 *     server still fits against the fallback (it must fit against something), but this surface won't pretend
 *     that number came from the model;
 *   • no ceiling at all ⇒ "no window limit" (nothing bounds the context). */
function budgetHeadline(budget: AssemblyBudgetPreview): string {
  const total = formatCount(budget.totalTokens);
  if (budget.ceilingTokens === 0) {
    return `${total} tok · no window limit`;
  }
  return budget.ceilingEstimated ? `${total} tok · window unknown` : `${total} / ${formatCount(budget.ceilingTokens)} tok`;
}

// ── The per-source rows ─────────────────────────────────────────────────────────────────────────────

/** One source row: the swatch-keyed `SeriesRow` as a Collapsible TRIGGER, drilling in to WHO makes up that
 *  source. EVERY row drills in (uniform rows, one affordance):
 *   • several contributors (the room's roster members under Cards) ⇒ a line per contributor with its OWN token
 *     count, each drilling one level further into that contributor's assembled text;
 *   • one contributor ⇒ straight to the text (a second identical row would be pure chrome);
 *   • `history` ⇒ no contributor split and no text by construction, so the panel says exactly that. */
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
        <SourceBody slice={slice} />
      </CollapsiblePanel>
    </Collapsible>
  );
}

function SourceBody({ slice }: { readonly slice: AssemblyBudgetSlice }): ReactElement {
  if (slice.parts.length > 1) {
    return (
      <Stack>
        {slice.parts.map((part) => (
          <ContributorRow key={part.label} part={part} />
        ))}
      </Stack>
    );
  }
  if (slice.text === "") {
    return (
      <Text voice="gloss" className="block pb-row">
        Accounted by cost only — the wire history IS the transcript you're reading, so the preview never re-serves it.
      </Text>
    );
  }
  return (
    <Text voice="datum" className="block whitespace-pre-wrap pb-row">
      {slice.text}
    </Text>
  );
}

/** One CONTRIBUTOR line inside a source's drill-in — a roster member by their card name, a persona, a preset
 *  section — with the tokens THEY cost this turn, drilling into their own assembled text. This is the answer
 *  to "what is each character in the room costing me": a name, a number, and the exact bytes behind it. */
function ContributorRow({ part }: { readonly part: AssemblyBudgetPart }): ReactElement {
  return (
    <Collapsible className="ps-row">
      <CollapsibleTrigger className="w-full">
        <SeriesRow label={part.label} value={formatCount(part.tokens)} />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <Text voice="datum" className="block whitespace-pre-wrap pb-row">
          {part.text}
        </Text>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/** The mock's game-state excerpt: the serialized state block the model reads, verbatim, in mono. Present only
 *  when the chat is a game (the server omits the source otherwise). */
function GameStateExcerpt({ text }: { readonly text: string }): ReactElement {
  return (
    <Card>
      <Text voice="datum" className="block max-h-40 overflow-y-auto whitespace-pre-wrap">
        {text}
      </Text>
    </Card>
  );
}

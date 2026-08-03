// domain/chat/assembly/budget — the CONTEXT-BUDGET accounting: which of the six `AssemblySource` buckets each
// assembled contribution belongs to, and the grouping of the BUILD walk's per-section slices into the wire
// `AssemblyBudgetPreview` the host Preview tab draws. Pure (no DB, no I/O) — `verbs/read` supplies the shaped
// history row + the ceiling it already computed for the fit.
//
// The classification is the whole point of the surface: "where did my context go" is only answerable if every
// byte is attributed to exactly ONE bucket. Both maps are total mapped-type Records, so a new prompt marker /
// injection origin is a `tsc` error here (§5.5) rather than a silently mis-bucketed row.
//
// TOKENS ARE ESTIMATED, never billing truth: the same `@orb/kit/tokens` QuadChars estimator the history fit
// runs — the real count is the provider's post-turn `usage`. Estimating the JOINED text per source (not the
// sum of per-slice estimates) keeps `Σ sources[].tokens === totalTokens` exact by construction.

import type {
  AssemblyBudgetPart,
  AssemblyBudgetPreview,
  AssemblyBudgetSlice,
  AssemblySectionCost,
  AssemblySource,
  ChatInjection,
  ChatInjectionOrigin,
} from "@orb/contracts/chat";
import { ASSEMBLY_SOURCES } from "@orb/contracts/chat";
import type { PromptSection } from "@orb/contracts/preset";
import { estimateTokens } from "@orb/kit/tokens";
import type { AssemblySlice, HistoryBudgetInput } from "../contract/results";

type Marker = Extract<PromptSection, { type: "marker" }>["marker"];

/** Every prompt MARKER's budget bucket. A literal (preset-authored prose) section is `system` — it is the
 *  operator's own instruction text. `chat_history` renders nothing (the pivot), so its bucket is only ever
 *  reached defensively-free: the walk never emits a slice for it. */
// Computed keys — the marker vocabulary is snake_case on the wire (the `DEFAULT_MARKER_TEMPLATES` idiom
// keeps `useNamingConvention` off a foreign key set without a suppression).
const MARKER_SOURCE: Record<Marker, AssemblySource> = {
  ["main_prompt"]: "system",
  ["post_history"]: "system",
  ["char_description"]: "cards",
  ["char_personality"]: "cards",
  ["scenario"]: "cards",
  ["dialogue_examples"]: "cards",
  ["persona"]: "cards",
  ["world_info_before"]: "world-info",
  ["world_info_after"]: "world-info",
  ["compact_summary"]: "steering",
  ["memory"]: "steering",
  ["guided_instruction"]: "steering",
  ["chat_history"]: "history",
};

/** Every injection ORIGIN's budget bucket + the label it contributes to that source's `detail` line. An
 *  injection with no stamped origin (hand-built / a producer that predates the stamp) accounts as `steering`:
 *  the honest default — it is operator-side steering text, never a card or lore. */
const ORIGIN_SOURCE: Record<ChatInjectionOrigin, { readonly source: AssemblySource; readonly label: string }> = {
  ["user"]: { source: "steering", label: "chat injections" },
  ["world-info"]: { source: "world-info", label: "at depth" },
  ["persona"]: { source: "cards", label: "persona" },
  ["authors-note"]: { source: "steering", label: "author's note" },
  ["guided"]: { source: "steering", label: "guided steer" },
  ["game-state"]: { source: "game-state", label: "state block" },
  // The preset's `formatStrings.newChatMarker` boundary (G9) — operator-authored framing, not card or lore.
  ["new-chat-marker"]: { source: "steering", label: "new-chat marker" },
};

const UNSTAMPED_INJECTION = { source: "steering", label: "chat injections" } as const satisfies { source: AssemblySource; label: string };

/** The budget bucket a rendered prompt section lands in. */
export function sectionSource(section: PromptSection): AssemblySource {
  return section.type === "literal" ? "system" : MARKER_SOURCE[section.marker];
}

/** The budget bucket + contributor label a delivered injection lands in (by its stamped
 *  {@link ChatInjection.origin}). A person-backed injection (a roster member's at-depth note, a persona's
 *  description) is labelled by that NAME — `originLabel` — so it lands under the same contributor as the rest
 *  of their context, not under an anonymous channel name. */
export function injectionSource(injection: ChatInjection): { readonly source: AssemblySource; readonly label: string } {
  const bucket = injection.origin === undefined ? UNSTAMPED_INJECTION : ORIGIN_SOURCE[injection.origin];
  const named = injection.originLabel;
  if (named === undefined || named.trim().length === 0) {
    return bucket;
  }
  return { source: bucket.source, label: injection.origin === "persona" ? personaContributorLabel(named) : named };
}

/** The persona's contributor label — mirrors the marker-side label in `assembly/assemble` so ONE persona
 *  never splits into two rows (a marker-delivered description and an at-depth one merge by name). */
export function personaContributorLabel(name: string): string {
  return `${name} (persona)`;
}

/** How many contributor labels a source's `detail` line spells out before collapsing the rest to "+N more". */
const DETAIL_LABEL_CAP = 3;

/** The deduped, prompt-ordered contributor line for one source ("character description · personality"). */
function detailLine(labels: readonly string[]): string {
  const unique: string[] = [...new Set(labels.filter((l) => l.trim().length > 0))];
  if (unique.length <= DETAIL_LABEL_CAP) {
    return unique.join(" · ");
  }
  return `${unique.slice(0, DETAIL_LABEL_CAP).join(" · ")} · +${unique.length - DETAIL_LABEL_CAP} more`;
}

function historySlice(history: HistoryBudgetInput): AssemblyBudgetSlice | null {
  if (history.keptCount === 0 && history.usedTokens === 0) {
    return null;
  }
  const turns = `${history.keptCount} ${history.keptCount === 1 ? "turn" : "turns"}`;
  return {
    source: "history",
    detail: history.droppedCount === 0 ? turns : `${turns} · ${history.droppedCount} dropped`,
    tokens: history.usedTokens,
    // No contributor split exists for canon (it is everyone's, turn by turn) — and no text (see the field doc).
    parts: [],
    text: "",
  };
}

/** Fold a source's slices into its per-CONTRIBUTOR parts: same label ⇒ one part (a member whose card lands in
 *  two sections is ONE line in the room's cost, not two), first-seen order preserved. */
function foldParts(slices: readonly AssemblySlice[]): AssemblyBudgetPart[] {
  const textsByLabel = new Map<string, string[]>();
  for (const slice of slices) {
    const existing = textsByLabel.get(slice.label);
    if (existing === undefined) {
      textsByLabel.set(slice.label, [slice.text]);
      continue;
    }
    existing.push(slice.text);
  }
  return [...textsByLabel].map(([label, texts]) => {
    const text = texts.join("\n\n");
    return { label, tokens: estimateTokens(text), text };
  });
}

/**
 * Group the BUILD walk's per-contributor slices + the shaped history into the host preview's budget breakdown.
 * Sources with nothing in them are OMITTED (a plain chat has no `game-state` row); the surviving rows keep
 * `ASSEMBLY_SOURCES` (prompt) order regardless of the order the walk emitted them in.
 *
 * A source's `tokens` is estimated over its JOINED text (not the sum of its parts' estimates) so
 * `Σ sources === totalTokens` stays exact; the parts' own estimates can differ from that total by a token or
 * two of rounding — they answer "who costs what", the source row answers "what does this bucket cost".
 */
/** Group the walk's slices by the SECTION that produced them (injection slices carry no `sectionId` and are
 *  therefore not rack rows — see {@link AssemblySlice.sectionId}). Empty renders are dropped, exactly as the
 *  source grouping drops them. */
function bySectionId(slices: readonly AssemblySlice[]): Map<string, AssemblySlice[]> {
  const out = new Map<string, AssemblySlice[]>();
  for (const slice of slices) {
    if (slice.sectionId === undefined || slice.text.trim().length === 0) {
      continue;
    }
    const existing = out.get(slice.sectionId);
    if (existing === undefined) {
      out.set(slice.sectionId, [slice]);
      continue;
    }
    existing.push(slice);
  }
  return out;
}

/**
 * The SAME assembled bytes, partitioned by PROMPT SECTION — the preset editor's bound Prompt readout prices
 * its rack rows off this (D121-G / §7.1), while the chat Preview tab reads the per-SOURCE partition above.
 * One read, two projections.
 *
 * The HISTORY PIVOT is the one section the BUILD walk emits no slice for (it renders nothing — it IS the
 * split), so its cost comes from the FIT: the same `usedTokens` + per-turn rows the `history` source row is
 * built from. Everything else is its own rendered text, folded per contributor by the SAME rule the source
 * rows use (a member whose card lands in two sections is one row in each).
 *
 * Sections that rendered NOTHING are omitted — "bound and absent" is a fact ("contributes nothing this turn"),
 * where the editor's unbound `~—` means "not knowable here". Rack order is preserved.
 */
function buildSectionCosts(args: {
  readonly sections: readonly PromptSection[];
  readonly slices: readonly AssemblySlice[];
  readonly history: HistoryBudgetInput;
}): readonly AssemblySectionCost[] {
  const grouped = bySectionId(args.slices);
  // The FIRST history-bucketed section is the pivot the fit priced (the assembler's own first-pivot-wins rule);
  // a duplicate `chat_history` row splits nothing and costs nothing, so it stays absent rather than double-
  // counting the conversation.
  const pivotIndex = args.sections.findIndex((section) => sectionSource(section) === "history");
  const out: AssemblySectionCost[] = [];
  for (const [index, section] of args.sections.entries()) {
    if (index === pivotIndex) {
      if (args.history.keptCount > 0 || args.history.usedTokens > 0) {
        out.push({ sectionId: section.id, tokens: args.history.usedTokens, rows: args.history.rows });
      }
      continue;
    }
    const sliced = grouped.get(section.id);
    if (sliced === undefined || sliced.length === 0) {
      continue;
    }
    const parts = foldParts(sliced);
    out.push({
      sectionId: section.id,
      tokens: estimateTokens(sliced.map((s) => s.text).join("\n\n")),
      rows: parts.map((part) => ({ label: part.label, tokens: part.tokens })),
    });
  }
  return out;
}

export function buildAssemblyBudget(args: {
  readonly slices: readonly AssemblySlice[];
  readonly history: HistoryBudgetInput;
  /** The inspected preset's rack, in order — the join key set for the per-SECTION partition. */
  readonly sections: readonly PromptSection[];
  /** `min(capability window, preset maxContextTokens)`; 0 when neither bounds the context. */
  readonly ceilingTokens: number;
  /** The ceiling came from a GUESSED model window (`capability.context.windowEstimated`) — carried through so
   *  the surface can refuse to draw a ratio against it. */
  readonly ceilingEstimated: boolean;
}): AssemblyBudgetPreview {
  const bySource = new Map<AssemblySource, AssemblySlice[]>();
  for (const slice of args.slices) {
    if (slice.text.trim().length === 0) {
      continue;
    }
    const existing = bySource.get(slice.source);
    if (existing === undefined) {
      bySource.set(slice.source, [slice]);
      continue;
    }
    existing.push(slice);
  }
  const history = historySlice(args.history);
  const sources: AssemblyBudgetSlice[] = [];
  for (const source of ASSEMBLY_SOURCES) {
    if (source === "history") {
      if (history !== null) {
        sources.push(history);
      }
      continue;
    }
    const sliced = bySource.get(source);
    if (sliced === undefined || sliced.length === 0) {
      continue;
    }
    const parts = foldParts(sliced);
    const text = sliced.map((s) => s.text).join("\n\n");
    sources.push({ source, detail: detailLine(parts.map((p) => p.label)), tokens: estimateTokens(text), parts, text });
  }
  return {
    ceilingTokens: args.ceilingTokens,
    ceilingEstimated: args.ceilingEstimated,
    totalTokens: sources.reduce((sum, s) => sum + s.tokens, 0),
    sources,
    sections: buildSectionCosts({ sections: args.sections, slices: args.slices, history: args.history }),
  };
}

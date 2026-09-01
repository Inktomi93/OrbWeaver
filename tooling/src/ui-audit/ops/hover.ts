// The FORCED-STATE pass (`hover-contrast`) — the one sample family that cannot be gathered inside
// COLLECT_SAMPLES_JS, because Chromium exposes no way for page JS to force its own `:hover`. The only
// door is `CSS.forcePseudoState` over CDP, which is a NODE-side round trip, so this pass sandwiches a
// Node loop between two in-page evaluations.
//
// THE BOUNDED-POPULATION ARGUMENT (the design question this file answers). A naive "force hover on every
// interactive element" is one round trip per element — 117 controls on `settings:appearance` — and most
// of them declare no hover paint at all. Two narrowings collapse that:
//   1. IN-PAGE PREFILTER, ZERO ROUND TRIPS. ops/hover-walker.ts enumerates the stylesheets and keeps only
//      the rules whose selector carries a `:hover` compound AND whose block sets `color`/`background-color`,
//      then resolves those selectors to elements. Everything else is `excluded(noHoverPaint=…)`.
//   2. ONE FORCE PER SUBJECT, NOT PER CANDIDATE. Candidates are grouped by the element whose `:hover` is
//      responsible, and every member of a group is read in ONE evaluate while that subject is held.
// `CSS.getMatchedStylesForNode` was the other candidate for step 1 and is strictly worse: it is itself a
// per-element round trip, so it would pay the very cost it is meant to avoid.
// There is no cheaper in-page route — verified, not assumed: forced pseudo-state is a DevTools protocol
// affordance with no DOM/CSSOM surface, and re-implementing the cascade in page JS to predict the hover
// winner would re-derive specificity resolution (and be wrong at exactly the specificity fights this rule
// exists to catch).
//
// RELEASING IS NOT BEST-EFFORT. One `:hover` left forced poisons every later sample in the run, so every
// force is released in a `finally`, and the pass then RE-READS every candidate's rest state in page and
// reports any that did not come back identical (`notRestored`). That check runs on the live page every
// run, not only in a fixture.
import { errorMessage } from "@orb/kit/error-message";
import { print } from "@orb/tooling/_shared/artifacts";
import type { CDPSession, Page } from "@playwright/test";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { RawSamples } from "../contract/samples.ts";
import type { HoverCensusRestRow, HoverCensusResult, HoverContrastInput, HoverForcedReadRow, HoverGroupRow } from "../contract/samples-hover.ts";
import type { HoverPass, HoverPassOutcome } from "../contract/types.ts";
import { HOVER_CENSUS } from "./hover-walker.ts";
import { WALKER_CORE } from "./walker/core.ts";
import { WALKER_RESOLVE } from "./walker/resolve.ts";
import { WALKER_MUTATION_CARRIES } from "./walker.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

/** WALKER_CORE + WALKER_RESOLVE give this pass the SAME `describe` / `isVisible` / `parseRgb` /
 *  `resolveBackdrop` machinery the main walk uses — never a second colour reader or a second backdrop
 *  resolver (UI-Primitives-and-Reuse.md §13.9; three shipped rules were structurally dead the last time
 *  this instrument grew its own). CORE's mutation observer needs `mutationCarriesElement`, which is why
 *  walker.ts exports that fragment separately. */
const HOVER_CENSUS_JS = `(async () => {
${WALKER_MUTATION_CARRIES}${WALKER_CORE}${WALKER_RESOLVE}${HOVER_CENSUS}})()`;

/** Parses a list of CANDIDATE INDICES the page returned, refusing anything that is not one. This is
 *  the seam the pass's first defect lived at: `JSON.parse(raw) as number[]` over a list of selector
 *  STRINGS type-checked fine and silently disabled the restoration withholding. A cast here has no
 *  compiler behind it, so this validates instead — and a violation is an INSTRUMENT ERROR, loud. */
function candidateIndices(raw: string, bound: number, label: string): number[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`INSTRUMENT ERROR: ${label} returned ${typeof parsed}, not a list of candidate indices`);
  }
  return parsed.map((value: unknown) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value >= bound) {
      throw new Error(`INSTRUMENT ERROR: ${label} returned ${JSON.stringify(value)}, not a candidate index below ${String(bound)}`);
    }
    return value;
  });
}

/** Same discipline for the forced readings: every row must name a candidate this pass censused. */
function forcedReadRows(raw: string, bound: number): HoverForcedReadRow[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`INSTRUMENT ERROR: hover read returned ${typeof parsed}, not a list of readings`);
  }
  return parsed.map((value: unknown) => {
    const row = value as HoverForcedReadRow;
    if (typeof row.index !== "number" || !Number.isSafeInteger(row.index) || row.index < 0 || row.index >= bound) {
      throw new Error(`INSTRUMENT ERROR: hover read row names ${JSON.stringify(row.index)}, not a candidate index below ${String(bound)}`);
    }
    return row;
  });
}

/** The RESULT line's `hover-pass=` word. ONE token, never a sentence — the machine line is split on
 *  whitespace by its readers, so the `broke` arm's full reason rides the printed `HOVER REFUSED` line,
 *  the evidence gap and the JSON artifact instead. */
export function hoverPassLabel(pass: HoverPass | null): string {
  if (pass === null) {
    return "unreported";
  }
  const { outcome } = pass;
  if (outcome.kind === "ran") {
    return "ok";
  }
  return outcome.kind === "broke" ? "BROKE" : outcome.reason;
}

function notRunPass(samples: RawSamples, outcome: HoverPassOutcome, wallMs: number): HoverPass {
  return { samples, wallMs, outcome, subjectsForced: 0, forceFailures: [] };
}

/** subject index → protocol nodeId, resolved once and reused: a subject is forced by every group whose
 *  chain climbs through it. */
class SubjectNodes {
  private readonly ids = new Map<number, number>();
  private readonly cdp: CDPSession;

  constructor(cdp: CDPSession) {
    this.cdp = cdp;
  }

  async nodeIdOf(subjectIndex: number): Promise<number> {
    const cached = this.ids.get(subjectIndex);
    if (cached !== undefined) {
      return cached;
    }
    const evaluated = await this.cdp.send("Runtime.evaluate", { expression: `window.__orbHover.subjects[${String(subjectIndex)}]` });
    const objectId = evaluated.result.objectId;
    if (objectId === undefined) {
      throw new Error(`hover subject ${String(subjectIndex)} did not resolve to a live element`);
    }
    try {
      const { nodeId } = await this.cdp.send("DOM.requestNode", { objectId });
      if (nodeId === 0) {
        throw new Error(`hover subject ${String(subjectIndex)} has no protocol node`);
      }
      this.ids.set(subjectIndex, nodeId);
      return nodeId;
    } finally {
      await this.cdp.send("Runtime.releaseObject", { objectId });
    }
  }
}

async function force(cdp: CDPSession, nodeId: number, on: boolean): Promise<void> {
  await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: on ? ["hover"] : [] });
}

interface HoverSession {
  readonly page: Page;
  readonly cdp: CDPSession;
  readonly nodes: SubjectNodes;
  /** How many candidates the census returned — the bound every index off the page must fall inside. */
  readonly candidates: number;
}

interface GroupOutcome {
  readonly rows: readonly HoverForcedReadRow[];
  readonly failure: string | null;
}

/** Hold one subject chain in `:hover`, read every text it repaints, release. The release runs even when
 *  the read threw — a stuck state would silently corrupt every group after this one. */
async function readGroup(session: HoverSession, groupIndex: number, group: HoverGroupRow): Promise<GroupOutcome> {
  const { page, cdp, nodes } = session;
  const held: number[] = [];
  try {
    for (const subjectIndex of group.forced) {
      // Sequential by nature: each force must be in effect before the read, and the protocol has no
      // batch form. The count is bounded by hover-painting NESTING depth, typically one.
      const nodeId = await nodes.nodeIdOf(subjectIndex);
      await force(cdp, nodeId, true);
      held.push(nodeId);
    }
    const raw = (await page.evaluate(`JSON.stringify(window.__orbHover.read(${String(groupIndex)}))`)) as string;
    return { rows: forcedReadRows(raw, session.candidates), failure: null };
  } catch (e) {
    return { rows: [], failure: errorMessage(e) };
  } finally {
    for (const nodeId of held) {
      await force(cdp, nodeId, false);
    }
  }
}

function bump(counts: Record<string, number>, reason: string, by = 1): void {
  if (by > 0) {
    counts[reason] = (counts[reason] ?? 0) + by;
  }
}

/** How many distinct force failures are quoted back on the RESULT line — enough to name a pattern,
 *  short enough not to bury it. The COUNT is always complete in `withheld.forceFailed`. */
const FORCE_FAILURE_QUOTES = 3;

interface ForcedReads {
  readonly reads: ReadonlyMap<number, HoverForcedReadRow>;
  readonly failures: readonly string[];
  readonly forceFailedMembers: number;
  readonly subjectsForced: number;
}

/** Every group, one at a time. A group whose force or read threw contributes its members to
 *  `forceFailed` — a named withholding, which makes the run a NO VERDICT rather than a quiet partial. */
async function forceEveryGroup(session: HoverSession, groups: readonly HoverGroupRow[]): Promise<ForcedReads> {
  const reads = new Map<number, HoverForcedReadRow>();
  const failures: string[] = [];
  let forceFailedMembers = 0;
  let subjectsForced = 0;
  for (const [groupIndex, group] of groups.entries()) {
    if (group.members.length === 0) {
      continue;
    }
    // Strictly sequential: only one subject chain may be held in `:hover` at a time, because a page with
    // several forced hover states is a state no pointer can produce.
    const outcome = await readGroup(session, groupIndex, group);
    if (outcome.failure === null) {
      subjectsForced += 1;
      for (const row of outcome.rows) {
        reads.set(row.index, row);
      }
      continue;
    }
    forceFailedMembers += group.members.length;
    if (failures.length < FORCE_FAILURE_QUOTES) {
      failures.push(outcome.failure);
    }
  }
  return { reads, failures, forceFailedMembers, subjectsForced };
}

/** Joins each candidate's rest facts to its forced reading. A candidate with no reading was already
 *  withheld upstream (budget or force failure) and is not counted twice here. */
function settleInputs(
  rest: readonly HoverCensusRestRow[],
  forced: ForcedReads,
  stuck: ReadonlySet<number>,
  withheld: Record<string, number>,
): HoverContrastInput[] {
  const inputs: HoverContrastInput[] = [];
  for (const [index, row] of rest.entries()) {
    const read = forced.reads.get(index);
    if (read === undefined) {
      continue;
    }
    if (stuck.has(index)) {
      bump(withheld, "notRestored");
      continue;
    }
    if (read.color === null) {
      bump(withheld, "unreadableHoverColor");
      continue;
    }
    inputs.push({ ...row, hoverColor: read.color, hoverBackdrop: read.backdrop, foregroundOpacity: read.opacity });
  }
  return inputs;
}

/**
 * Measures every hover-painted text on the surface in its forced `:hover` state and folds the results
 * into `samples` as the `hover-contrast` family. Never throws: a pass that cannot run leaves `samples`
 * untouched and says why, because an audit is not worth losing over a rule that has no candidates.
 */
export async function resolveHoverStates(page: Page, samples: RawSamples, hoverCapable: boolean): Promise<HoverPass> {
  const started = Date.now();
  if (!hoverCapable) {
    // Under `(hover: none)` the app's whole hover layer is behind a media query that does not match, so
    // there is no hover state to judge — a zero row here would read as "checked, clean".
    return notRunPass(samples, { kind: "not-applicable", reason: "no-hover-media" }, Date.now() - started);
  }
  const cdp = await page.context().newCDPSession(page);
  // @orb-gate-ignore caught-failure-ownership(empty:e): printed as `HOVER REFUSED <why>`, RETURNED as a `broke` outcome, and RENDERED AS EXIT.toolError by run.ts — propagated through both the message and the exit code, so a forced-state pass that failed reddens the audit's verdict rather than being absorbed. END CONDITION: the run reports `hover-contrast` NO VERDICT and exits 2.
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    // Roots the DOM agent so `DOM.requestNode` can push a node the page handed us; depth 0 keeps it from
    // serializing the whole tree back over the wire.
    await cdp.send("DOM.getDocument", { depth: 0 });
    const census = (await page.evaluate(HOVER_CENSUS_JS)) as HoverCensusResult;
    const candidates = census.rest.length;
    const forced = await forceEveryGroup({ page, cdp, nodes: new SubjectNodes(cdp), candidates }, census.groups);
    // THE RELEASE PROOF, on the live page, every run: rest state re-read after the last release. The
    // indices come back through `candidateIndices`, which REFUSES anything that is not one — the seam
    // where a silent `as number[]` once turned this entire branch off.
    const stuckRaw = (await page.evaluate("JSON.stringify(window.__orbHover.verify())")) as string;
    const stuck = new Set(candidateIndices(stuckRaw, candidates, "hover verify"));
    await page.evaluate("delete window.__orbHover");
    const withheld: Record<string, number> = {};
    bump(withheld, "forceFailed", forced.forceFailedMembers);
    const inputs = settleInputs(census.rest, forced, stuck, withheld);
    bump(withheld, "unreadableRestColor", census.census.unreadableColor);
    bump(withheld, "forceBudget", census.census.overBudget);
    // ── #2 POLARITY. `excluded` is a MEASUREMENT proving the rule does not apply; `withheld` is the
    // absence of a measurement. An unreadable stylesheet's `:hover` rules were never collected, so every
    // element it would have painted falls into `noHoverPaint` — recording that as `excluded` would file
    // absence-of-measurement as proof-of-inapplicability, the polarity inverted. `noHoverPaint` only
    // earns `excluded` when every sheet was readable AND every selector parsed.
    const paintProven = census.census.sheetsUnreadable === 0 && census.census.unparseableSelectors === 0;
    const excluded: Record<string, number> = {};
    bump(paintProven ? excluded : withheld, paintProven ? "noHoverPaint" : "noHoverPaintUnproven", census.census.noHoverPaint);
    return {
      samples: {
        ...samples,
        hoverStates: inputs,
        hoverScan: {
          census: {
            candidates: census.census.textCandidates,
            judged: inputs.length,
            withheld,
            excluded,
          },
          sheetsRead: census.census.sheetsRead,
          sheetsUnreadable: census.census.sheetsUnreadable,
          hoverRules: census.census.hoverRules,
          unparseableSelectors: census.census.unparseableSelectors,
          subjectsForced: forced.subjectsForced,
          notRestored: stuck.size,
        },
      },
      wallMs: Date.now() - started,
      outcome: { kind: "ran" },
      subjectsForced: forced.subjectsForced,
      forceFailures: forced.failures,
    };
  } catch (e) {
    // A CHECKER THAT BROKE IS NOT A CLEAN SURFACE (#953). The reason is printed here at the moment it
    // happens, RETURNED as a `broke` outcome, and run.ts turns that into an EXIT.toolError NO VERDICT —
    // propagated through both the message and the exit code, exactly as ops/stage.ts does for a stage
    // that will not boot. The `not-applicable` arm above is the only silent one, and it is silent
    // because a device that cannot hover has no hover state to have a verdict about.
    const reason = `forced-state pass failed (${errorMessage(e)})`;
    print(`HOVER REFUSED ${reason}`);
    return notRunPass(samples, { kind: "broke", reason }, Date.now() - started);
  } finally {
    await cdp.detach();
  }
}

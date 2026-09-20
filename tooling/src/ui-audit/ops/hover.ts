// The FORCED-STATE pass (`hover-contrast`) — the one sample family that cannot be gathered inside
// COLLECT_SAMPLES_JS, because Chromium exposes no way for page JS to force its own `:hover`. The only
// door is `CSS.forcePseudoState` over CDP, which is a NODE-side round trip, so this pass sandwiches a
// Node loop between two in-page evaluations. Since 2026-09-01 it carries BOTH state mechanisms
// (docs/design/state-paint-census.md): the `:hover` pseudo over CDP, and Base UI's `data-*` state
// attributes forced IN PAGE (a synchronous set/read/restore needs no protocol door) — plus the
// state-gated GLOW rows read while a subject is held, folded into the static glow census's own
// sample families. STATED LIMIT: the `(hover: none)` early return below withholds the ATTRIBUTE
// census too — attribute states are real on touch, but the rule collection is not media-condition
// aware, so a coarse-pointer environment keeps the whole pass `not-applicable` (visible as
// `hover-pass=no-hover-media` on the RESULT line) rather than running half-blind.
//
// THE BOUNDED-POPULATION ARGUMENT (the design question this file answers). A naive "force hover on every
// interactive element" is one round trip per element — 117 controls on `config:appearance` — and most
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
import type { GlowShadowInput, RadialGlowInput, RawSamples } from "../contract/samples.ts";
import type { HoverAttrGroupRow, HoverCensusRestRow, HoverContrastInput, HoverForcedReadRow, HoverGroupRow } from "../contract/samples-hover.ts";
import type { HoverPass, HoverPassOutcome } from "../contract/types.ts";
import { attrRestored, candidateIndices, groupReadResult, hoverCensusResult, pageJsonString } from "./hover-validate.ts";
import { HOVER_CENSUS } from "./hover-walker.ts";
import { HOVER_DENOMINATOR } from "./hover-walker-groups.ts";
import { HOVER_FORCE_READ } from "./hover-walker-read.ts";
import { WALKER_CORE } from "./walker/core.ts";
import { WALKER_GROUP_VARIANT } from "./walker/group-variant.ts";
import { WALKER_RESOLVE } from "./walker/resolve.ts";
import { WALKER_STATE_GLOW } from "./walker/state-glow.ts";
import { WALKER_STATE_PAINT } from "./walker/state-paint.ts";
import { WALKER_MUTATION_CARRIES } from "./walker.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

/** WALKER_CORE + WALKER_RESOLVE give this pass the SAME `describe` / `isVisible` / `parseRgb` /
 *  `resolveBackdrop` machinery the main walk uses — never a second colour reader or a second backdrop
 *  resolver (UI-Primitives-and-Reuse.md §13.9; three shipped rules were structurally dead the last time
 *  this instrument grew its own). CORE's mutation observer needs `mutationCarriesElement`, which is why
 *  walker.ts exports that fragment separately. WALKER_STATE_PAINT + WALKER_STATE_GLOW sit after RESOLVE,
 *  in that order, and before the census halves — the same var-initialization ordering COLLECT_SAMPLES_JS
 *  obeys, and the glow half is what this pass's forced glow read calls (a SIBLING file since #2494, because
 *  state-paint.ts reached the `tooling-size` cap; docs/architecture/core/Core-Tooling-Law.md §4.3) — and
 *  WALKER_GROUP_VARIANT (#1084) sits between them: it READS state-paint's strippers and is composed
 *  ONLY here, because the main walk builds no state pairs and would carry the bytes for nothing.
 *  The census itself is THREE segments in strict order — rules+pairs (HOVER_CENSUS), the denominator +
 *  grouping (HOVER_DENOMINATOR), the read/verify closures (HOVER_FORCE_READ) — one function scope, so
 *  each reads the `var`s the previous one initialized. */
const HOVER_CENSUS_JS = `(async () => {
${WALKER_MUTATION_CARRIES}${WALKER_CORE}${WALKER_RESOLVE}${WALKER_STATE_PAINT}${WALKER_STATE_GLOW}${WALKER_GROUP_VARIANT}${HOVER_CENSUS}${HOVER_DENOMINATOR}${HOVER_FORCE_READ}})()`;

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
  return { samples, wallMs, outcome, subjectsForced: 0, forceFailures: [], forceFailedGroups: 0 };
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
  readonly shadows: readonly GlowShadowInput[];
  readonly radials: readonly RadialGlowInput[];
  readonly failure: string | null;
}

/** Hold one subject chain in `:hover`, read every text it repaints (and the glow deltas riding the
 *  same force), release. The release runs even when the read threw — a stuck state would silently
 *  corrupt every group after this one. */
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
    const raw = pageJsonString(await page.evaluate(`JSON.stringify(window.__orbHover.read(${String(groupIndex)}))`), "hover group read");
    const result = groupReadResult(raw, session.candidates, "hover group read");
    return { rows: result.reads, shadows: result.shadows, radials: result.radials, failure: null };
  } catch (e) {
    return { rows: [], shadows: [], radials: [], failure: errorMessage(e) };
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
  /** Every group that threw, not just the three quoted in `failures` — and not just the ones with
   *  members, which is the arm `forceFailedMembers` is structurally blind to (#1031). */
  readonly failedGroups: number;
  readonly forceFailedMembers: number;
  readonly subjectsForced: number;
  readonly shadows: readonly GlowShadowInput[];
  readonly radials: readonly RadialGlowInput[];
}

/** Every group, one at a time.
 *
 *  THE DIVERGENCE, STATED (#1031, reviewed 2026-09-01 and KEPT). The other five seams of this pass turn a
 *  throw into a whole-run `broke` outcome; this one demotes a throw to a per-group withholding. That is
 *  deliberate and it is not a weaker verdict: `withheld.forceFailed` is a non-cap reason, so
 *  `populationEvidenceGap` makes the run NO VERDICT exactly as `broke` would — while the groups that DID
 *  force keep their measurements, which a whole-run abort would throw away for no gain in honesty. One
 *  bad CDP node is a bad node, not a broken instrument.
 *
 *  WHAT THAT REASONING MISSED, and what `failedGroups` closes: `forceFailedMembers` counts MEMBERS, and a
 *  group with zero contrast members but a non-zero glow count — driven precisely so the state-gated glow
 *  arm is not silently dropped — contributes ZERO on failure. Its reason was printed as a `HOVER REFUSED`
 *  line that reddened nothing, so the run read complete. The count is now published whole, ops/run.ts
 *  raises it as its own evidence gap, and it is serialized on `hoverPass` (#1087 F2).
 *
 *  STATED LIMIT — the FAILING arm has no fixture, and this is a real limit rather than a deferred one. A
 *  group fails only when CDP or the page throws mid-pass (`DOM.requestNode` on a node that detached
 *  between census and force, `CSS.forcePseudoState` refused, the group read throwing). No static
 *  `file://` document can produce any of those deterministically — the timing is the protocol's, not the
 *  fixture's — and the alternative is a test-only fault hook wired into this instrument, which is exactly
 *  the class of change that makes a tool lie about itself. What IS pinned, in
 *  tests/tooling/ui-audit/ops/walker/core.int.test.ts, is the clean-run arm: `forceFailedGroups: 0` and
 *  `forceVerdict: "complete"` are asserted PRESENT, so the field cannot silently vanish or invert. Closing
 *  the failing arm needs a CDP fault injector at the probe layer (_shared/browser.ts), which would serve
 *  every instrument, not just this one. */
async function forceEveryGroup(session: HoverSession, groups: readonly HoverGroupRow[]): Promise<ForcedReads> {
  const reads = new Map<number, HoverForcedReadRow>();
  const failures: string[] = [];
  const shadows: GlowShadowInput[] = [];
  const radials: RadialGlowInput[] = [];
  let forceFailedMembers = 0;
  let failedGroups = 0;
  let subjectsForced = 0;
  for (const [groupIndex, group] of groups.entries()) {
    if (group.members.length === 0 && group.glows === 0) {
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
      shadows.push(...outcome.shadows);
      radials.push(...outcome.radials);
      continue;
    }
    forceFailedMembers += group.members.length;
    failedGroups += 1;
    if (failures.length < FORCE_FAILURE_QUOTES) {
      failures.push(outcome.failure);
    }
  }
  return { reads, failures, failedGroups, forceFailedMembers, subjectsForced, shadows, radials };
}

interface AttrForcedReads extends ForcedReads {
  /** Candidate indices whose group's SAME-TASK attribute restore failed — their reads are withheld
   *  (`notRestored`) exactly like a verify-caught stuck state, because a subject that would not give
   *  its attribute back is a subject whose later samples cannot be trusted either. */
  readonly stuckMembers: ReadonlySet<number>;
}

/** One attribute group driven in page — the same outcome shape as `readGroup`, so a failed force is
 *  a `failure` the caller counts into the withheld population (never an absorbed rejection). */
async function readAttrGroup(page: Page, groupIndex: number, group: HoverAttrGroupRow, candidates: number): Promise<GroupOutcome & { restored: boolean }> {
  try {
    const label = `state-attr group read [${group.attr}]`;
    const raw = pageJsonString(await page.evaluate(`JSON.stringify(window.__orbHover.readAttr(${String(groupIndex)}))`), label);
    const result = groupReadResult(raw, candidates, label);
    const restored = attrRestored(raw, label);
    return { rows: result.reads, shadows: result.shadows, radials: result.radials, failure: null, restored };
  } catch (e) {
    return { rows: [], shadows: [], radials: [], failure: errorMessage(e), restored: true };
  }
}

/** The ATTRIBUTE mechanism's drive: no CDP — each group's force/read/restore is ONE synchronous
 *  in-page task (`window.__orbHover.readAttr`), sequential for the same one-state-at-a-time reason. */
async function forceEveryAttrGroup(page: Page, groups: readonly HoverAttrGroupRow[], candidates: number): Promise<AttrForcedReads> {
  const reads = new Map<number, HoverForcedReadRow>();
  const failures: string[] = [];
  const shadows: GlowShadowInput[] = [];
  const radials: RadialGlowInput[] = [];
  const stuckMembers = new Set<number>();
  let forceFailedMembers = 0;
  let failedGroups = 0;
  let subjectsForced = 0;
  for (const [groupIndex, group] of groups.entries()) {
    if (group.members.length === 0 && group.glows === 0) {
      continue;
    }
    const outcome = await readAttrGroup(page, groupIndex, group, candidates);
    if (outcome.failure !== null) {
      forceFailedMembers += group.members.length;
      failedGroups += 1;
      if (failures.length < FORCE_FAILURE_QUOTES) {
        failures.push(outcome.failure);
      }
      continue;
    }
    subjectsForced += 1;
    for (const row of outcome.rows) {
      reads.set(row.index, row);
      if (outcome.restored !== true) {
        stuckMembers.add(row.index);
      }
    }
    shadows.push(...outcome.shadows);
    radials.push(...outcome.radials);
  }
  return { reads, failures, failedGroups, forceFailedMembers, subjectsForced, shadows, radials, stuckMembers };
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
  // @orb-waive caught-failure-ownership(e): printed as `HOVER REFUSED <why>`, RETURNED as a `broke` outcome, and RENDERED AS EXIT.toolError by run.ts — propagated through both the message and the exit code, so a forced-state pass that failed reddens the audit's verdict rather than being absorbed. END CONDITION: the run reports `hover-contrast` NO VERDICT and exits 2.
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    // Roots the DOM agent so `DOM.requestNode` can push a node the page handed us; depth 0 keeps it from
    // serializing the whole tree back over the wire.
    await cdp.send("DOM.getDocument", { depth: 0 });
    const census = hoverCensusResult(await page.evaluate(HOVER_CENSUS_JS), "the hover census");
    const candidates = census.rest.length;
    const forced = await forceEveryGroup({ page, cdp, nodes: new SubjectNodes(cdp), candidates }, census.groups);
    // The ATTRIBUTE mechanism runs AFTER every CDP hold is released — one state at a time, page-wide.
    const attrForced = await forceEveryAttrGroup(page, census.attrGroups, candidates);
    // THE RELEASE PROOF, on the live page, every run: rest state re-read after the last release —
    // BOTH mechanisms, one candidate space (a stuck data-attribute changes the rest key exactly as a
    // stuck `:hover` did, and the microtask-delayed re-arm class is visible ONLY here). The indices
    // come back through `candidateIndices`, which REFUSES anything that is not one — the seam where a
    // silent `as number[]` once turned this entire branch off.
    const stuckRaw = pageJsonString(await page.evaluate("JSON.stringify(window.__orbHover.verify())"), "hover verify");
    const stuck = new Set([...candidateIndices(stuckRaw, candidates, "hover verify"), ...attrForced.stuckMembers]);
    await page.evaluate("delete window.__orbHover");
    const withheld: Record<string, number> = {};
    bump(withheld, "forceFailed", forced.forceFailedMembers + attrForced.forceFailedMembers);
    const mergedReads = new Map([...forced.reads, ...attrForced.reads]);
    const merged: ForcedReads = { ...forced, reads: mergedReads };
    const inputs = settleInputs(census.rest, merged, stuck, withheld);
    bump(withheld, "unreadableRestColor", census.census.unreadableColor);
    bump(withheld, "forceBudget", census.census.overBudget);
    // The state shapes the forcer refuses to fake a measurement for (samples-hover.ts) — withheld by
    // NAME, so a surface carrying one is a NO VERDICT with a reason, never a false noHoverPaint.
    bump(withheld, "pseudoElementPaint", census.census.pseudoElementPaint);
    bump(withheld, "complexStateSelector", census.census.complexStateSelector);
    bump(withheld, "unresolvableStateSubject", census.census.unresolvableStateSubject);
    // ── #2 POLARITY. `excluded` is a MEASUREMENT proving the rule does not apply; `withheld` is the
    // absence of a measurement. An unreadable stylesheet's state rules were never collected, so every
    // element it would have painted falls into `noHoverPaint` — recording that as `excluded` would file
    // absence-of-measurement as proof-of-inapplicability, the polarity inverted. `noHoverPaint` only
    // earns `excluded` when every sheet was readable AND every selector parsed.
    const paintProven = census.census.sheetsUnreadable === 0 && census.census.unparseableSelectors === 0;
    const excluded: Record<string, number> = {};
    bump(paintProven ? excluded : withheld, paintProven ? "noHoverPaint" : "noHoverPaintUnproven", census.census.noHoverPaint);
    // A subject already IN the forced state at rest: that paint is live and the rest families judge
    // it — a measurement-backed exclusion, never a re-force.
    bump(excluded, "alreadyInState", census.census.alreadyInState);
    const stateShadows = [...forced.shadows, ...attrForced.shadows];
    const stateRadials = [...forced.radials, ...attrForced.radials];
    // The attribute + glow arms' visible receipt (the glow families carry no per-sample accounting
    // channel, so an unresolved glow pair is NAMED here rather than silently dropped).
    print(
      `STATE-PAINT  attr-rules=${String(census.census.attrRules)} attr-subjects-forced=${String(attrForced.subjectsForced)} glow-rules=${String(census.census.glowRules)} glow-state-rows=${String(stateShadows.length + stateRadials.length)} glow-unresolved=${String(census.census.glowUnresolved)}`,
    );
    return {
      samples: {
        ...samples,
        hoverStates: inputs,
        shadowGlows: [...samples.shadowGlows, ...stateShadows],
        radialGlows: [...samples.radialGlows, ...stateRadials],
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
          attrRules: census.census.attrRules,
          attrSubjectsForced: attrForced.subjectsForced,
          unparseableSelectors: census.census.unparseableSelectors,
          subjectsForced: forced.subjectsForced,
          notRestored: stuck.size,
        },
      },
      wallMs: Date.now() - started,
      outcome: { kind: "ran" },
      subjectsForced: forced.subjectsForced,
      forceFailures: [...forced.failures, ...attrForced.failures],
      forceFailedGroups: forced.failedGroups + attrForced.failedGroups,
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

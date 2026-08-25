// domain/automation/engine/analysis-arm — the `run_analysis` executor (S5): ONE quiet schema-constrained
// pass over {the read windows, the rule's stored state, the host's steer} whose outputs route through the
// CLOSED class union (`contract/analysis.ts::ANALYSIS_OUTPUT_CLASSES`) — the exhaustive `Record` below is
// the §3-S5.4 enforcer (a new class fails `tsc` before it can ship unrouted).
//
// THE READ WINDOWS (§3-S5.5, the legacy fresh-vs-settled law): STEER-class outputs read the FRESH
// selected-lineage tip (the pass paces the NEXT turns; its steer is advisory intent, never canon, so swipe
// volatility is irrelevant); the DURABLE-WRITE route reads a SETTLED span behind the protect tail, cursored
// by the state row's HIGH-WATER MARK — advanced ONLY on a successful apply, so a failed or unconfirmed pass
// re-covers its span (what makes C2's re-run idempotency mechanically true; the lore keys are span-stamped
// so the re-covered write UPDATES its own titles).
//
// CONTENT PLANES, the two laws this file is built around:
//   • HOST-authored fields (`brief`, `steer`) are TEMPLATES — rendered through the one arm-render home
//     like every other arm field (host text is macro-legal by design).
//   • MODEL-authored output is DATA (§2 law 6): guidance is stored + delivered VERBATIM (never through
//     `renderArmTemplate`/`processMacros`); text that must enter a macro-EXECUTION plane downstream —
//     lore content into world-info's render, a suggested steer into a guided turn — is
//     `neutralizeMacros`'d at THIS boundary (law 7), so a model-authored `{{getglobalvar}}` survives only
//     as literal braces.
//
// THE NEEDLE WALL (§8b of the C1 design; RULED 2026-08-24): the ONLY analysis output that may reach the
// member-visible vars plane is the CLAMPED NUMERIC score, and only when the host authored `routes.vars`.
// Three tiers: route absence removes `score` from BOTH the wire schema and the server-side zod (a stray key
// from a non-enforcing vehicle is STRIPPED before any applier runs); the applier is gated on the authored
// route; and the write is `String(clampedInt)` — arc/twists/guidance are disjoint fields no code path hands
// to the vars writer.
//
// STATE WRITE DISCIPLINE: every route's SIDE effects run first; the rule-state row is written ONCE at the
// end, and ONLY when no route hard-failed. A failed pass therefore moves nothing durable in the state row —
// the retry re-runs the whole pass, and the span-stamped lore keys make any already-landed entry write an
// UPDATE, not a duplicate.

import { ANALYSIS_GUIDANCE_MAX, ANALYSIS_SCORE_MAX } from "@orb/contracts/automation";
import type { ProseOverrides } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import { projectJsonSchema } from "@orb/kit/json-schema";
import type { VarOp } from "@orb/kit/macro";
import { neutralizeMacros } from "@orb/kit/macro";
import { runStructuredTurn, StructuredOutputError } from "@orb/server/kit/structured-turn";
import { getLog } from "#foundation/observability";
import type {
  AnalysisConfirmAct,
  AnalysisOutputClass,
  AnalysisPayload,
  AnalysisPromptInputs,
  AnalysisRoutes,
  AnalysisState,
  AnalysisWindowRow,
  RunAnalysisAction,
} from "../contract/analysis.ts";
import {
  ANALYSIS_FRESH_WINDOW_MESSAGES,
  ANALYSIS_MESSAGE_CHAR_CAP,
  ANALYSIS_PROTECT_TAIL,
  ANALYSIS_SETTLED_SLICE_MAX,
  buildAnalysisPayloadSchema,
  mergeAnalysisState,
} from "../contract/analysis.ts";
import type { ArmExecutorDeps, ArmOutcome, DispatchFrame } from "../contract/ops.ts";
import { listAnalysisWindow, maxVisibleSeq } from "../persistence/canon-reads.ts";
import { selectRuleState, upsertRuleState } from "../persistence/rule-state.ts";
import { renderArmTemplate } from "../substrate/macro-render.ts";
import { AUTOMATION_SUGGESTION_TTL_MS } from "../substrate/suggestions.ts";
import { applyRuleLoreWrite } from "./lore-write.ts";

/** The wire schema's name tag (OpenAI json_schema.name / Anthropic tool name). */
const RESPONSE_FORMAT_NAME = "run_analysis";
/** A card's quoted-text preview cap — the summary is one line of host prose, not a document. */
const CARD_QUOTE_MAX = 120;

// ── the pass prompts (pure — the golden test pins them) ───────────────────────────────────────────────
// The CLAUSES are PROSE-1 slots (`contracts/automation/prose.ts`, the `automation.analysis.*` family):
// shipped defaults authored FRESH against the legacy director's PROVEN semantics (narrator-not-players ·
// optional-scaffolding/soft-tensions · retire-on-payoff · empty-is-the-common-case · when-in-doubt-do-less),
// host-overridable through the same room-host prose the /autobg pick resolves. One clause per output route:
// the composition below and the enforced response schema move TOGETHER — an un-authored route's ask never
// reaches the model, and its field never exists to fill.

/** Compose the pass's system contract from the ENABLED routes, resolving each clause through the room
 *  host's prose overrides (an absent override = the shipped default bytes). */
export function buildAnalysisSystemPrompt(routes: AnalysisRoutes, prose: ProseOverrides): string {
  return [
    resolveProseText("automation.analysis.lead", prose),
    resolveProseText("automation.analysis.arc", prose),
    routes.steer !== undefined ? resolveProseText("automation.analysis.steer", prose) : "",
    routes.lore !== undefined ? resolveProseText("automation.analysis.lore", prose) : "",
    routes.suggest !== undefined ? resolveProseText("automation.analysis.suggest", prose) : "",
    routes.vars !== undefined ? resolveProseText("automation.analysis.vars", prose) : "",
    resolveProseText("automation.analysis.close", prose),
  ]
    .filter((line) => line.length > 0)
    .join(" ");
}

/** One window row as a transcript line: the character's name when the row has one, else a role label.
 *  Per-message char-capped (prompt budget — one giant message must not evict the window). */
function transcriptLine(row: AnalysisWindowRow): string {
  const speaker = row.speaker ?? (row.role === "user" ? "Player" : "Narrator");
  return `${speaker}: ${row.content.slice(0, ANALYSIS_MESSAGE_CHAR_CAP)}`;
}

/** Assemble the pass's user prompt: brief → host steer → the current private plot → the settled section
 *  (when the lore route reads one) → the fresh tip. Pure + deterministic — the golden test pins it. The
 *  section labels are structural grammar (sub-12-word, the autobg `Scene:` class); the one AUTHORED line
 *  (the cold-start arc ask) is the `automation.analysis.firstArc` slot. */
export function buildAnalysisUserPrompt(inputs: AnalysisPromptInputs, prose: ProseOverrides): string {
  const parts: string[] = [`Your task: ${inputs.brief}`];
  if (inputs.steer.length > 0) {
    parts.push(`Host's standing direction (obey it): ${inputs.steer}`);
  }
  parts.push(inputs.state.arc.length === 0 ? resolveProseText("automation.analysis.firstArc", prose) : `Current private arc: ${inputs.state.arc}`);
  if (inputs.state.twists.length > 0) {
    parts.push(`Active twist bank:\n${inputs.state.twists.map((t) => `- ${t}`).join("\n")}`);
  }
  if (inputs.state.retiredTwists.length > 0) {
    parts.push(`Already-fired/retired twists (do NOT resurrect):\n${inputs.state.retiredTwists.map((t) => `- ${t}`).join("\n")}`);
  }
  if (inputs.settled !== null && inputs.settled.length > 0) {
    parts.push(`SETTLED transcript (distill lore from THIS section only):\n${inputs.settled.map(transcriptLine).join("\n")}`);
  }
  parts.push(`Recent play:\n${inputs.fresh.map(transcriptLine).join("\n")}`);
  return parts.join("\n\n");
}

// ── the pass ──────────────────────────────────────────────────────────────────────────────────────────

/** The routes that are LIVE this pass: the authored routes, minus a lore route whose settled span is empty
 *  (nothing to distill ⇒ the field leaves the schema and the prompt for this pass — the model cannot emit
 *  an output the executor would drop). */
function effectiveRoutes(action: RunAnalysisAction, loreActive: boolean): AnalysisRoutes {
  return {
    ...(action.routes.steer !== undefined ? { steer: action.routes.steer } : {}),
    ...(loreActive && action.routes.lore !== undefined ? { lore: action.routes.lore } : {}),
    ...(action.routes.suggest !== undefined ? { suggest: action.routes.suggest } : {}),
    ...(action.routes.vars !== undefined ? { vars: action.routes.vars } : {}),
  };
}

/** Raise one S4 card carrying a confirm-routed analysis act (the `{via:"analysis"}` payload arm). The same
 *  raise/notify mechanics as the confirm-first arm stash — same store, same TTL, same replace-per-(chat,
 *  rule) slot, which is WHY validation admits at most one confirm-class route per arm (two would silently
 *  replace each other's cards). */
function raiseAnalysisCard(deps: ArmExecutorDeps, frame: DispatchFrame, act: AnalysisConfirmAct, summary: string): void {
  const id = deps.newSuggestionId();
  const expiresAt = frame.now + AUTOMATION_SUGGESTION_TTL_MS;
  const source = { kind: "rule", ruleId: frame.origin.ruleId } as const;
  deps.suggestions.raise({
    id,
    kind: "confirm",
    chatId: frame.chatId,
    source,
    actorUserId: frame.authorUserId,
    summary,
    expiresAt,
    payload: { via: "analysis", act },
  });
  deps.notify({ type: "suggestionRaised", chatId: frame.chatId, source, suggestionId: id, kind: "confirm", summary, expiresAt });
}

/** Quote a model line into a card summary (capped — the card is one line of host prose). */
function quoted(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > CARD_QUOTE_MAX ? `${trimmed.slice(0, CARD_QUOTE_MAX)}…` : trimmed;
}

/** Span-stamp a model entry key: `s<spanStart>.<key>` — a watermark-unmoved RETRY re-produces the same
 *  span start and therefore overwrites its OWN titles (idempotent-on-re-run, the C2 substrate). */
function spanStampedKey(spanStart: number, key: string): string {
  return `s${spanStart}.${key}`;
}

/** What one pass resolved to apply — computed ONCE, then routed class-by-class. */
interface PassResolution {
  readonly payload: AnalysisPayload;
  readonly action: RunAnalysisAction;
  /** The settled span's bounds this pass covered (`null` = no lore read this pass). */
  readonly span: { readonly start: number; readonly end: number } | null;
}

/** A route applier's verdict: `ok` (+ whether it raised a card), or a typed refusal that fails the pass. */
type RouteResult = { readonly ok: true; readonly suggested?: boolean; readonly watermark?: number } | { readonly ok: false; readonly detail: string };

const ROUTE_OK: RouteResult = { ok: true };

/** The per-class appliers — THE exhaustive Record over `AnalysisOutputClass` (§3-S5.4's enforcer: a new
 *  output class fails `tsc` here before it can ship unrouted). `setState` is handled by the caller's single
 *  end-of-pass state write (its "applier" is a no-op marker); the Record still names it so the union and
 *  the routing can never drift silently. */
type RouteApplier = (deps: ArmExecutorDeps, frame: DispatchFrame, pass: PassResolution) => Promise<RouteResult>;

const ROUTE_APPLIERS: Record<AnalysisOutputClass, RouteApplier> = {
  // The state merge is computed and written ONCE at the end of the pass (`finishPass`) — listed here so the
  // class union stays exhaustively routed, not because a per-route write exists.
  setState: () => Promise.resolve(ROUTE_OK),

  // guidance — VERBATIM data. Direct: staged for the end-of-pass state write (the caller reads
  // `payload.guidance`). Confirm: a card whose act carries the exact bytes.
  steer: (deps, frame, pass) => {
    const route = pass.action.routes.steer;
    const guidance = pass.payload.guidance;
    if (route === undefined || guidance === undefined) {
      return Promise.resolve(ROUTE_OK);
    }
    if (route.apply === "confirm" && guidance.trim().length > 0) {
      raiseAnalysisCard(deps, frame, { kind: "steer", guidance: guidance.slice(0, ANALYSIS_GUIDANCE_MAX) }, `Adopt story guidance: “${quoted(guidance)}”?`);
      return Promise.resolve({ ok: true, suggested: true });
    }
    return Promise.resolve(ROUTE_OK); // direct — the end-of-pass state write carries it.
  },

  // The durable-write route. Model bytes are NEUTRALIZED and span-stamped HERE (the write boundary), then
  // pass through the ONE lore belt (`applyRuleLoreWrite` — attach gate + per-rule cap; the same belts the
  // `insert_world_info_entry` arm rides). Direct: apply now + stage the watermark advance. Confirm: stash
  // the RESOLVED entries on a card; the confirm applies through the same belt and THEN advances.
  upsertLoreEntry: async (deps, frame, pass) => {
    const route = pass.action.routes.lore;
    const lore = pass.payload.lore;
    if (route === undefined || lore === undefined || pass.span === null) {
      return ROUTE_OK;
    }
    if (lore.length === 0) {
      // Nothing worth keeping (the common case) — the span is still COVERED: stage the watermark advance
      // so the next pass reads on from here rather than re-reading a span the model already judged empty.
      return { ok: true, watermark: pass.span.end };
    }
    const entries = lore.map((entry) => ({
      entryKey: spanStampedKey(pass.span?.start ?? 0, neutralizeMacros(entry.key)),
      keys: entry.keys.map((k) => neutralizeMacros(k)),
      content: neutralizeMacros(entry.content),
    }));
    if (route.apply === "confirm") {
      raiseAnalysisCard(
        deps,
        frame,
        { kind: "lore", bookId: route.bookId, entries, spanEnd: pass.span.end },
        entries.length === 1 ? `Save a lore entry for “${quoted(lore[0]?.key ?? "")}”?` : `Save ${entries.length} lore entries from the last stretch of play?`,
      );
      // The watermark does NOT advance on a raise — a dismissed/expired card leaves the span uncovered and
      // the next pass re-distills it (the retryability contract, confirm-shaped).
      return { ok: true, suggested: true };
    }
    const written = await applyRuleLoreWrite(deps, {
      authorUserId: frame.authorUserId,
      chatId: frame.chatId,
      ruleId: frame.origin.ruleId,
      bookId: route.bookId,
      entries,
    });
    return written.ok ? { ok: true, watermark: pass.span.end } : { ok: false, detail: written.refused };
  },

  // Model-suggested guided turns — confirm-class BY NATURE. The suggested steer is machine-authored text
  // that will enter the guided-turn plane, so it is neutralized at the stash (law 7).
  suggest: (deps, frame, pass) => {
    const suggestions = pass.payload.suggestions;
    if (pass.action.routes.suggest === undefined || suggestions === undefined || suggestions.length === 0) {
      return Promise.resolve(ROUTE_OK);
    }
    const text = suggestions[0]?.text ?? "";
    raiseAnalysisCard(
      deps,
      frame,
      { kind: "suggestTurn", steerText: neutralizeMacros(text), automationDepth: frame.origin.automationDepth },
      `Ask for a turn: “${quoted(text)}”?`,
    );
    return Promise.resolve({ ok: true, suggested: true });
  },

  // THE NEEDLE'S GATED PUBLICATION (§8b): only reachable when the host AUTHORED the route, and the only
  // bytes that can cross are the clamped integer score — written through the same standalone-variable seam
  // `set_variable` uses, WITH the shared-env write-through (order is semantics for later rules in a batch).
  setVariable: async (deps, frame, pass) => {
    const route = pass.action.routes.vars;
    const score = pass.payload.score;
    if (route === undefined || score === undefined) {
      return ROUTE_OK;
    }
    const clamped = Math.min(ANALYSIS_SCORE_MAX, Math.max(0, Math.round(score)));
    const value = String(clamped);
    const ops: readonly VarOp[] = [{ op: "set", key: route.key, value }];
    await deps.ops.chat.applyVariableOps(frame.chatId, ops);
    frame.env.vars[route.key] = value; // the write-through law (`arm-executors.ts::writeArmVariable`).
    return ROUTE_OK;
  },
};

/** Fixed apply order: durable/lore first (its failure must abort BEFORE any card or var moves), then the
 *  card-raising routes, then vars; the ONE state write happens after every route succeeded. `setState` is
 *  ordered but a no-op (see the Record). */
const ROUTE_ORDER: readonly AnalysisOutputClass[] = ["upsertLoreEntry", "steer", "suggest", "setVariable", "setState"];

/** The pass's read half: current state + the fresh tip + (lore route only) the settled span. */
interface PassInputs {
  readonly state: AnalysisState;
  readonly fresh: readonly AnalysisWindowRow[];
  readonly settled: readonly AnalysisWindowRow[] | null;
  readonly span: PassResolution["span"];
}

async function readPassInputs(deps: ArmExecutorDeps, action: RunAnalysisAction, frame: DispatchFrame): Promise<PassInputs> {
  const { state } = await selectRuleState(deps.db, frame.origin.ruleId);
  const fresh = await listAnalysisWindow(deps.db, frame.chatId, { limit: ANALYSIS_FRESH_WINDOW_MESSAGES });
  if (action.routes.lore === undefined) {
    return { state, fresh, settled: null, span: null };
  }
  const maxSeq = await maxVisibleSeq(deps.db, frame.chatId);
  const through = maxSeq === null ? null : maxSeq - ANALYSIS_PROTECT_TAIL;
  if (through === null || through <= state.settledThroughSeq) {
    return { state, fresh, settled: null, span: null };
  }
  const settled = await listAnalysisWindow(deps.db, frame.chatId, {
    afterSeq: state.settledThroughSeq,
    throughSeq: through,
    limit: ANALYSIS_SETTLED_SLICE_MAX,
  });
  return { state, fresh, settled, span: settled.length > 0 ? { start: state.settledThroughSeq, end: through } : null };
}

/** Run the model pass (ONE bounded retry — `runStructuredTurn`) and validate through the SAME composed zod
 *  the wire schema projects from: the two halves of the needle wall are one composition. Throws on the
 *  second failure — the caller maps it to a typed `arm_error`. */
function runModelPass(
  deps: ArmExecutorDeps,
  frame: DispatchFrame,
  args: { readonly routes: AnalysisRoutes; readonly systemPrompt: string; readonly userPrompt: string },
): Promise<AnalysisPayload> {
  const payloadSchema = buildAnalysisPayloadSchema(args.routes);
  const responseFormat: ResponseFormat = { name: RESPONSE_FORMAT_NAME, schema: projectJsonSchema(payloadSchema) };
  return runStructuredTurn<AnalysisPayload>({
    payloadSchema,
    run: (correction) =>
      deps.ops
        .summarizeQuiet({
          authorUserId: frame.authorUserId,
          chatId: frame.chatId,
          systemPrompt: args.systemPrompt,
          prompt:
            correction === undefined
              ? args.userPrompt
              : // PROSE-OK: the bounded-retry correction frame — structural validation plumbing around the zod issue summary (the runStructuredTurn convention), never host voice
                `${args.userPrompt}\n\nYour previous reply failed validation (${correction}). Return a corrected JSON object.`,
          posture: "rule_analysis",
          responseFormat,
        })
        .then((r) => r.text),
    onRetry: (summary) => {
      // Metadata only (issue count + schema paths) — never the model's own words (RP content).
      getLog().info({ ruleId: frame.origin.ruleId, issueCount: summary.issueCount, paths: summary.paths }, "run_analysis: bounded structured retry");
    },
  });
}

/** Apply the routes in the fixed order, sequentially (recursion, not a loop — the house sequential-await
 *  idiom): the FIRST failure aborts the pass before any state write. Folds the two accumulator bits. */
async function applyRoutes(
  deps: ArmExecutorDeps,
  frame: DispatchFrame,
  pass: PassResolution,
  from: { readonly i: number; readonly suggested: boolean; readonly watermark: number },
): Promise<{ readonly ok: true; readonly suggested: boolean; readonly watermark: number } | { readonly ok: false; readonly detail: string }> {
  const cls = ROUTE_ORDER[from.i];
  if (cls === undefined) {
    return { ok: true, suggested: from.suggested, watermark: from.watermark };
  }
  const result = await ROUTE_APPLIERS[cls](deps, frame, pass);
  if (!result.ok) {
    return { ok: false, detail: result.detail };
  }
  return applyRoutes(deps, frame, pass, {
    i: from.i + 1,
    suggested: from.suggested || result.suggested === true,
    watermark: result.watermark ?? from.watermark,
  });
}

/** The `run_analysis` executor — invoked from the `runArm` switch. */
export async function runRunAnalysis(deps: ArmExecutorDeps, action: RunAnalysisAction, frame: DispatchFrame): Promise<ArmOutcome> {
  // 1. The HOST-authored fields render as templates (host text is macro-legal; the arm-field discipline).
  const brief = renderArmTemplate({ env: frame.env, nowMs: frame.now, prng: deps.prng, template: action.brief });
  if (brief.error !== undefined) {
    return { ok: false, kind: "arm_error", detail: brief.error };
  }
  const steer = action.steer === undefined ? { text: "" } : renderArmTemplate({ env: frame.env, nowMs: frame.now, prng: deps.prng, template: action.steer });
  if (steer.error !== undefined) {
    return { ok: false, kind: "arm_error", detail: steer.error };
  }

  // 2. State + windows (§3-S5.5), then the pass over the LIVE routes (an empty settled span silently
  // removes the lore field from schema AND prompt for this pass). The prompt clauses resolve through the
  // ROOM HOST's prose (the /autobg posture — PROSE-1 owner-decision 8, option (a)).
  const inputs = await readPassInputs(deps, action, frame);
  const routes = effectiveRoutes(action, inputs.span !== null);
  const prose = await deps.ops.chat.resolveChatProse(frame.chatId);
  let payload: AnalysisPayload;
  try {
    payload = await runModelPass(deps, frame, {
      routes,
      systemPrompt: buildAnalysisSystemPrompt(routes, prose),
      userPrompt: buildAnalysisUserPrompt(
        {
          brief: brief.text ?? "",
          steer: steer.text ?? "",
          state: inputs.state,
          fresh: inputs.fresh,
          settled: inputs.settled,
        },
        prose,
      ),
    });
  } catch (err) {
    // A failing pass is a real fault worth the error budget (a rule that can only ever fail should
    // eventually auto-disable) — and it moves NOTHING durable: no state write happened yet.
    const detail = err instanceof StructuredOutputError ? `run_analysis: ${err.issues}` : `run_analysis: ${err instanceof Error ? err.message : String(err)}`;
    return { ok: false, kind: "arm_error", detail };
  }

  // 3. Route the outputs; first failure aborts with no state write.
  const pass: PassResolution = { payload, action, span: inputs.span };
  const routed = await applyRoutes(deps, frame, pass, { i: 0, suggested: false, watermark: inputs.state.settledThroughSeq });
  if (!routed.ok) {
    return { ok: false, kind: "arm_error", detail: routed.detail };
  }

  // 4. The ONE state write: the merged banks + the (possibly advanced) watermark + — when the steer route
  // applies DIRECT — the verbatim guidance ("" clears; each pass replaces it wholesale).
  const merged = mergeAnalysisState(inputs.state, payload);
  const steerDirect = action.routes.steer !== undefined && action.routes.steer.apply === "direct" && payload.guidance !== undefined;
  await upsertRuleState(deps.db, {
    ruleId: frame.origin.ruleId,
    state: { arc: merged.arc, twists: merged.twists, retiredTwists: merged.retiredTwists, settledThroughSeq: routed.watermark },
    ...(steerDirect ? { guidance: payload.guidance } : {}),
    nowMs: frame.now,
  });

  return routed.suggested ? { ok: true, suggested: true } : { ok: true };
}

// The CONFIRM side of the `{via:"analysis"}` payload arm lives in `substrate/analysis-confirm.ts` — the
// verb-facing mediation surface (`domain-substrate-mediates-subsystems`: a verb reaches a named subsystem
// only through substrate/, and the confirm verb is its one caller).

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
// so the re-covered write UPDATES its own titles). #1416 refined the SETTLED read's slice end: cold keeps
// the recorded freshest-slice posture, warm reads the earliest slice and covers only what it read — the
// argument is at `readPassInputs`.
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
// STATE WRITE DISCIPLINE: every route's SIDE effects run first; the rule-state row's CONCLUSIONS (arc,
// twists, guidance) are written ONCE at the end, and ONLY when no route hard-failed. A failed pass
// therefore moves none of them — the retry re-runs the whole pass. The WATERMARK is not a conclusion and
// does not follow that rule: it is monotonic, owned by `persistence/rule-state.ts`, and no writer on any
// path may drag it backwards (#1543).
//
// WITH ONE EXCEPTION, AND IT IS THE ORIGINAL RULE'S OWN PREMISE FAILING (#1418). The discipline above was
// justified by "the span-stamped lore keys make any already-landed entry write an UPDATE, not a duplicate".
// That is true of an IDENTICAL key and false of a retry: the re-run is a fresh model call over the same span
// and its differently-worded keys land BESIDE the originals. So the ONE route that commits durable bytes
// into another domain's store — the lore write — records its coverage AT THE COMMIT (an atomic monotonic
// `advanceSettledWatermark` on that one JSON path), not at the end of the pass. Everything else about the
// discipline stands: the pass's CONCLUSIONS (arc, twists, guidance) still write once, at the end, only when
// no route failed. See the `upsertLoreEntry` applier.

import type { SuggestionCardDetail } from "@orb/contracts/automation";
import { ANALYSIS_GUIDANCE_MAX, ANALYSIS_REWRITE_MAX, ANALYSIS_SCORE_MAX } from "@orb/contracts/automation";
import type { ProseOverrides } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import { projectJsonSchema } from "@orb/kit/json-schema";
import type { VarOp } from "@orb/kit/macro";
import { neutralizeMacros, setVarKey } from "@orb/kit/macro";
import { sha256Hex } from "@orb/server/kit/content-hash";
import { runStructuredTurn, StructuredOutputError } from "@orb/server/kit/structured-turn";
import { getLog } from "#foundation/observability";
import type {
  AnalysisAuditTarget,
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
import type { ArmExecutorDeps, ArmOutcome, ChatScopedDispatchFrame } from "../contract/ops.ts";
import { latestAuditableReply, listAnalysisWindow, maxVisibleSeq } from "../persistence/canon-reads.ts";
import { advanceSettledWatermark, commitPassState, selectRuleState } from "../persistence/rule-state.ts";
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
 *  host's prose overrides (an absent override = the shipped default bytes).
 *
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export function buildAnalysisSystemPrompt(routes: AnalysisRoutes, prose: ProseOverrides): string {
  return [
    resolveProseText("automation.analysis.lead", prose),
    resolveProseText("automation.analysis.arc", prose),
    routes.steer !== undefined ? resolveProseText("automation.analysis.steer", prose) : "",
    routes.lore !== undefined ? resolveProseText("automation.analysis.lore", prose) : "",
    routes.suggest !== undefined ? resolveProseText("automation.analysis.suggest", prose) : "",
    routes.rewrite !== undefined ? resolveProseText("automation.analysis.rewrite", prose) : "",
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
 *  (the cold-start arc ask) is the `automation.analysis.firstArc` slot.
 *
 *  @public Test-anchored module surface; the golden prompt test is its only cross-module reader. */
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
  // C3's audited reply goes LAST — it is the thing the pass is asked about, and the recency of a prompt's
  // final section is the cheapest steering there is. The label is the token the rewrite clause names.
  if (inputs.audited !== null) {
    parts.push(`AUDITED REPLY (audit THIS text, not the play above):\n${inputs.audited.content}`);
  }
  return parts.join("\n\n");
}

// ── the pass ──────────────────────────────────────────────────────────────────────────────────────────

/** The routes that are LIVE this pass: the authored routes, minus the two whose INPUT is absent this beat — a
 *  lore route with an empty settled span, and a rewrite route with no auditable reply. In both cases the field
 *  leaves the schema AND the prompt, so the model cannot emit an output the executor would only drop. */
function effectiveRoutes(action: RunAnalysisAction, live: { readonly lore: boolean; readonly rewrite: boolean }): AnalysisRoutes {
  return {
    ...(action.routes.steer !== undefined ? { steer: action.routes.steer } : {}),
    ...(live.lore && action.routes.lore !== undefined ? { lore: action.routes.lore } : {}),
    ...(action.routes.suggest !== undefined ? { suggest: action.routes.suggest } : {}),
    ...(live.rewrite && action.routes.rewrite !== undefined ? { rewrite: action.routes.rewrite } : {}),
    ...(action.routes.vars !== undefined ? { vars: action.routes.vars } : {}),
  };
}

/** Raise one S4 card carrying a confirm-routed analysis act (the `{via:"analysis"}` payload arm). The same
 *  raise/notify mechanics as the confirm-first arm stash — same store, same TTL, same replace-per-(chat,
 *  rule) slot, which is WHY validation admits at most one confirm-class route per arm (two would silently
 *  replace each other's cards). */
function raiseAnalysisCard(
  deps: ArmExecutorDeps,
  frame: ChatScopedDispatchFrame,
  card: { readonly act: AnalysisConfirmAct; readonly summary: string; readonly detail?: SuggestionCardDetail },
): void {
  const { act, summary, detail } = card;
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
  // The DETAIL rides the event only — the pending record's own executable half is `act`, and duplicating the
  // display strings into the store would give a card two sources of truth about what it is offering.
  deps.notify({
    type: "suggestionRaised",
    chatId: frame.chatId,
    source,
    suggestionId: id,
    kind: "confirm",
    summary,
    expiresAt,
    ...(detail === undefined ? {} : { detail }),
  });
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
  /** C3 — the reply this pass audited (`null` = no rewrite route, or nothing auditable). Carried onto the
   *  RESOLUTION rather than re-read at apply time on purpose: the card must pin the variant the MODEL saw,
   *  not whatever is selected by the time the applier runs. */
  readonly audited: AnalysisAuditTarget | null;
}

/** A route applier's verdict: `ok` (+ whether it raised a card), or a typed refusal that fails the pass. */
type RouteResult = { readonly ok: true; readonly suggested?: boolean; readonly watermark?: number } | { readonly ok: false; readonly detail: string };

const ROUTE_OK: RouteResult = { ok: true };

/** The per-class appliers — THE exhaustive Record over `AnalysisOutputClass` (§3-S5.4's enforcer: a new
 *  output class fails `tsc` here before it can ship unrouted). `setState` is handled by the caller's single
 *  end-of-pass state write (its "applier" is a no-op marker); the Record still names it so the union and
 *  the routing can never drift silently. */
type RouteApplier = (deps: ArmExecutorDeps, frame: ChatScopedDispatchFrame, pass: PassResolution) => Promise<RouteResult>;

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
      raiseAnalysisCard(deps, frame, {
        act: { kind: "steer", guidance: guidance.slice(0, ANALYSIS_GUIDANCE_MAX) },
        summary: `Adopt story guidance: “${quoted(guidance)}”?`,
      });
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
      raiseAnalysisCard(deps, frame, {
        act: { kind: "lore", bookId: route.bookId, entries, spanEnd: pass.span.end },
        summary:
          entries.length === 1
            ? `Save a lore entry for “${quoted(lore[0]?.key ?? "")}”?`
            : `Save ${entries.length} lore entries from the last stretch of play?`,
      });
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
    if (!written.ok) {
      return { ok: false, detail: written.refused };
    }
    // #1418 — THE COVERAGE RECORD RIDES WITH THE COMMIT. These bytes are now in a world book: another
    // domain's store, reached through an injected op, with no transaction that could also carry this
    // domain's state row. Leaving the mark for the end of the pass meant any later failure — a card raise,
    // a variable write, the state write itself — aborted with the lore committed and the span still
    // uncovered, and the next pass re-distilled it. The old idempotency argument (span-stamped keys make a
    // re-cover an UPDATE) only holds for IDENTICAL keys; a retry is a fresh model call, so its differently
    // worded keys land BESIDE the originals as divergent duplicates. So the watermark is advanced HERE,
    // monotonically and on its own JSON path, the moment the write it describes has landed. The end-of-pass
    // write sets the same value again (idempotent) along with the pass's conclusions.
    await advanceSettledWatermark(deps.db, { ruleId: frame.origin.ruleId, throughSeq: pass.span.end, nowMs: frame.now });
    return { ok: true, watermark: pass.span.end };
  },

  // Model-suggested guided turns — confirm-class BY NATURE. The suggested steer is machine-authored text
  // that will enter the guided-turn plane, so it is neutralized at the stash (law 7).
  suggest: (deps, frame, pass) => {
    const suggestions = pass.payload.suggestions;
    if (pass.action.routes.suggest === undefined || suggestions === undefined || suggestions.length === 0) {
      return Promise.resolve(ROUTE_OK);
    }
    const text = suggestions[0]?.text ?? "";
    raiseAnalysisCard(deps, frame, {
      act: { kind: "suggestTurn", steerText: neutralizeMacros(text), automationDepth: frame.origin.automationDepth },
      summary: `Ask for a turn: “${quoted(text)}”?`,
    });
    return Promise.resolve({ ok: true, suggested: true });
  },

  // C3 — THE PROSE AUDIT. Confirm-class by nature: it offers a rewrite of SETTLED CANON, which is never a
  // direct write. Three things happen here and nowhere else:
  //   • the CLEAN verdict draws nothing — the common case, and the reason the verdict is a field rather than
  //     an inference from an empty string (`contract/analysis.ts::analysisRewriteSchema`);
  //   • the model's bytes are NEUTRALIZED at this boundary (law 7) before they can be stashed, so a
  //     model-authored `{{getglobalvar::…}}` can never become live macro syntax in a message row;
  //   • the act is PINNED to the audited (messageId, variantId) and HASHED over the exact bytes the audit
  //     read. Both pins are re-checked inside the chat verb at confirm — a swipe refuses `superseded`, an
  //     edit refuses `stale`, and neither touches canon (§3-S4 class 1's stale-accept guard).
  suggestRewrite: (deps, frame, pass) => {
    const rewrite = pass.payload.rewrite;
    const audited = pass.audited;
    if (pass.action.routes.rewrite === undefined || rewrite === undefined || audited === null) {
      return Promise.resolve(ROUTE_OK);
    }
    const after = neutralizeMacros(rewrite.text).trim();
    // A "flawed" verdict with no rewrite — or one that reproduces the reply verbatim — has nothing to offer,
    // and a card whose confirm would be a no-op teaches a host to stop reading cards. Treated as clean.
    if (rewrite.verdict !== "flawed" || after.length === 0 || after === audited.content) {
      return Promise.resolve(ROUTE_OK);
    }
    const issue = rewrite.issue.trim();
    raiseAnalysisCard(deps, frame, {
      act: {
        kind: "rewrite",
        messageId: audited.messageId,
        variantId: audited.variantId,
        contentHash: sha256Hex(audited.content),
        content: after,
      },
      summary: issue.length === 0 ? "Fix the prose of the last reply?" : `Fix the last reply — ${quoted(issue)}?`,
      detail: { kind: "rewrite", before: audited.content, after },
    });
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
    // The write-through law (`arm-executors.ts::writeArmVariable`), through the plane's OWN-key writer
    // (#1564): a route key of `__proto__` written with property syntax lands nowhere at all.
    setVarKey(frame.env.vars, route.key, value);
    return ROUTE_OK;
  },
};

/** Fixed apply order: durable/lore first (its failure must abort BEFORE any card or var moves), then the
 *  card-raising routes, then vars; the ONE state write happens after every route succeeded. `setState` is
 *  ordered but a no-op (see the Record). */
const ROUTE_ORDER: readonly AnalysisOutputClass[] = ["upsertLoreEntry", "steer", "suggest", "suggestRewrite", "setVariable", "setState"];

/** The pass's read half: current state + the fresh tip + (lore route only) the settled span. */
interface PassInputs {
  readonly state: AnalysisState;
  readonly fresh: readonly AnalysisWindowRow[];
  readonly settled: readonly AnalysisWindowRow[] | null;
  readonly span: PassResolution["span"];
  readonly audited: AnalysisAuditTarget | null;
}

/** C3's read: the FRESH tip's newest reply (§3-S5.5 — a prose audit is a steer-class read, so it takes the
 *  volatile selected-lineage tip; auditing behind a protect tail would offer to fix a reply the host stopped
 *  looking at three beats ago). `null` when the route is off, the room has no reply, or the reply is LONGER
 *  than a rewrite may be — the last one matters: the model would have to return a corrected copy capped at
 *  `ANALYSIS_REWRITE_MAX`, so auditing a longer reply could only ever produce a truncated "fix". */
async function readAuditTarget(deps: ArmExecutorDeps, action: RunAnalysisAction, frame: ChatScopedDispatchFrame): Promise<AnalysisAuditTarget | null> {
  if (action.routes.rewrite === undefined) {
    return null;
  }
  const target = await latestAuditableReply(deps.db, frame.chatId);
  return target !== null && target.content.length <= ANALYSIS_REWRITE_MAX ? target : null;
}

async function readPassInputs(deps: ArmExecutorDeps, action: RunAnalysisAction, frame: ChatScopedDispatchFrame): Promise<PassInputs> {
  const { state } = await selectRuleState(deps.db, frame.origin.ruleId);
  const fresh = await listAnalysisWindow(deps.db, frame.chatId, { limit: ANALYSIS_FRESH_WINDOW_MESSAGES });
  const audited = await readAuditTarget(deps, action, frame);
  if (action.routes.lore === undefined) {
    return { state, fresh, settled: null, span: null, audited };
  }
  const maxSeq = await maxVisibleSeq(deps.db, frame.chatId);
  const through = maxSeq === null ? null : maxSeq - ANALYSIS_PROTECT_TAIL;
  if (through === null || through <= state.settledThroughSeq) {
    return { state, fresh, settled: null, span: null, audited };
  }
  // #1416 — THE RULING SURVIVES, ITS INPUT CHANGED. The recorded posture ("a cold start over a long chat
  // reads what is freshest and the watermark still advances over the whole span", `canon-reads.ts`) is kept
  // EXACTLY for a COLD start: no prior mark, an arbitrarily deep backlog, and the useful answer is the recent
  // arc rather than a distillation of a chat's first hour. But a WARM pass is a CURSOR, and the same slice
  // rule there is not a posture — it is data loss: the pass took the NEWEST 300 of the bounded span and then
  // moved the mark to the span's END, so every older row in that span was skipped by this pass and is
  // unreachable to every later one (they all start after the mark). Whenever the settled span outgrew
  // ANALYSIS_SETTLED_SLICE_MAX between passes — a long backlog, a slow cadence — the middle of the story was
  // silently never analyzed.
  //
  // So the CONDITION changed, not the mechanism: cold keeps the freshest slice and covers the whole span;
  // warm reads the EARLIEST slice ascending and covers only what it actually read. `span.end` is therefore
  // the LAST SEQ RETURNED on EVERY warm pass — not only a truncated one. That is deliberate and it is the
  // cheaper rule: when the read was complete the last row IS the newest row at or below `through`, so the
  // only gap it leaves is a stretch that holds no ingestible rows, which the next pass re-reads for free
  // and finds empty. Deriving the end from the DATA rather than from the requested bound means the mark can
  // never claim coverage of a row the model was not shown. Only a COLD pass ends at `through`.
  const cold = state.settledThroughSeq <= NO_SETTLED_WATERMARK;
  const settled = await listAnalysisWindow(deps.db, frame.chatId, {
    afterSeq: state.settledThroughSeq,
    throughSeq: through,
    limit: ANALYSIS_SETTLED_SLICE_MAX,
    slice: cold ? "newest" : "earliest",
  });
  const lastRead = settled.at(-1)?.seq ?? through;
  const end = cold ? through : lastRead;
  return { state, fresh, settled, span: settled.length > 0 ? { start: state.settledThroughSeq, end } : null, audited };
}

/** A rule whose state row has never recorded a covered span — a COLD analysis start (`EMPTY_ANALYSIS_STATE`
 *  seeds the watermark at 0, and seq numbering starts at 1, so 0 is "no pass has covered anything"). */
const NO_SETTLED_WATERMARK = 0;

/** Run the model pass (ONE bounded retry — `runStructuredTurn`) and validate through the SAME composed zod
 *  the wire schema projects from: the two halves of the needle wall are one composition. Throws on the
 *  second failure — the caller maps it to a typed `arm_error`. */
function runModelPass(
  deps: ArmExecutorDeps,
  frame: ChatScopedDispatchFrame,
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
              : // @orb-waive no-hardcoded-model-prose(n): the bounded-retry correction frame — structural validation plumbing around the zod issue summary (the runStructuredTurn convention), never host voice
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
  frame: ChatScopedDispatchFrame,
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

/** The `run_analysis` executor — invoked from the `runArm` switch, which has already PROVEN the frame has a
 *  room ({@link ChatScopedDispatchFrame}). That narrowing is why nothing below re-asks: `run_analysis` is
 *  `chat-required` in the contracts scope Record, every window it thinks over is a chat-scoped canon read,
 *  and a `null` chat here would be a dozen separate reads each free to answer it differently. */
export async function runRunAnalysis(deps: ArmExecutorDeps, action: RunAnalysisAction, frame: ChatScopedDispatchFrame): Promise<ArmOutcome> {
  // 1. The HOST-authored fields render as templates (host text is macro-legal; the arm-field discipline).
  const brief = renderArmTemplate({ env: frame.env, chatScoped: true, nowMs: frame.now, prng: deps.prng, template: action.brief });
  if (brief.error !== undefined) {
    return { ok: false, kind: "arm_error", detail: brief.error };
  }
  const steer =
    action.steer === undefined
      ? { text: "" }
      : renderArmTemplate({ env: frame.env, chatScoped: true, nowMs: frame.now, prng: deps.prng, template: action.steer });
  if (steer.error !== undefined) {
    return { ok: false, kind: "arm_error", detail: steer.error };
  }

  // 2. State + windows (§3-S5.5), then the pass over the LIVE routes (an empty settled span silently
  // removes the lore field from schema AND prompt for this pass). The prompt clauses resolve through the
  // ROOM HOST's prose (the /autobg posture — PROSE-1 owner-decision 8, option (a)).
  const inputs = await readPassInputs(deps, action, frame);
  const routes = effectiveRoutes(action, { lore: inputs.span !== null, rewrite: inputs.audited !== null });
  const prose = await deps.ops.chat.resolveChatProse(frame.chatId);
  let payload: AnalysisPayload;
  try {
    payload = await runModelPass(deps, frame, {
      routes,
      systemPrompt: buildAnalysisSystemPrompt(routes, prose),
      userPrompt: buildAnalysisUserPrompt(
        {
          // Both are NARROWED non-undefined by the `error` guards above (`ArmRender` is a two-arm union), so
          // the `?? ""` fallbacks they carried were dead conditionals — an eslint red on HEAD, cleared here
          // because this landing touches the lines either way.
          brief: brief.text,
          steer: steer.text,
          state: inputs.state,
          fresh: inputs.fresh,
          settled: inputs.settled,
          audited: inputs.audited,
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
  const pass: PassResolution = { payload, action, span: inputs.span, audited: inputs.audited };
  const routed = await applyRoutes(deps, frame, pass, { i: 0, suggested: false, watermark: inputs.state.settledThroughSeq });
  if (!routed.ok) {
    return { ok: false, kind: "arm_error", detail: routed.detail };
  }

  // 4. The ONE state write: the merged banks + the (possibly advanced) watermark + — when the steer route
  // applies DIRECT — the verbatim guidance ("" clears; each pass replaces it wholesale).
  //
  // THROUGH `commitPassState`, NOT A FAITHFUL BLOB WRITE (#1543 — the other half of #1418). `routed.watermark`
  // is seeded from the mark this pass READ at step 2, and the pass is long: a host who confirms a lore card
  // while the model call is in flight advances the mark through `advanceSettledWatermark`, and writing the
  // blob faithfully here silently REVERTED that confirm — the next pass then re-distilled a span the host had
  // already accepted, which is the exact divergent-duplicate outcome #1418 exists to prevent. The banks and
  // guidance still write wholesale (they are this pass's conclusions); only the mark takes `max(stored, ours)`.
  const merged = mergeAnalysisState(inputs.state, payload);
  const steerDirect = action.routes.steer !== undefined && action.routes.steer.apply === "direct" && payload.guidance !== undefined;
  await commitPassState(deps.db, {
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

// domain/automation/contract/analysis — the `run_analysis` arm's INTERNAL shapes (S5,
// interaction-direction-spec §3-S5; the honest carrier of the purged crew director's think-first pass —
// semantics carried from a whole-file read of `legacy-main:.../crew/{contract,members}/director.ts`, never
// string-ported). Three planes live here, each with its enforcer:
//
//   • the STORED STATE (`automation_rule_state.state`, parse-on-read). VERSION POSTURE (orchestrator ruling
//     2026-08-24): "corrupt" means UNPARSEABLE, never merely old — every field carries a default AND a
//     per-field `.catch`, so a row written before a field existed (or with one damaged field) reads with
//     that field defaulted and its WATERMARK PRESERVED; only non-object garbage resets whole. A reset
//     watermark is the SAFE direction (0 = re-cover the span, duplicating work but never skipping one).
//   • the MODEL PAYLOAD — COMPOSED from the arm's enabled routes (`buildAnalysisPayloadSchema`), which is
//     the xgrammar lever AND a needle wall: an un-authored route's field is absent from the enforced wire
//     schema (the model cannot emit it on an enforcing vehicle) and absent from THIS zod (a non-enforcing
//     vehicle's stray key is STRIPPED server-side before any applier sees it). The needle's `score` is the
//     ONLY field that may reach the member-visible vars plane, and it is a NUMBER — arcs/twists/guidance
//     are disjoint string fields no code path hands to the vars writer (F6's wall as a type).
//   • the OUTPUT-CLASS union (`ANALYSIS_OUTPUT_CLASSES`) — the executor routes through an exhaustive
//     `Record<AnalysisOutputClass, …>` (`engine/analysis-arm.ts`), so a new class fails `tsc` (§3-S5.4).
//
// The twist-bank MERGE is here as a pure function with property tests: RETIRES apply first (freeing the
// bank before adds — the legacy D93 Finding-2 posture: an arc-completion pass retires the spent set AND
// seeds the successor in one pass), then ADDS dedup + fill to `ANALYSIS_TWIST_CAP`, overflow dropped.

import type { AutomationAction } from "@orb/contracts/automation";
import { ANALYSIS_SCORE_MAX } from "@orb/contracts/automation";
import type { AutomationRuleId, ChatId, UserId, WorldBookId } from "@orb/kit/ids";
import { z } from "zod";

/** The `run_analysis` arm as stored/dispatched (the parsed schema member — one home, derived). */
export type RunAnalysisAction = Extract<AutomationAction, { type: "run_analysis" }>;
/** The arm's per-route configuration — absence is the off switch (§3-S5.4). */
export type AnalysisRoutes = RunAnalysisAction["routes"];

// ── caps (named — noMagicNumbers) ─────────────────────────────────────────────────────────────────────
/** The active twist bank's DURABLE ceiling (legacy `TWIST_CAP` — adds beyond it drop, retires free slots). */
export const ANALYSIS_TWIST_CAP = 6;
/** The retired bank's FIFO ceiling — old retirements age out; the bank exists to stop resurrections, and a
 *  twist retired 24 entries ago is no longer a live resurrection risk. */
export const ANALYSIS_RETIRED_CAP = 24;
/** Per-pass twist-op bound (a wire-stripped post-parse belt — the durable bank cap is the real wall). */
const TWIST_OPS_PER_PASS = 8;
/** One arc / one twist is a sentence-class string, not prose. */
const ARC_MAX = 400;
const TWIST_MAX = 200;
/** The lore route's per-pass entry bound — a settled span distills to a few keyed facts, not a chapter. */
const LORE_PER_PASS = 4;
const LORE_KEY_MAX = 120;
const LORE_KEYS_MAX = 8;
const LORE_KEYWORD_MAX = 64;
const LORE_CONTENT_MAX = 4000;
/** ONE suggestion per pass, structurally: the S4 store REPLACES per `(chatId, ruleId)` slot, so a second
 *  card from the same pass would silently eat the first — the schema does not offer the model the option. */
const SUGGESTIONS_PER_PASS = 1;
const SUGGESTION_TEXT_MAX = 300;

/** The FRESH read window — the swipe-volatile tip the STEER routes read (legacy
 *  `DIRECTOR_WINDOW_MESSAGES`): the pass is pacing the NEXT turns, so volatility is irrelevant — its steer
 *  outputs are advisory intent, never canon. */
export const ANALYSIS_FRESH_WINDOW_MESSAGES = 64;
/** The protect tail DURABLE-WRITE routes stay behind (legacy `PROTECT_TAIL`): the newest N messages are
 *  swipe/edit-volatile, so settled-span reads stop short of them and a rare deep edit self-heals on the
 *  next pass. */
export const ANALYSIS_PROTECT_TAIL = 16;
/** The settled-span slice cap (legacy `KEEPER_SLICE_MAX_MESSAGES`) — bounds a first pass over a long
 *  pre-existing chat; steady-state spans are cadence-sized, so this only bites the cold start. */
export const ANALYSIS_SETTLED_SLICE_MAX = 300;
/** Per-message char cap inside a window transcript (prompt budget — a wall of one giant message must not
 *  evict the rest of the window). */
export const ANALYSIS_MESSAGE_CHAR_CAP = 800;

// ── the stored state ──────────────────────────────────────────────────────────────────────────────────
/** The `automation_rule_state.state` blob, parsed. `settledThroughSeq` is the C2 HIGH-WATER MARK: the
 *  settled-span cursor, advanced ONLY on a successful durable apply (`engine/analysis-arm.ts`), so a
 *  failed / unconfirmed pass re-covers its span (the legacy retryability contract). */
export interface AnalysisState {
  readonly arc: string;
  readonly twists: readonly string[];
  readonly retiredTwists: readonly string[];
  readonly settledThroughSeq: number;
}

/** Parse-on-read with the ruled version posture (header): per-field defaults + per-field `.catch`, so a
 *  missing or damaged FIELD degrades alone and the watermark survives everything short of garbage. */
const analysisStateSchema = z.object({
  arc: z.string().catch("").default(""),
  twists: z.array(z.string()).readonly().catch([]).default([]),
  retiredTwists: z.array(z.string()).readonly().catch([]).default([]),
  settledThroughSeq: z.number().int().nonnegative().catch(0).default(0),
});

export const EMPTY_ANALYSIS_STATE: AnalysisState = { arc: "", twists: [], retiredTwists: [], settledThroughSeq: 0 };

/** Read a stored blob into `AnalysisState`. Only a non-object / unparseable blob resets WHOLE (the safe
 *  direction — watermark 0 re-covers, never skips); anything object-shaped reads field-by-field. */
export function parseAnalysisState(raw: unknown): AnalysisState {
  const parsed = analysisStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_ANALYSIS_STATE;
}

// ── the output-class union (the closed routing vocabulary — §3-S5.4) ─────────────────────────────────
/** Every class a pass's output routes through. The executor holds an exhaustive
 *  `Record<AnalysisOutputClass, …>` — a new class fails `tsc` there before it can ship unrouted. */
const ANALYSIS_OUTPUT_CLASSES = ["setState", "steer", "upsertLoreEntry", "suggest", "setVariable"] as const;
export type AnalysisOutputClass = (typeof ANALYSIS_OUTPUT_CLASSES)[number];

// ── the model payload (composed per enabled routes) ───────────────────────────────────────────────────
/** One lore entry as the MODEL emits it (route-enabled only). Machine-authored: the applier neutralizes
 *  macros and span-stamps the key before anything durable happens (§2 law 7). */
const analysisLoreEntrySchema = z.object({
  /** The entry's stable key — the idempotency handle WITHIN a span (the applier prefixes the span start). */
  key: z.string().min(1).max(LORE_KEY_MAX),
  keys: z.array(z.string().min(1).max(LORE_KEYWORD_MAX)).max(LORE_KEYS_MAX),
  content: z.string().min(1).max(LORE_CONTENT_MAX),
});
type AnalysisLoreEntry = z.infer<typeof analysisLoreEntrySchema>;

const twistOpSchema = z.object({ op: z.enum(["add", "retire"]), twist: z.string().min(1).max(TWIST_MAX) });

/** The ALWAYS-present half of every pass payload — the private plot state ops (the legacy director payload
 *  shape carried: `arcStatus`/`updatedArc`/`successorArc` + `twistOps`). */
const payloadBase = {
  /** `completed` ⇒ the current arc fully resolved ON-SCREEN and `successorArc` seeds the next. */
  arcStatus: z.enum(["active", "completed"]),
  /** A refreshed spelling of the CURRENT arc; `null` = carry it forward unchanged. */
  updatedArc: z.string().max(ARC_MAX).nullable(),
  /** The next arc, read ONLY when `arcStatus === "completed"`; `null` otherwise. */
  successorArc: z.string().max(ARC_MAX).nullable(),
  twistOps: z.array(twistOpSchema).max(TWIST_OPS_PER_PASS),
};

/** Build the pass's payload validator FROM the enabled routes. This composition is load-bearing twice:
 *  the projected JSON Schema of THIS zod is the wire `responseFormat` (an enforcing vehicle cannot emit a
 *  disabled field), and the zod itself is the server-side wall (a non-enforcing vehicle's stray field is
 *  stripped here before any applier runs — the needle pin's model-independent receipt). */
export function buildAnalysisPayloadSchema(routes: AnalysisRoutes): z.ZodType<AnalysisPayload> {
  return z.object({
    ...payloadBase,
    // "" = nothing needs steering — the COMMON case, and it CLEARS standing guidance (each pass replaces
    // guidance wholesale; the legacy director refreshed its one instruction every pass).
    ...(routes.steer !== undefined ? { guidance: z.string().max(ARC_MAX + TWIST_MAX) } : {}),
    ...(routes.lore !== undefined ? { lore: z.array(analysisLoreEntrySchema).max(LORE_PER_PASS) } : {}),
    ...(routes.suggest !== undefined ? { suggestions: z.array(z.object({ text: z.string().min(1).max(SUGGESTION_TEXT_MAX) })).max(SUGGESTIONS_PER_PASS) } : {}),
    ...(routes.vars !== undefined ? { score: z.number().min(0).max(ANALYSIS_SCORE_MAX) } : {}),
  }) as z.ZodType<AnalysisPayload>;
}

/** The parsed pass payload. Route-gated fields are optional at the TYPE level (they exist only when their
 *  route is enabled); the per-call schema makes each REQUIRED when present, which keeps the projected wire
 *  schema all-required-friendly for strict vehicles. */
export interface AnalysisPayload {
  readonly arcStatus: "active" | "completed";
  readonly updatedArc: string | null;
  readonly successorArc: string | null;
  readonly twistOps: readonly { readonly op: "add" | "retire"; readonly twist: string }[];
  readonly guidance?: string;
  readonly lore?: readonly AnalysisLoreEntry[];
  readonly suggestions?: readonly { readonly text: string }[];
  readonly score?: number;
}

// ── the pure state merge (legacy semantics, property-tested) ──────────────────────────────────────────
/** What one pass did to the banks — counts ride the fire row's detail (host debug surface). */
export interface AnalysisStateMerge {
  readonly arc: string;
  readonly twists: readonly string[];
  readonly retiredTwists: readonly string[];
  readonly twistsAdded: number;
  readonly twistsRetired: number;
  /** Adds dropped at the bank cap — logged, never an error (the model over-planning is not a fault). */
  readonly droppedAdds: number;
}

type TwistOps = AnalysisPayload["twistOps"];

/** RETIRES apply first — freeing the active bank before adds (an arc-completion pass retires the spent set
 *  AND seeds successors in ONE pass, the legacy D93 Finding-2 posture). Retired-bank dedup here; the FIFO
 *  age-out happens after adds (the cap bounds the DURABLE bank, not one pass's churn). */
function applyRetires(twists: string[], retired: string[], ops: TwistOps): number {
  let count = 0;
  for (const op of ops) {
    if (op.op !== "retire") {
      continue;
    }
    const idx = twists.indexOf(op.twist);
    if (idx >= 0) {
      twists.splice(idx, 1);
    }
    if (!retired.includes(op.twist)) {
      retired.push(op.twist);
    }
    count += 1;
  }
  return count;
}

/** ADDS after retires: dedup against BOTH banks (a re-add of a retired twist is a RESURRECTION — the exact
 *  thing the retired bank bans — counted as dropped, never silently revived), fill to the cap, overflow
 *  dropped + counted. */
function applyAdds(twists: string[], retired: readonly string[], ops: TwistOps): { added: number; dropped: number } {
  let added = 0;
  let dropped = 0;
  for (const op of ops) {
    if (op.op !== "add") {
      continue;
    }
    if (twists.includes(op.twist) || retired.includes(op.twist) || twists.length >= ANALYSIS_TWIST_CAP) {
      dropped += 1;
      continue;
    }
    twists.push(op.twist);
    added += 1;
  }
  return { added, dropped };
}

/** Merge a payload's plot ops over the current state. RETIRES FIRST, then ADDS dedup + fill to the cap;
 *  the retired bank FIFO-ages at `ANALYSIS_RETIRED_CAP`. Arc: `successorArc` on completion, else
 *  `updatedArc`, else carry. Pure — the property tests pin retire-before-add, cap, and dedup. */
export function mergeAnalysisState(current: AnalysisState, payload: AnalysisPayload): AnalysisStateMerge {
  const twists = [...current.twists];
  const retired = [...current.retiredTwists];
  const twistsRetired = applyRetires(twists, retired, payload.twistOps);
  const { added: twistsAdded, dropped: droppedAdds } = applyAdds(twists, retired, payload.twistOps);
  const aged = retired.slice(Math.max(0, retired.length - ANALYSIS_RETIRED_CAP)); // FIFO — oldest ages out.

  const resolvedArc = payload.arcStatus === "completed" ? (payload.successorArc ?? payload.updatedArc) : payload.updatedArc;
  return {
    arc: resolvedArc ?? current.arc,
    twists,
    retiredTwists: aged,
    twistsAdded,
    twistsRetired,
    droppedAdds,
  };
}

// ── the ONE lore-write belt's shapes (`engine/lore-write.ts` implements; both write paths consume) ────
/** One fully-RESOLVED entry at the belt: `entryKey` becomes the ruleId-namespaced title; `content` is the
 *  final bytes (rendered host text from the arm, or neutralized + span-stamped model text from the
 *  analysis route — each caller's own half). Consumed structurally by every caller (they build literals),
 *  so it is deliberately NOT exported — the exported carriers are `RuleLoreWriteArgs`/`AnalysisConfirmAct`. */
interface RuleLoreEntry {
  readonly entryKey: string;
  readonly keys: readonly string[];
  readonly content: string;
}

export interface RuleLoreWriteArgs {
  readonly authorUserId: UserId;
  readonly chatId: ChatId;
  readonly ruleId: AutomationRuleId;
  readonly bookId: WorldBookId;
  readonly entries: readonly RuleLoreEntry[];
}

/** The belt verdict — `refused` carries the typed reason the caller maps to its own failure shape
 *  (`arm_error` at fire; a confirm refusal at confirm). */
export type RuleLoreWriteOutcome = { readonly ok: true } | { readonly ok: false; readonly refused: string };

// ── the read-window + state-read shapes (persistence implements; the engine consumes) ─────────────────
/** One transcript line of an analysis window: the SELECTED variant's content (the same visibility join the
 *  CEL `chat.messageCount` read uses — hidden/unselected rows never reach a pass), plus a display speaker.
 *  `speaker` is the character's name when the row has one, else `null` (the prompt builder labels by role)
 *  — an APPROXIMATE label is fine for a quiet pass; resolving personas per row would drag half the
 *  identity spine into a read that steers no canon. */
export interface AnalysisWindowRow {
  readonly seq: number;
  readonly role: string;
  readonly speaker: string | null;
  readonly content: string;
}

/** A rule's analysis state + standing guidance as `persistence/rule-state.ts` reads it. An absent row
 *  reads as the EMPTY state (a first pass is a cold start, not an error). */
export interface RuleStateRead {
  readonly state: AnalysisState;
  readonly guidance: string;
}

/** The pure user-prompt builder's inputs (`engine/analysis-arm.ts::buildAnalysisUserPrompt` — the golden
 *  test pins the bytes). `brief`/`steer` arrive RENDERED (host-authored templates, through the one
 *  arm-render home); `settled` is `null` when the lore route is off or its span is empty this pass. */
export interface AnalysisPromptInputs {
  readonly brief: string;
  readonly steer: string;
  readonly state: AnalysisState;
  readonly fresh: readonly AnalysisWindowRow[];
  readonly settled: readonly AnalysisWindowRow[] | null;
}

// ── the S4 confirm payload (the {via:"analysis"} arm — contract/ops.ts imports this DOWN) ─────────────
/** A confirm-routed analysis output, stashed FULLY RESOLVED (model bytes already `neutralizeMacros`'d,
 *  lore keys already span-stamped) so the confirm executes exactly what the card described — nothing
 *  renders, nothing re-derives (§2 law 6: machine-authored content never re-enters a template pass).
 *
 *  `lore` carries `spanEnd` because the WATERMARK advances only when the write actually lands: a confirmed
 *  apply moves `settledThroughSeq` to the span it covered; a dismissed/expired card leaves it unmoved, so
 *  the next pass re-covers the span and re-raises (the retryability contract, confirm-shaped). */
export type AnalysisConfirmAct =
  | { readonly kind: "steer"; readonly guidance: string }
  | { readonly kind: "lore"; readonly bookId: WorldBookId; readonly entries: readonly RuleLoreEntry[]; readonly spanEnd: number }
  /** A model-suggested guided turn. Executes through the SAME `ops.chat.requestTurn` seam the
   *  `trigger_turn` arm rides (D17 consent + depth + rate belts live INSIDE it); `automationDepth` is the
   *  raising dispatch's child depth, carried so the turn's cascade stamp matches a direct fire's. */
  | { readonly kind: "suggestTurn"; readonly steerText: string; readonly automationDepth: number };

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
//     SIZE is enforced as a CLAMP ON READ, never a schema refusal (#1480 item 3): the reader parses the
//     row and truncates arc/banks/strings to the caps the live write paths already hold, because a `.max()`
//     here would make an already-stored row UNPARSEABLE and reset the watermark it was meant to protect.
//   • the MODEL PAYLOAD — COMPOSED from the arm's enabled routes (`buildAnalysisPayloadSchema`), which is
//     the xgrammar lever AND a needle wall: an un-authored route's field is absent from the enforced wire
//     schema (the model cannot emit it on an enforcing vehicle) and absent from THIS zod (a non-enforcing
//     vehicle's stray key is STRIPPED server-side before any applier sees it). The needle's `score` is the
//     ONLY field that may reach the member-visible vars plane, and it is a NUMBER — arcs/twists/guidance
//     are disjoint string fields no code path hands to the vars writer (F6's wall as a type).
//   • the OUTPUT-CLASS union (`ANALYSIS_OUTPUT_CLASSES`) — the executor routes through an exhaustive
//     `Record<AnalysisOutputClass, …>` (`engine/analysis-arm.ts`), so a new class fails `tsc` (§3-S5.4).
//
// C3 ADDED `suggestRewrite`, the ONE output class that touches PROSE CANON, and it is fenced twice over: the
// class raises an S4 card and never writes (its confirm act runs through a HOST-only chat verb that lives on
// the AutomationContext, not on `ops`, so no arm can reach it), and the act carries the audited variant id +
// a hash of its bytes so the confirm can only ever land on the body the audit actually read.
//
// The twist-bank MERGE is here as a pure function with property tests: RETIRES apply first (freeing the
// bank before adds — the legacy D93 Finding-2 posture: an arc-completion pass retires the spent set AND
// seeds the successor in one pass), then ADDS dedup + fill to `ANALYSIS_TWIST_CAP`, overflow dropped, and
// the SAME read-side clamp last so an already-oversized incoming bank shrinks instead of surviving.

import type { AutomationAction } from "@orb/contracts/automation";
import { ANALYSIS_REWRITE_ISSUE_MAX, ANALYSIS_REWRITE_MAX, ANALYSIS_SCORE_MAX } from "@orb/contracts/automation";
import type { AutomationRuleId, ChatId, MessageId, MessageVariantId, UserId, WorldBookId } from "@orb/kit/ids";
import { z } from "zod";

/** The `run_analysis` arm as stored/dispatched (the parsed schema member — one home, derived). */
export type RunAnalysisAction = Extract<AutomationAction, { type: "run_analysis" }>;
/** The arm's per-route configuration — absence is the off switch (§3-S5.4). */
export type AnalysisRoutes = RunAnalysisAction["routes"];

// ── caps (named — noMagicNumbers) ─────────────────────────────────────────────────────────────────────
/** The active twist bank's DURABLE ceiling (legacy `TWIST_CAP` — adds beyond it drop, retires free slots).
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export const ANALYSIS_TWIST_CAP = 6;
/** The retired bank's FIFO ceiling — old retirements age out; the bank exists to stop resurrections, and a
 *  twist retired 24 entries ago is no longer a live resurrection risk.
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export const ANALYSIS_RETIRED_CAP = 24;
/** Per-pass twist-op bound (a wire-stripped post-parse belt — the durable bank cap is the real wall). */
const TWIST_OPS_PER_PASS = 8;
/** One arc / one twist is a sentence-class string, not prose. EXPORTED because they are the caps the
 *  parse-on-read clamp uses too (`parseAnalysisState`), and a cap spelled twice is a cap that drifts.
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export const ANALYSIS_ARC_MAX = 400;
/** @public Test-anchored module surface; focused tests pin this production-local behavior. */
export const ANALYSIS_TWIST_MAX = 200;
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

/** THE SIZE CEILING, APPLIED AS A CLAMP RATHER THAN A REFUSAL (#1480 item 3).
 *
 *  The bounds already existed on the MODEL PAYLOAD — {@link ANALYSIS_ARC_MAX} on `updatedArc`/`successorArc`,
 *  {@link ANALYSIS_TWIST_MAX} per twist op, {@link ANALYSIS_TWIST_CAP}/{@link ANALYSIS_RETIRED_CAP} on the
 *  banks — so every LIVE write is bounded before storage. They stopped at the stored blob: this schema took
 *  an unbounded arc and unbounded arrays of unbounded strings, and {@link mergeAnalysisState} only refused to
 *  ADD past the cap, never shrank a bank already over it. A row that arrived by any other route (a restored
 *  dump, a hand edit, a future import) therefore rode its whole payload into every assembled prompt and back
 *  out through the pass write, permanently.
 *
 *  WHY A CLAMP AND NOT A `.max()` ON THE SCHEMA: this shape is parsed by the READER
 *  (`persistence/rule-state.ts#selectRuleState`), so a new refusal does not reject a write — it makes an
 *  already-stored row unparseable, and the whole row then falls to {@link EMPTY_ANALYSIS_STATE}, RESETTING
 *  the `settledThroughSeq` watermark and re-covering a span the host already accepted. Refusing on read is
 *  the one thing the ruled version posture (header) forbids. So the row still parses; it reads back bounded.
 *
 *  THE TWO BANKS CLAMP IN OPPOSITE DIRECTIONS, each matching the direction its own live rule already moves:
 *  the active bank keeps its OLDEST (`applyAdds` stops adding at the cap, so the incumbents are what a
 *  bounded history would hold), the retired bank keeps its NEWEST (it FIFO-ages in {@link mergeAnalysisState},
 *  and its job is to stop RECENT resurrections). */
function clampTwists(twists: readonly string[]): readonly string[] {
  return twists.slice(0, ANALYSIS_TWIST_CAP).map((twist) => twist.slice(0, ANALYSIS_TWIST_MAX));
}

/** The retired bank's clamp — count from the END (FIFO age-out, {@link mergeAnalysisState}'s own direction). */
function clampRetiredTwists(retired: readonly string[]): readonly string[] {
  return retired.slice(Math.max(0, retired.length - ANALYSIS_RETIRED_CAP)).map((twist) => twist.slice(0, ANALYSIS_TWIST_MAX));
}

/** Read a stored blob into `AnalysisState`. Only a non-object / unparseable blob resets WHOLE (the safe
 *  direction — watermark 0 re-covers, never skips); anything object-shaped reads field-by-field, then
 *  CLAMPS to the live write paths' own caps (see {@link clampTwists} for why clamp and not refuse). The
 *  watermark is never clamped — it is already `.int().nonnegative()` and it is the one field whose loss
 *  costs work. */
export function parseAnalysisState(raw: unknown): AnalysisState {
  const parsed = analysisStateSchema.safeParse(raw);
  if (!parsed.success) {
    return EMPTY_ANALYSIS_STATE;
  }
  return {
    arc: parsed.data.arc.slice(0, ANALYSIS_ARC_MAX),
    twists: clampTwists(parsed.data.twists),
    retiredTwists: clampRetiredTwists(parsed.data.retiredTwists),
    settledThroughSeq: parsed.data.settledThroughSeq,
  };
}

// ── the output-class union (the closed routing vocabulary — §3-S5.4) ─────────────────────────────────
/** Every class a pass's output routes through. The executor holds an exhaustive
 *  `Record<AnalysisOutputClass, …>` — a new class fails `tsc` there before it can ship unrouted. */
const ANALYSIS_OUTPUT_CLASSES = ["setState", "steer", "upsertLoreEntry", "suggest", "suggestRewrite", "setVariable"] as const;
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

const twistOpSchema = z.object({ op: z.enum(["add", "retire"]), twist: z.string().min(1).max(ANALYSIS_TWIST_MAX) });

// The route pieces below are PROJECTION-CLEAN: the wire schema is `z.toJSONSchema` of them, and a
// `.transform()` makes that throw. The readonly output typing lives only on the envelope further down.
const analysisGuidanceSchema = z.string().max(ANALYSIS_ARC_MAX + ANALYSIS_TWIST_MAX);
const analysisLoreSchema = z.array(analysisLoreEntrySchema).max(LORE_PER_PASS);
const analysisSuggestionsSchema = z.array(z.object({ text: z.string().min(1).max(SUGGESTION_TEXT_MAX) })).max(SUGGESTIONS_PER_PASS);
const analysisScoreSchema = z.number().min(0).max(ANALYSIS_SCORE_MAX);
const twistOpsSchema = z.array(twistOpSchema).max(TWIST_OPS_PER_PASS);

/** C3 — the PROSE AUDIT's verdict, as the model emits it. `clean` is the COMMON case and is spelled as a
 *  first-class arm rather than an empty `text`: the legacy prose-audit's when-in-doubt-clean posture only
 *  survives if "nothing is wrong" is something the model is asked to SAY, and the executor keys the
 *  draws-nothing path off the verdict rather than guessing from a blank string a stingy model might also
 *  return for a real flaw it declined to fix. */
const analysisRewriteSchema = z.object({
  verdict: z.enum(["clean", "flawed"]),
  /** The flaw in one phrase — the card's own question. Empty on `clean`. */
  issue: z.string().max(ANALYSIS_REWRITE_ISSUE_MAX),
  /** The FULL corrected reply (not a patch — the applier writes it as a whole variant). Empty on `clean`. */
  text: z.string().max(ANALYSIS_REWRITE_MAX),
});
type AnalysisRewrite = z.infer<typeof analysisRewriteSchema>;

/** The ALWAYS-present half of every pass payload — the private plot state ops (the legacy director payload
 *  shape carried: `arcStatus`/`updatedArc`/`successorArc` + `twistOps`). */
const payloadBase = {
  /** `completed` ⇒ the current arc fully resolved ON-SCREEN and `successorArc` seeds the next. */
  arcStatus: z.enum(["active", "completed"]),
  /** A refreshed spelling of the CURRENT arc; `null` = carry it forward unchanged. */
  updatedArc: z.string().max(ANALYSIS_ARC_MAX).nullable(),
  /** The next arc, read ONLY when `arcStatus === "completed"`; `null` otherwise. */
  successorArc: z.string().max(ANALYSIS_ARC_MAX).nullable(),
  twistOps: twistOpsSchema,
};

/** The concrete implementation face after the route-built wall has required enabled fields and stripped
 *  disabled ones. Piping through this stable envelope gives the body-bearing factory an exact authored output
 *  without changing bytes; route-specific requiredness remains the public generic overload's narrower face.
 *  Its identity transforms only narrow the arrays to readonly, so it is the PARSE face and is never
 *  projected; the wire is {@link buildAnalysisWireSchema}. */
const analysisPayloadEnvelopeSchema = z.object({
  ...payloadBase,
  twistOps: twistOpsSchema.transform((ops): AnalysisPayload["twistOps"] => ops),
  guidance: analysisGuidanceSchema.optional(),
  lore: analysisLoreSchema.transform((entries): readonly AnalysisLoreEntry[] => entries).optional(),
  suggestions: analysisSuggestionsSchema.transform((suggestions): readonly { readonly text: string }[] => suggestions).optional(),
  rewrite: analysisRewriteSchema.optional(),
  score: analysisScoreSchema.optional(),
}) satisfies z.ZodType<AnalysisPayload>;

type AnalysisPayloadBase = Pick<AnalysisPayload, "arcStatus" | "updatedArc" | "successorArc" | "twistOps">;
type RequiredAnalysisPayloadField<TField extends keyof AnalysisPayload> = {
  readonly [TKey in TField]-?: Exclude<AnalysisPayload[TKey], undefined>;
};
type AnalysisRoutePayload<
  TRoutes extends AnalysisRoutes,
  TRoute extends keyof AnalysisRoutes,
  TField extends keyof AnalysisPayload,
> = TRoute extends keyof TRoutes
  ? undefined extends TRoutes[TRoute]
    ? Pick<AnalysisPayload, TField>
    : RequiredAnalysisPayloadField<TField>
  : Record<never, never>;
type AnalysisPayloadForRoutes<TRoutes extends AnalysisRoutes> = AnalysisPayloadBase &
  AnalysisRoutePayload<TRoutes, "steer", "guidance"> &
  AnalysisRoutePayload<TRoutes, "lore", "lore"> &
  AnalysisRoutePayload<TRoutes, "suggest", "suggestions"> &
  AnalysisRoutePayload<TRoutes, "rewrite", "rewrite"> &
  AnalysisRoutePayload<TRoutes, "vars", "score">;

/** The route half of the wire shape: a key exists only when its route is authored. */
type AnalysisWireRouteShape = Partial<{
  guidance: typeof analysisGuidanceSchema;
  lore: typeof analysisLoreSchema;
  suggestions: typeof analysisSuggestionsSchema;
  rewrite: typeof analysisRewriteSchema;
  score: typeof analysisScoreSchema;
}>;
type AnalysisWireShape = typeof payloadBase & AnalysisWireRouteShape;

/** Build the pass's WIRE object FROM the enabled routes: exactly the fields the model may emit, each one
 *  required. Its projected JSON Schema is the wire `responseFormat` (an enforcing vehicle cannot emit a
 *  disabled field), and it is the input half of {@link buildAnalysisPayloadSchema}, so both halves of the
 *  needle wall stay one composition. It holds no transform, because `z.toJSONSchema` throws on one. */
export function buildAnalysisWireSchema(routes: AnalysisRoutes): z.ZodObject<AnalysisWireShape> {
  const routeShape: AnalysisWireRouteShape = {};
  if (routes.steer !== undefined) {
    routeShape.guidance = analysisGuidanceSchema;
  }
  if (routes.lore !== undefined) {
    routeShape.lore = analysisLoreSchema;
  }
  if (routes.suggest !== undefined) {
    routeShape.suggestions = analysisSuggestionsSchema;
  }
  if (routes.rewrite !== undefined) {
    routeShape.rewrite = analysisRewriteSchema;
  }
  if (routes.vars !== undefined) {
    routeShape.score = analysisScoreSchema;
  }
  return z.object({ ...payloadBase, ...routeShape });
}

/** Build the pass's payload validator FROM the enabled routes: the wire object piped into the envelope. The
 *  zod is the server-side wall (a non-enforcing vehicle's stray field is stripped here before any applier
 *  runs — the needle pin's model-independent receipt). Never project this one; its output face is the
 *  all-optional envelope. */
// GENERATED-SCHEMA CORRELATION: each invocation has a route-dependent output narrower than AnalysisPayload
// (enabled fields are required; disabled fields do not exist). The public output is their route-optional
// specialization; the body-bearing signature names the broader concrete envelope that the stable final pipe
// proves. End this split when TypeScript can infer the value-dependent route shape without a 32-arm branch set.
export function buildAnalysisPayloadSchema<TRoutes extends AnalysisRoutes>(routes: TRoutes): z.ZodType<AnalysisPayloadForRoutes<TRoutes>>;
export function buildAnalysisPayloadSchema<TRoutes extends AnalysisRoutes>(routes: TRoutes): z.ZodType<AnalysisPayload | AnalysisPayloadForRoutes<TRoutes>> {
  return buildAnalysisWireSchema(routes).pipe(analysisPayloadEnvelopeSchema);
}

/** The parsed pass payload. Route-gated fields are optional at the TYPE level (they exist only when their
 *  route is enabled); the per-call schema makes each REQUIRED when present, which keeps the projected wire
 *  schema all-required-friendly for strict vehicles. */
export interface AnalysisPayload {
  readonly arcStatus: "active" | "completed";
  readonly updatedArc: string | null;
  readonly successorArc: string | null;
  readonly twistOps: readonly { readonly op: "add" | "retire"; readonly twist: string }[];
  readonly guidance?: string | undefined;
  readonly lore?: readonly AnalysisLoreEntry[] | undefined;
  readonly suggestions?: readonly { readonly text: string }[] | undefined;
  /** C3 — present only when the arm authored `routes.rewrite`; `verdict: "clean"` draws nothing. */
  readonly rewrite?: AnalysisRewrite | undefined;
  readonly score?: number | undefined;
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

  const resolvedArc = payload.arcStatus === "completed" ? (payload.successorArc ?? payload.updatedArc) : payload.updatedArc;
  // THE CLAMP RUNS LAST AND UNCONDITIONALLY (#1480 item 3). `applyAdds` only declines to GROW a full bank,
  // so a `current` that arrived over the cap — a pre-clamp stored blob, or a state handed straight to the
  // confirm path's faithful round-trip (`persistence/rule-state.ts#upsertRuleState`) — used to survive every
  // merge at its original size. `clampTwists`/`clampRetiredTwists` are the same read-side helpers, so a
  // merge can never produce a state this file's own reader would have to shrink. It subsumes the retired
  // bank's FIFO age-out, which was already this exact slice.
  return {
    arc: (resolvedArc ?? current.arc).slice(0, ANALYSIS_ARC_MAX),
    twists: clampTwists(twists),
    retiredTwists: clampRetiredTwists(retired),
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
  /** The writing rule's own scope, or NULL for an owner-GLOBAL rule (C5). It selects WHICH consent gate the
   *  belt runs — room attachment, or book ownership. */
  readonly chatId: ChatId | null;
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

/** C3 — the REPLY a prose-audit pass audits: the newest visible assistant slot joined to the variant that is
 *  SELECTED right now. Both ids ride onto the card, because both are what "the thing I audited" means: the
 *  SLOT is what a confirm writes to, and the VARIANT is which swipe of it the audit read. The content is
 *  carried too — it is the diff's left side and the input the hash is taken over, and re-reading it at confirm
 *  is exactly how the staleness check is made (a re-read gate, never a trust transfer). */
export interface AnalysisAuditTarget {
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
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
  /** C3 — the reply under audit, quoted as its own prompt section. `null` when the rewrite route is off or
   *  the chat has no assistant reply yet (a room with nothing to audit is not an error). */
  readonly audited: AnalysisAuditTarget | null;
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
  | { readonly kind: "suggestTurn"; readonly steerText: string; readonly automationDepth: number }
  /** C3 — a conservative rewrite of ONE audited reply, PINNED to the variant it audited and HASHED over that
   *  variant's bytes (§3-S4 class 1: the legacy stale-accept guard). Both pins are re-checked at confirm
   *  against the room as it stands NOW, and either mismatch REFUSES without touching canon:
   *    • `variantId` no longer the slot's selected one ⇒ SUPERSEDED (the host swiped between ask and yes);
   *    • the hash no longer matches ⇒ STALE (someone edited the text the audit was written against).
   *  `content` is already `neutralizeMacros`'d at the stash (law 7 — a model-authored `{{…}}` must not become
   *  live syntax in a message row) and is written WHOLE as a new variant, which is the revert obligation's
   *  mechanism: the audited variant survives as a swipe, so undoing a confirmed rewrite is the swipe control
   *  the room already has, forever, with no expiry. */
  | {
      readonly kind: "rewrite";
      readonly messageId: MessageId;
      readonly variantId: MessageVariantId;
      readonly contentHash: string;
      readonly content: string;
    };

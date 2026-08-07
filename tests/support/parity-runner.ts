// ── The differential-oracle harness (CHECKLIST §C1 · Spine-Testing.md §6) ───────────────────────────────
//
// Drives the parity oracle from the orbweaver side: it loads the committed neo reference
// (fixtures/parity/neo-reference.json, captured from the steady clone by
// scripts/dev/oracle-steady-clone.sh --capture) + the input fixture (breakpoint-cases.json), and
// exposes `runOrbweaverShape` — the ONE seam orbweaver's chat assembly plugs into when it lands
// (Phase 5 step 2). Until then `runOrbweaverShape` throws a clear "not wired" error and the
// `.parity.test` is skipped (never a failing assertion — Spine-Testing.md §1).
//
// PARITY SURFACE ONLY: the SHAPE-phase assembled history + the §8 rolling-tail cache breakpoint
// (offset + placement). Memory is a rewrite (its own .int tests) — NEVER the oracle. This file does
// NOT import neo (tests/ is in orbweaver's tsc scope); the neo side is the capture script.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatInjection } from "@orb/contracts/chat";
import type { NamesBehavior } from "@orb/contracts/preset";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
// The REAL orbweaver SHAPE substrate (Phase 5 chunk 7). Relative-imported because SHAPE is an internal
// assembly file, not a chat front-door surface (the same pattern the chat substrate tests use).
import { shape } from "../../packages/server/src/domain/chat/assembly/shape.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PARITY_DIR = join(HERE, "fixtures", "parity");

/** The delivered wire-row role = the homed `MessageRole` axis (derived, never re-spelled). Parity fixtures
 *  themselves are user/assistant; `system` = a capability-kept depth-0 injection (`turns.midConversationSystem`)
 *  a shape() stage can now carry. */
export type Role = MessageRole;

export interface Msg {
  role: Role;
  content: string;
  authorName?: string | null;
  characterId?: CharacterId | null;
  /** namesBehavior="completion" sets the OpenAI-spec `name` field instead of prefixing content. */
  name?: string;
}

export interface ChatInjectionInput {
  position: string;
  depth: number;
  role: string;
  content: string;
  order?: number;
}

/** A single SHAPE case — a faithful set of `shapeCompletionHistory` inputs (neo pipeline.ts). */
export interface ShapeCase {
  name: string;
  describe: string;
  stages: string[];
  canon: Msg[];
  appendUserTurn: string | null;
  injections: ChatInjectionInput[];
  groupConfig: { output: "per-speaker" | "narrator"; cardScope: "merged" | "scoped" };
  scopedTargetId: string | null;
  namesBehavior: NamesBehavior;
  speakers: { user: string; assistant: string };
  groupNudge: string | null;
  expectBreakpointFromEnd: number | null;
}

/** The captured SHAPE output for one case — the diffable parity surface. */
export interface ShapeResult {
  multiCharacter: boolean;
  withTail: Msg[];
  injected: Msg[];
  squashed: Msg[];
  named: Msg[];
  history: Msg[];
  /** Offset-from-end of the last STABLE message (the §8 breakpoint), or null (no safe breakpoint). */
  cacheBreakpointFromEnd: number | null;
  /** Runner placement index (history.length-1-offset), or null. Out-of-bounds ⇒ runner discards it. */
  targetIdx: number | null;
}

export interface RollingDelta {
  offsetInvariant: boolean;
  turn1TargetIdx: number | null;
  turn2TargetIdx: number | null;
  /** Absolute placement advance between consecutive turns = one committed user/assistant pair (2). */
  placementAdvance: number | null;
}

export interface Fixture {
  cacheMinTokens: number;
  cases: ShapeCase[];
  rollingPair: { describe: string; turns: ShapeCase[] };
}

export interface Reference {
  neoHead: string;
  cacheMinTokens: number | null;
  cases: Record<string, ShapeResult>;
  rollingPair: { turns: (ShapeResult & { name: string })[]; delta: RollingDelta };
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(PARITY_DIR, name), "utf8")) as T;
}

export function loadFixture(): Fixture {
  return readJson<Fixture>("breakpoint-cases.json");
}

export function loadReference(): Reference {
  return readJson<Reference>("neo-reference.json");
}

/**
 * The unskip marker for the ONE still-skipped spec — the human signal; nothing greps it.
 *
 * CORRECTED 2026-08-03: this used to read "UNSKIP when chat assembly lands (Phase 5 step 2 — wire
 * runOrbweaverShape)". **Assembly landed and `runOrbweaverShape` IS wired** (it calls `shape()` below;
 * the SHAPE parity describe runs 18 green). The string bundled a BUILD condition with a COST condition,
 * so satisfying the build half changed nothing visible and the marker went on advertising a blocker
 * that no longer existed — it was even interpolated into the title of the PASSING describe.
 * One blocker left, and it is a cost, not a build.
 */
export const UNSKIP_WHEN = "needs a real Anthropic-keyed backend + RUN_LIVE=1 (a live model call). Assembly: DONE.";

/**
 * THE SEAM. orbweaver's chat assembly (SHAPE phase) plugs in here: given a ShapeCase, return the
 * ShapeResult by running the REAL orbweaver `shapeCompletionHistory`-equivalent over the case inputs.
 * The `.parity.test` then asserts `runOrbweaverShape(case)` deep-equals the captured neo reference.
 *
 * WIRED (2026-08-03 audit): this no longer throws and the test is NOT skipped — it calls the real
 * `shape()` below and `pipeline-breakpoint.parity.test.ts` runs it green. The previous text here
 * ("until assembly lands this throws — the test is `describe.skip`'d, so it never runs") was false on
 * both clauses and survived because nobody re-reads a comment sitting next to working code.
 */
// Parity CANON rows are user/assistant only (shape()'s canon input never carries system; only its
// post-splice stages can). Loud on a bad fixture, never a silent coercion.
function asCanonRole(role: Role): "user" | "assistant" {
  if (role === "system") {
    throw new Error("parity canon rows are user/assistant only");
  }
  return role;
}

/**
 * Drop INTERNAL-ONLY assembly markers from a PRE-NAMING stage before the neo diff.
 *
 * `speakerless` (INJECT-NAMED-AS-PLAYER, `34bdc39f3`) is set by `spliceInChatInjections` on an injection the
 * splice DEMOTED to a participant role, and CONSUMED by `applyNamesBehavior` — a wire row must never carry
 * it. It is bookkeeping between two of our own stages, and neo has no equivalent, so a capture taken from neo
 * structurally cannot contain it: leaving it in made three parity cases red the moment that fix landed, and
 * would keep doing so for every future internal marker.
 *
 * BAKING IT INTO THE NEO REFERENCE WAS THE OTHER ARM AND IS WRONG: the reference is a record of what NEO
 * produced. Editing it to carry an orbweaver-internal flag turns the oracle into a mirror of the thing it is
 * supposed to check.
 *
 * Applied ONLY to the pre-naming stages. `named`/`history` are deliberately left RAW, so if the marker ever
 * survives the naming pass — the exact regression the INJECT fix exists to prevent — it still diverges from
 * the reference and REDs. This normalization removes a false red; it does not remove a true one.
 */
function withoutInternalMarkers(rows: readonly Msg[]): Msg[] {
  return rows.map((row) => {
    const { speakerless: _speakerless, ...rest } = row as Msg & { speakerless?: true };
    return rest;
  });
}

export function runOrbweaverShape(c: ShapeCase): ShapeResult {
  const out = shape({
    // Preserve EXACT key presence from the fixture (a user row carries authorName but NO characterId;
    // an assistant row carries both). `toEqual` treats an explicit `null` as a real property — so a
    // synthesized `characterId: null` would diverge from neo's absent key. castId is a runtime no-op.
    canon: c.canon.map((m) => ({
      role: asCanonRole(m.role),
      content: m.content,
      ...(m.authorName !== undefined ? { authorName: m.authorName } : {}),
      ...(m.characterId !== undefined && m.characterId !== null ? { characterId: castId<CharacterId>(m.characterId) } : {}),
    })),
    appendUserTurn: c.appendUserTurn,
    injections: c.injections.map(
      (i): ChatInjection => ({
        position: i.position as ChatInjection["position"],
        depth: i.depth,
        role: i.role as MessageRole,
        content: i.content,
        ...(i.order !== undefined ? { order: i.order } : {}),
      }),
    ),
    output: c.groupConfig.output,
    cardScope: c.groupConfig.cardScope,
    scopedTargetId: c.scopedTargetId !== null ? castId<CharacterId>(c.scopedTargetId) : null,
    namesBehavior: c.namesBehavior,
    speakers: c.speakers,
    groupNudge: c.groupNudge,
  });
  const offset = out.cacheBreakpointFromEnd;
  // The runner's placement = history.length-1-offset; the engine's bounds check (targetIdx >=
  // history.length) discards an out-of-range tag. Derived here exactly as the neo capture derived it.
  const targetIdx = offset === undefined ? null : out.history.length - 1 - offset;
  return {
    multiCharacter: out.stages.multiCharacter,
    // PRE-NAMING stages: internal markers normalized away (see `withoutInternalMarkers`).
    withTail: withoutInternalMarkers(out.stages.withTail),
    injected: withoutInternalMarkers(out.stages.injected),
    squashed: withoutInternalMarkers(out.stages.squashed),
    // DELIVERED stages: RAW. A marker surviving the naming pass must still diverge from neo and RED.
    named: out.stages.named,
    history: out.history,
    cacheBreakpointFromEnd: offset ?? null,
    targetIdx,
  };
}

/**
 * The rolling-tail signature (CHECKLIST §C1 cacheWrite/read delta), derived from two consecutive
 * turns' SHAPE results. The offset is invariant turn-over-turn while the absolute placement advances
 * by one committed user/assistant pair — so turn1's written prefix is a cache READ on turn2 (the
 * ~5300-token win). Both sides (neo reference + orbweaver) compute it through THIS one function.
 */
export function rollingDelta(turn1: ShapeResult, turn2: ShapeResult): RollingDelta {
  return {
    offsetInvariant: turn1.cacheBreakpointFromEnd === turn2.cacheBreakpointFromEnd,
    turn1TargetIdx: turn1.targetIdx,
    turn2TargetIdx: turn2.targetIdx,
    placementAdvance: turn1.targetIdx !== null && turn2.targetIdx !== null ? turn2.targetIdx - turn1.targetIdx : null,
  };
}

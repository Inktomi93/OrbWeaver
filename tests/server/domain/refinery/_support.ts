// Refinery test substrate: the composed harness (real freshDb + the REAL character service over the
// character harness + the REAL injected character ops) with the model faked at the ONE edge — a scripted
// `summarize` TAPE (FIFO; exhaustion throws LOUD, the Spine-Testing tape doctrine). Deterministic clock;
// the refinery ids are MINTED TypeIDs because the stage-config and run contracts parse them with `typeIdSchema`.

import type { SummarizeResult } from "@orb/contracts/providers";
import type { RefineryAnalyzePayload, RefineryRewritePayload, RefineryScorePayload } from "@orb/contracts/refinery";
import type { ResponseFormat, RoleClients, SummarizeInput, SummarizeOptions } from "@orb/contracts/role-clients";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { CharacterHandle, CharacterId, RefineryRunId, RefinerySchemaId, RefinerySessionId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { CharacterService } from "@orb/server/domain/character";
import {
  createCharacterService,
  createDeleteSnapshot,
  createListRefineryScoreTargets,
  createLoadOwnedCard,
  createStampRefinerySignals,
} from "@orb/server/domain/character";
import type { RefineryContext, RefineryService, RefineryWorkloadDeps } from "@orb/server/domain/refinery";
import { createRefineryService } from "@orb/server/domain/refinery";
import { createFrozenClock, FROZEN_AT_MS } from "../../../support/clock.ts";
import { FAKE_SUMMARIZE_MODEL, makeFakeRoleClients } from "../../../support/factories/role-clients.ts";
import { makeHarness as makeCharacterHarness, principal } from "../character/_support.ts";

export { principal, seedUser } from "../character/_support.ts";

interface SummarizeCall {
  readonly system: string;
  readonly user: string;
  /** The tape serves `summarize` AND `structured`; a structured call's opts carry the `responseFormat`. */
  readonly opts: (SummarizeOptions & { readonly responseFormat?: ResponseFormat | undefined }) | undefined;
}

/** One recorded user-bus emit — the per-user freshness plane the verbs fan `refineryChanged` on (and the
 *  sweep fans `charactersChanged` on at its terminal). */
interface UserEventCall {
  readonly userId: UserId;
  readonly event: UserBusEvent;
}

export interface RefineryHarness {
  readonly svc: RefineryService;
  readonly character: CharacterService;
  readonly ctx: RefineryContext;
  /** Every scripted `summarize` call, in order — assert prompt bytes/postures against these. */
  readonly summarizeCalls: SummarizeCall[];
  /** Every recorded `emitUserEvent` call, in order (shared with the workload bundle below, so a sweep's
   *  terminal fan and a verb's tick land in ONE ledger — exactly as compose wires one publisher). */
  readonly userEvents: UserEventCall[];
  /** Queue the next reply text (FIFO). Under-scripting throws LOUD at the call site. */
  readonly queueReply: (text: string) => void;
  /** Advance the injected frozen clock (ms) — break createdAt ties for latest-per-stage ordering. */
  readonly advance: (ms: number) => void;
}

export const TEST_SUMMARIZER_MODEL = FAKE_SUMMARIZE_MODEL;

/** The owner's default-preset params the harness answers with (the top rung of the side-gen posture ladder). */
export interface RefineryHarnessOptions {
  readonly presetParams?: { readonly temperature?: number; readonly topP?: number; readonly maxOutputTokens?: number } | undefined;
}

export function makeRefineryHarness(db: Db, options: RefineryHarnessOptions = {}): RefineryHarness {
  const charHarness = makeCharacterHarness(db);
  const character = createCharacterService(charHarness.ctx);
  const clock = createFrozenClock(FROZEN_AT_MS);
  const replies: string[] = [];
  const summarizeCalls: SummarizeCall[] = [];
  const userEvents: UserEventCall[] = [];
  const summarize = (inputs: readonly SummarizeInput[], opts?: SummarizeOptions): Promise<SummarizeResult> => {
    const items = inputs.map((input) => {
      summarizeCalls.push({ system: input.systemPrompt, user: input.userPrompt, opts });
      const text = replies.shift();
      if (text === undefined) {
        throw new Error("refinery summarize tape exhausted — queueReply() the expected turn");
      }
      return { text, usage: { tokensIn: 11, tokensOut: 7, costUsd: null } };
    });
    return Promise.resolve({ items, model: TEST_SUMMARIZER_MODEL });
  };
  // ONE scripted bundle: `summarize` and `structured` share the tape (the forge/stage/score verbs name
  // `structured`; the prose passes name `summarize`), and `resolved(task)` answers the fixed summarizer model.
  const roleClients = makeFakeRoleClients({ summarize, structured: summarize, summarizerContextTokens: 8192 });
  const roleClientsFor = (): Promise<RoleClients> => Promise.resolve(roleClients);
  const ctx: RefineryContext = {
    db,
    now: (): number => clock.now(),
    newRefinerySessionId: (): RefinerySessionId => mintTypeId(ID_PREFIX.refinerySession),
    newRefineryRunId: (): RefineryRunId => mintTypeId(ID_PREFIX.refineryRun),
    newRefinerySchemaId: (): RefinerySchemaId => mintTypeId(ID_PREFIX.refinerySchema),
    roleClientsFor,
    resolveUserPresetParams: () => Promise.resolve(options.presetParams ?? {}),
    resolveUserProse: () => Promise.resolve({}),
    emitUserEvent: (userId: UserId, event: UserBusEvent): void => {
      userEvents.push({ userId, event });
    },
    loadOwnedCard: createLoadOwnedCard({ db }),
    stampRefinerySignals: createStampRefinerySignals({ db }),
    snapshotCharacter: character.snapshot,
    deleteSnapshot: createDeleteSnapshot({ db }),
    updateCharacter: character.update,
    getCharacter: character.get,
    duplicateCharacter: character.duplicate,
  };
  return {
    svc: createRefineryService(ctx),
    character,
    ctx,
    summarizeCalls,
    userEvents,
    queueReply: (text: string): void => {
      replies.push(text);
    },
    advance: (ms: number): void => {
      clock.advance(ms);
    },
  };
}

/** The R4 library-sweep DI bundle over the SAME harness: the same scripted summarize tape, the same real
 *  injected character ops. Assembled here (not in a test file — no test may import another) so the sweep
 *  suite and the contribution suite provably drive one bundle, exactly like compose builds one. */
export function refineryWorkloadDepsOf(db: Db, h: RefineryHarness): RefineryWorkloadDeps {
  return {
    roleClientsFor: h.ctx.roleClientsFor,
    resolveUserPresetParams: h.ctx.resolveUserPresetParams,
    resolveUserProse: h.ctx.resolveUserProse,
    listRefineryScoreTargets: createListRefineryScoreTargets({ db }),
    stampRefinerySignals: h.ctx.stampRefinerySignals,
    emitUserEvent: h.ctx.emitUserEvent,
  };
}

/** Seed one owned character THROUGH the real create verb (the real belts + parse seams). `key` becomes
 *  the card handle (cast inside — the handoff seedCard naming precedent). */
export async function seedOwnedCharacter(h: RefineryHarness, ownerId: UserId, key: string): Promise<CharacterId> {
  const detail = await h.character.create({
    principal: principal(ownerId),
    input: {
      handle: castId<CharacterHandle>(key),
      name: "Aria the Archivist",
      description: "A meticulous keeper of records who says {{char}} likes {{user}}.",
      personality: "precise, dry-humoured",
      greetings: [{ text: "Welcome to the archive." }, { text: "Back again? The stacks missed you." }],
    },
  });
  return detail.id;
}

/** A belt-legal custom SCORE schema (the well-known core + one extra axis + a hinted enum) — the R3
 *  custom-arm fixtures' shared shape (homed here so no test file imports another test file, which would
 *  re-register its tests). */
export function validScoreSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      overallScore: { type: "number", minimum: 1, maximum: 10, "x-orb-ui": { role: "hero" } },
      vibe: { type: "string", enum: ["COZY", "SHARP"], "x-orb-ui": { role: "verdict" } },
      notes: { type: "array", items: { type: "string" } },
    },
    required: ["overallScore"],
  };
}

// ── valid stage replies (the tape's payload bodies) ─────────────────────────────────────────────────────

export const SCORE_PAYLOAD: RefineryScorePayload = {
  fieldScores: [{ field: "description", score: 6, strengths: "clear", weaknesses: "thin", suggestions: "add texture" }],
  overallScore: 6.5,
  priorityImprovements: ["add texture"],
  summary: "solid base",
};

const REWRITE_PAYLOAD: RefineryRewritePayload = {
  fields: [
    { field: "description", text: "A meticulous keeper of records; {{char}} files every memory of {{user}}." },
    { field: "greetings", greetingIndex: 1, text: "Back again? The stacks kept your seat warm." },
  ],
};

const ANALYZE_PAYLOAD: RefineryAnalyzePayload = {
  preserved: ["dry humour"],
  lost: [],
  gained: ["texture"],
  soulScore: 9,
  soulAssessment: "still her",
  verdict: "NEEDS_REFINEMENT",
  issues: ["greeting 0 untouched"],
  recommendations: ["vary greeting 0"],
};

export function scoreReply(overrides: Partial<RefineryScorePayload> = {}): string {
  return JSON.stringify({ ...SCORE_PAYLOAD, ...overrides });
}
export function rewriteReply(overrides: Partial<RefineryRewritePayload> = {}): string {
  return JSON.stringify({ ...REWRITE_PAYLOAD, ...overrides });
}
export function analyzeReply(overrides: Partial<RefineryAnalyzePayload> = {}): string {
  return JSON.stringify({ ...ANALYZE_PAYLOAD, ...overrides });
}

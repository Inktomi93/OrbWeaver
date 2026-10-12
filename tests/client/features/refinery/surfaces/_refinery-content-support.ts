import type { RefinerySessionId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import type { TrpcWireOutput } from "@orb/testkit/node/route-trpc.ts";
import type { Page } from "@playwright/test";
import { makeCharacterDetail } from "../../character/fixtures.ts";

export { testId } from "#client/lib/test-ids.ts";

// MINTED, never hand-written (the `typeIdSchema` 26-char-suffix rule — a drifted literal dies at a parse
// seam instead of at an assertion).
export const SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);
export const CHARACTER_ID = mintTypeId(ID_PREFIX.character);
export const SCORE_RUN_SUPERSEDED = mintTypeId(ID_PREFIX.refineryRun);
const SCORE_RUN_LATEST = mintTypeId(ID_PREFIX.refineryRun);
export const REWRITE_RUN = mintTypeId(ID_PREFIX.refineryRun);

// PROSE-LENGTH on both sides (over `accept-review`'s 200-char inline-diff threshold) so the description
// block renders the side-by-side PAIR and the after pane carries the whole rewrite verbatim — an
// assertable string. Personality stays short on purpose: that block takes the FORK-C inline word diff,
// which renders token segments rather than one text node, so it is asserted through its VERB instead.
export const LIVE_DESCRIPTION =
  "A wandering cartographer who has spent eleven years walking the coast road, filling one ledger after another with soundings nobody asked her for, and who has never once agreed to sell a map to a man in uniform, whatever he offered.";
const LIVE_PERSONALITY = "Guarded, precise.";
export const REWRITTEN_DESCRIPTION =
  "A cartographer who maps the drowned roads nobody else will walk, carrying eleven years of soundings in a salt-stained ledger she guards more carefully than her own name, and who has never once agreed to sell a chart to a uniform.";
const REWRITTEN_PERSONALITY = "Wry, unhurried, quietly certain.";

/** The LIVE card the surface reads (`character.get`) — also the session's ORIGINAL pin here, so nothing
 *  in this file is DIVERGED (§21's conflict pane is the accept-review CT's subject, not this one's). */
export const CARD = makeCharacterDetail({
  id: CHARACTER_ID,
  name: "Zephyrine Vale",
  description: LIVE_DESCRIPTION,
  personality: LIVE_PERSONALITY,
});

const STAGE_CONFIG: TrpcWireOutput<"refinery.getSession">["stageConfig"] = {
  score: { kind: "fixed", mode: "full" },
  rewrite: { kind: "fixed", mode: "balanced" },
  analyze: { kind: "fixed", mode: "full" },
};

export function sessionView(sessionId: RefinerySessionId = SESSION_ID): TrpcWireOutput<"refinery.getSession"> {
  return {
    id: sessionId,
    characterId: CHARACTER_ID,
    name: "Rev",
    status: "active",
    originalCard: CARD,
    // Two REFINABLE fields in scope — the accept review paints exactly these, and the scope strip prints
    // one chip each.
    selection: { fields: ["description", "personality"] },
    stageConfig: STAGE_CONFIG,
    rewriteDecisions: {},
    guidance: null,
    iterationCount: 1,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  };
}

function scoreRun(row: { id: string; iteration: number; overallScore: number; summary: string }): TrpcWireOutput<"refinery.listRuns">[number] {
  const { id, iteration, overallScore, summary } = row;
  return {
    id,
    sessionId: SESSION_ID,
    iteration,
    model: "test-scorer",
    promptTokens: 2736,
    outputTokens: 1490,
    durationMs: 23_600,
    sourceRunId: null,
    strippedKeys: [],
    createdAt: FROZEN_AT_MS + iteration,
    stage: "score",
    payloadConfig: { kind: "fixed", mode: "full" },
    payload: { fieldScores: [], overallScore, priorityImprovements: [], summary },
  };
}

export function rewriteRun(): TrpcWireOutput<"refinery.listRuns">[number] {
  return {
    id: REWRITE_RUN,
    sessionId: SESSION_ID,
    iteration: 1,
    model: "test-rewriter",
    promptTokens: 3100,
    outputTokens: 900,
    durationMs: 18_000,
    sourceRunId: null,
    strippedKeys: [],
    createdAt: FROZEN_AT_MS + 2,
    stage: "rewrite",
    payloadConfig: { kind: "fixed", mode: "balanced" },
    payload: {
      fields: [
        { field: "description", text: REWRITTEN_DESCRIPTION },
        { field: "personality", text: REWRITTEN_PERSONALITY },
      ],
    },
  };
}

export function preflight(): TrpcWireOutput<"refinery.preflight"> {
  return {
    contextTokens: 8000,
    stages: (["score", "rewrite", "analyze"] as const).map((stage) => ({
      stage,
      model: "test-model",
      temperature: null,
      maxOutputTokens: 4096,
      inputEstimate: 2736,
      outputEstimate: 1490,
    })),
  };
}

/** The ledger the surface reads, OLDEST FIRST (the wire's order — the lane fold keeps the last write per
 *  stage, so a newest-first fixture would silently invert which score is "latest"). */
export function ledger(): TrpcWireOutput<"refinery.listRuns"> {
  return [
    scoreRun({ id: SCORE_RUN_SUPERSEDED, iteration: 0, overallScore: 4.1, summary: "Thin in the middle." }),
    scoreRun({ id: SCORE_RUN_LATEST, iteration: 1, overallScore: 8.2, summary: "Much sharper after the rewrite." }),
    rewriteRun(),
  ];
}

/** Freeze the page clock so the masthead's elapsed-since credit line is a fixed string. */
export async function freeze(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(FROZEN_AT_MS));
}

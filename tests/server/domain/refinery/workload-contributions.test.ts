// Contribution test: the refinery's ONE workload kind, `refine-score-sweep`. The PASS itself is driven
// end-to-end against a real db in `verbs/score-sweep.int.test.ts`; this suite pins the queue-facing half —
// the params contract (the FILL default vs the explicit REFRESH), the enumeration SCOPE the engine's
// `ownerId` becomes, and the closing progress line, which is the only reader a sweep's `skipped` count has.

import type { WorkloadRunContext } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { RefineryWorkloadDeps } from "../../../../packages/server/src/domain/refinery/contract/service.ts";
import { createRefineryWorkloadContributions } from "../../../../packages/server/src/domain/refinery/workload-contributions.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER_ID = castId<UserId>("user_owner");
/** A library whose cards are ALL already scored — the FILL arm enumerates none of them. */
const SCORED_LIBRARY_SIZE = 8;
const T0 = 1_700_000_000_000;

const ctx: WorkloadRunContext = { userId: OWNER_ID, ownerId: OWNER_ID, now: () => T0 };
const sig = (): AbortSignal => new AbortController().signal;

/** The deps a run body touches: the enumeration (whose ARGUMENTS are what this suite asserts) and the
 *  stamp. The model rung is never reached — the fake enumeration returns no targets, so the pass short-
 *  circuits before assembling a prompt. */
function fakeDeps(): RefineryWorkloadDeps {
  // The `summarize` role client is a wide provider surface this suite deliberately never reaches (no
  // targets ⇒ no prompt, no call); the REAL bundle drives the real chain in `verbs/score-sweep.int.test.ts`.
  // @orb-waive no-test-fabrication(unknown): an unreached role-client stub — the suite asserts the ENUMERATION's arguments, not a turn. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const roleClientsFor = vi.fn() as unknown as RefineryWorkloadDeps["roleClientsFor"];
  return {
    roleClientsFor,
    resolveUserPresetParams: vi.fn(async () => ({})),
    resolveUserProse: vi.fn(async () => ({})),
    listRefineryScoreTargets: vi.fn(async () => ({ targets: [], inScope: 0 })),
    stampRefinerySignals: vi.fn(async () => undefined),
    // The terminal fan's port. Never called in this suite by construction: no targets ⇒ nothing stamped ⇒
    // no owner to announce to (the sweep's own int suite pins the fan itself, both arms).
    emitUserEvent: vi.fn(),
  };
}

function build(): { readonly deps: RefineryWorkloadDeps; readonly contributions: ReturnType<typeof createRefineryWorkloadContributions> } {
  const deps = fakeDeps();
  return { deps, contributions: createRefineryWorkloadContributions(deps) };
}

describe("refine-score-sweep", () => {
  test("absent params take the FILL arm — only unscored cards are enumerated", async () => {
    const { deps, contributions } = build();
    await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(deps.listRefineryScoreTargets).toHaveBeenCalledWith({ ownerId: OWNER_ID, unscoredOnly: true });
  });

  test("rescoreAll takes the REFRESH arm — every card is back in scope", async () => {
    const { deps, contributions } = build();
    await contributions[0].run(ctx, { rescoreAll: true }, vi.fn(), sig());
    expect(deps.listRefineryScoreTargets).toHaveBeenCalledWith({ ownerId: OWNER_ID, unscoredOnly: false });
  });

  test("a BULK row (ownerId null) passes the null through as the box-wide scope, never the acting user", async () => {
    const { deps, contributions } = build();
    // The engine's `userId` stays the acting user while `ownerId` is null — a pass that read `userId` here
    // would silently narrow a maintenance sweep to whoever pressed the button.
    await contributions[0].run({ ...ctx, ownerId: null }, {}, vi.fn(), sig());
    expect(deps.listRefineryScoreTargets).toHaveBeenCalledWith({ ownerId: null, unscoredOnly: true });
  });

  test("the params schema accepts the empty object and the rescoreAll flag, and rejects a foreign key's type", () => {
    const { contributions } = build();
    expect(contributions[0].params.parse({})).toEqual({});
    expect(contributions[0].params.parse({ rescoreAll: true })).toEqual({ rescoreAll: true });
    expect(contributions[0].params.safeParse({ rescoreAll: "yes" }).success).toBe(false);
  });

  test("the closing progress line REPORTS the skipped cards and names the lever that un-skips them", async () => {
    const { deps } = build();
    const report = vi.fn();
    // A library where every card is already scored: the FILL arm enumerates none of them, so the counts are
    // all-skipped — and that count has exactly ONE reader, this sentence (the distill precedent's lesson).
    const contribution = createRefineryWorkloadContributions({
      ...deps,
      listRefineryScoreTargets: vi.fn(async () => ({ targets: [], inScope: SCORED_LIBRARY_SIZE })),
    })[0];
    await contribution.run(ctx, {}, report, sig());
    const messages = report.mock.calls.map((call) => (call[0] as { message?: string }).message ?? "");
    expect(messages.at(-1)).toBe(
      "scored 0 of 8 characters — skipped 8 already scored or with no card text — re-run with “Re-score everything” to refresh them",
    );
  });

  test("under REFRESH the skip line drops the already-scored clause (nothing was skipped for being scored)", async () => {
    const { deps } = build();
    const report = vi.fn();
    const contribution = createRefineryWorkloadContributions({
      ...deps,
      listRefineryScoreTargets: vi.fn(async () => ({ targets: [], inScope: 3 })),
    })[0];
    await contribution.run(ctx, { rescoreAll: true }, report, sig());
    const messages = report.mock.calls.map((call) => (call[0] as { message?: string }).message ?? "");
    expect(messages.at(-1)).toBe("scored 0 of 3 characters — skipped 3 with no card text to score (add a description first)");
  });

  test("a sweep with nothing skipped says so plainly (no dangling zero-count clause)", async () => {
    const { deps } = build();
    const report = vi.fn();
    const contribution = createRefineryWorkloadContributions({
      ...deps,
      listRefineryScoreTargets: vi.fn(async () => ({ targets: [], inScope: 0 })),
    })[0];
    await contribution.run(ctx, {}, report, sig());
    const messages = report.mock.calls.map((call) => (call[0] as { message?: string }).message ?? "");
    expect(messages.at(-1)).toBe("scored 0 of 0 characters");
  });
});

describe("the contribution set", () => {
  test("contributes exactly the one kind, sweep-lane + idempotent-restart", () => {
    const { contributions } = build();
    expect(contributions.map((contribution) => contribution.kind)).toEqual(["refine-score-sweep"]);
    // A sweep lane (one model call per card is long by construction) that a retry can safely re-run: the
    // stamp is an upsert of one derived scalar, so a restarted pass converges on the same scores.
    expect(contributions[0].lane).toBe("sweep");
    expect(contributions[0].resume).toBe("idempotent-restart");
    // No admission sub-partition: the kind IS its own concurrency unit (one score sweep per owner at a time).
    expect(contributions[0].admissionKey).toBeUndefined();
  });
});

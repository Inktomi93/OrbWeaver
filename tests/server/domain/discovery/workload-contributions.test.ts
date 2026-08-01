// Contribution test: discovery's five workload kinds. Pins what the ownership move must preserve — the
// per-verb PROJECTION into `AnalyticsResult` (these projections used to live at the entry tier, in
// compose/runner-env.ts) and the tunable PRECEDENCE (per-run param → the user's `UserSettings.workloads`
// knob → the domain's own floor, resolved by OMITTING the key so discovery applies its floor).

import type { UserSettings } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { WorkloadRunContext } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { DiscoveryWorkloadDeps } from "../../../../packages/server/src/domain/discovery/contract/service.ts";
import { createDiscoveryWorkloadContributions } from "../../../../packages/server/src/domain/discovery/workload-contributions.ts";
import { expect, test } from "../../../support/fixtures";

const OWNER_ID = castId<UserId>("user_owner");
const T0 = 1_700_000_000_000;

const ctx: WorkloadRunContext = { userId: OWNER_ID, ownerId: OWNER_ID, now: () => T0 };
const sig = (): AbortSignal => new AbortController().signal;

type Discovery = DiscoveryWorkloadDeps["discovery"];
type Contributions = ReturnType<typeof createDiscoveryWorkloadContributions>;

/** A fake discovery service — every verb a `vi.fn` returning the domain's RICHER stats shape, so a test
 *  asserts the contribution's projection down to `AnalyticsResult`, not a pass-through. */
function fakeDiscovery(): Discovery {
  // The contributions read ONLY the counts fields off each verb's stats — a full DiscoveryService factory
  // FABRICATION-OK: would state far more than these five run bodies touch.
  return {
    computeThemes: vi.fn(async () => ({ digestsAssigned: 10, clustersWritten: 5 })),
    distillCharacters: vi.fn(async () => ({ scanned: 8, distilled: 8 })),
    computeCooccurrence: vi.fn(async () => ({ charKeywordsWritten: 6, pairsWritten: 4 })),
    computeDuplicatePairs: vi.fn(async () => ({ charactersScanned: 7, pairsWritten: 1 })),
    computeChatDuplicatePairs: vi.fn(async () => ({ chatsScanned: 2, pairsWritten: 0 })),
    computeCharacterHubScores: vi.fn(async () => ({ rowsScored: 7 })),
  } as unknown as Discovery;
}

function build(settings: UserSettings = DEFAULT_USER_SETTINGS): { readonly discovery: Discovery; readonly contributions: Contributions } {
  const discovery = fakeDiscovery();
  return { discovery, contributions: createDiscoveryWorkloadContributions({ discovery, loadUserSettings: () => Promise.resolve(settings) }) };
}

function withKnobs(patch: Partial<UserSettings["workloads"]>): UserSettings {
  return { ...DEFAULT_USER_SETTINGS, workloads: { ...DEFAULT_USER_SETTINGS.workloads, ...patch } };
}

describe("compute-themes", () => {
  test("uses the per-run k and projects digestsAssigned/clustersWritten", async () => {
    const { discovery, contributions } = build();
    const result = await contributions[0].run(ctx, { k: 5 }, vi.fn(), sig());
    expect(discovery.computeThemes).toHaveBeenCalledWith({ ownerId: OWNER_ID, k: 5 });
    expect(result).toEqual({ scanned: 10, written: 5 });
  });

  test("falls back to the domain floor k when neither a param nor the user knob is set", async () => {
    const { discovery, contributions } = build();
    await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(discovery.computeThemes).toHaveBeenCalledWith({ ownerId: OWNER_ID, k: 12 });
  });

  test("uses the user's computeThemesK knob when no per-run k is supplied (PD-75)", async () => {
    const { discovery, contributions } = build(withKnobs({ computeThemesK: 7 }));
    await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(discovery.computeThemes).toHaveBeenCalledWith({ ownerId: OWNER_ID, k: 7 });
  });

  test("a per-run k overrides the user's computeThemesK knob", async () => {
    const { discovery, contributions } = build(withKnobs({ computeThemesK: 7 }));
    await contributions[0].run(ctx, { k: 3 }, vi.fn(), sig());
    expect(discovery.computeThemes).toHaveBeenCalledWith({ ownerId: OWNER_ID, k: 3 });
  });
});

describe("distill-characters", () => {
  test("distills and projects scanned/distilled", async () => {
    const { discovery, contributions } = build();
    const result = await contributions[1].run(ctx, {}, vi.fn(), sig());
    expect(discovery.distillCharacters).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 8, written: 8 });
  });

  test("a BULK row (ownerId null) OMITS ownerId so the verb sweeps every owner", async () => {
    const { discovery, contributions } = build();
    await contributions[1].run({ ...ctx, ownerId: null }, {}, vi.fn(), sig());
    const arg = vi.mocked(discovery.distillCharacters).mock.calls[0]?.[0];
    expect(arg).not.toHaveProperty("ownerId");
  });
});

describe("compute-cooccurrence", () => {
  test("computes cooccurrence and projects charKeywordsWritten/pairsWritten", async () => {
    const { discovery, contributions } = build();
    const result = await contributions[2].run(ctx, {}, vi.fn(), sig());
    expect(discovery.computeCooccurrence).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 6, written: 4 });
  });

  test("threads the user's maxPairs/hubFraction knobs into the verb", async () => {
    const { discovery, contributions } = build(withKnobs({ maxPairs: 5000, hubFraction: 0.25 }));
    await contributions[2].run(ctx, {}, vi.fn(), sig());
    expect(discovery.computeCooccurrence).toHaveBeenCalledWith(expect.objectContaining({ maxPairs: 5000, hubFraction: 0.25 }));
  });

  test("OMITS maxPairs/hubFraction when the knobs are unset (the verb reads its own floor)", async () => {
    const { discovery, contributions } = build();
    await contributions[2].run(ctx, {}, vi.fn(), sig());
    const arg = vi.mocked(discovery.computeCooccurrence).mock.calls[0]?.[0];
    expect(arg).not.toHaveProperty("maxPairs");
    expect(arg).not.toHaveProperty("hubFraction");
  });
});

describe("find-duplicates", () => {
  test("runs BOTH dedup arms and SUMS their counts", async () => {
    const { discovery, contributions } = build();
    const result = await contributions[3].run(ctx, {}, vi.fn(), sig());
    expect(discovery.computeDuplicatePairs).toHaveBeenCalledTimes(1);
    expect(discovery.computeChatDuplicatePairs).toHaveBeenCalledTimes(1);
    // character {scanned 7, written 1} + chat {scanned 2, written 0}
    expect(result).toEqual({ scanned: 9, written: 1 });
  });

  test("with neither a param nor the dupThreshold knob, OMITS threshold (the verb floors it)", async () => {
    const { discovery, contributions } = build();
    await contributions[3].run(ctx, {}, vi.fn(), sig());
    const arg = vi.mocked(discovery.computeDuplicatePairs).mock.calls[0]?.[0];
    expect(arg).not.toHaveProperty("threshold");
  });

  test("threads the user's dupThreshold when no per-run param is given; a param wins over it", async () => {
    const knobbed = build(withKnobs({ dupThreshold: 0.8 }));
    await knobbed.contributions[3].run(ctx, {}, vi.fn(), sig());
    expect(knobbed.discovery.computeDuplicatePairs).toHaveBeenCalledWith(expect.objectContaining({ threshold: 0.8 }));

    const overridden = build(withKnobs({ dupThreshold: 0.8 }));
    await overridden.contributions[3].run(ctx, { threshold: 0.95 }, vi.fn(), sig());
    expect(overridden.discovery.computeDuplicatePairs).toHaveBeenCalledWith(expect.objectContaining({ threshold: 0.95 }));
  });

  test("the cosine threshold NEVER reaches the chat (Jaccard) arm — a different metric", async () => {
    const { discovery, contributions } = build();
    await contributions[3].run(ctx, { threshold: 0.95 }, vi.fn(), sig());
    expect(discovery.computeChatDuplicatePairs).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });
});

describe("csls", () => {
  test("computes hub scores through the ONE discovery op and projects rowsScored", async () => {
    const { discovery, contributions } = build();
    const result = await contributions[4].run(ctx, {}, vi.fn(), sig());
    expect(discovery.computeCharacterHubScores).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 7, written: 7 });
  });
});

describe("the contribution set", () => {
  test("contributes exactly discovery's five kinds, all sweep-lane + idempotent-restart", () => {
    const { contributions } = build();
    expect(contributions.map((contribution) => contribution.kind).sort()).toEqual([
      "compute-cooccurrence",
      "compute-themes",
      "csls",
      "distill-characters",
      "find-duplicates",
    ]);
    for (const contribution of contributions) {
      expect(contribution.lane).toBe("sweep");
      expect(contribution.resume).toBe("idempotent-restart");
    }
  });
});

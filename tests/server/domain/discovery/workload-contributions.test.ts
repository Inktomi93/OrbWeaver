// Contribution test: discovery's five workload kinds. Pins what the ownership move must preserve — the
// per-verb PROJECTION into `AnalyticsResult` (these projections used to live at the entry tier, in
// compose/runner-env.ts) and the tunable PRECEDENCE (per-run param → the user's `UserSettings.workloads`
// knob → the domain's own floor, resolved by OMITTING the key so discovery applies its floor).

import type { UserSettings } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { WorkloadRunContext } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { DiscoveryWorkloadDeps } from "../../../../packages/server/src/domain/discovery/contract/service.ts";
import { createDiscoveryWorkloadContributions } from "../../../../packages/server/src/domain/discovery/workload-contributions.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER_ID = castId<UserId>("user_owner");
const T0 = 1_700_000_000_000;

const ctx: WorkloadRunContext = { userId: OWNER_ID, ownerId: OWNER_ID, now: () => T0 };
const sig = (): AbortSignal => new AbortController().signal;

type Discovery = DiscoveryWorkloadDeps["discovery"];
type Contributions = ReturnType<typeof createDiscoveryWorkloadContributions>;

/** A fake discovery service — every verb a `vi.fn` returning the domain's RICHER stats shape, so a test
 *  asserts the contribution's projection down to `AnalyticsResult`, not a pass-through. */
function fakeDiscovery(distill: DistillOverride = {}): Discovery {
  // The contributions read ONLY the counts fields off each verb's stats — a full DiscoveryService factory
  // FABRICATION-OK: would state far more than these five run bodies touch.
  return {
    computeThemes: vi.fn(async () => ({ digestsAssigned: 10, clustersWritten: 5 })),
    distillCharacters: vi.fn(async () => ({ scanned: 8, distilled: 8, failed: 0, skipped: 0, tagsStaged: 0, ...distill })),
    computeCooccurrence: vi.fn(async () => ({ charKeywordsWritten: 6, pairsWritten: 4 })),
    computeDuplicatePairs: vi.fn(async () => ({ charactersScanned: 7, pairsWritten: 1 })),
    computeChatDuplicatePairs: vi.fn(async () => ({ chatsScanned: 2, pairsWritten: 0 })),
    computeCharacterHubScores: vi.fn(async () => ({ rowsScored: 7 })),
  } as unknown as Discovery;
}

/** The distill stats a test wants the fake pass to report (the sweep's counts are what the progress line
 *  reads — a skipped/name-only card has no other reader). */
type DistillOverride = Partial<{ scanned: number; distilled: number; failed: number; skipped: number; tagsStaged: number }>;

/** One recorded terminal-fan emit (the `corpusRecomputed` freshness plane). */
interface UserEventCall {
  readonly userId: UserId;
  readonly event: UserBusEvent;
}

/** The BULK arm's announce audience — two owners, so a test can prove the fan is per-owner and not one. */
const BULK_OWNERS: readonly UserId[] = [castId<UserId>("user_alpha"), castId<UserId>("user_beta")];

function build(
  settings: UserSettings = DEFAULT_USER_SETTINGS,
  distill: DistillOverride = {},
): { readonly discovery: Discovery; readonly contributions: Contributions; readonly userEvents: UserEventCall[] } {
  const discovery = fakeDiscovery(distill);
  const userEvents: UserEventCall[] = [];
  const contributions = createDiscoveryWorkloadContributions({
    discovery,
    loadUserSettings: () => Promise.resolve(settings),
    emitUserEvent: (userId, event): void => void userEvents.push({ userId, event }),
    listCorpusOwners: () => Promise.resolve([...BULK_OWNERS]),
  });
  return { discovery, contributions, userEvents };
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

  // `AnalyticsResult` is scanned/written only, so the cards the sweep DECLINED to invent facets for (name-
  // only — owner ruling 2026-08-03) have exactly one reader: the closing progress line. A count nobody can
  // read is the silent-sweep version of the quiet button the on-demand refusal exists to end.
  test("the sweep REPORTS the name-only cards it skipped — with the fix, not a bare number", async () => {
    const { contributions } = build(DEFAULT_USER_SETTINGS, { scanned: 8, distilled: 6, skipped: 2 });
    const report = vi.fn();
    await contributions[1].run(ctx, {}, report, sig());
    const messages = report.mock.calls.map((c) => (c[0] as { message?: string }).message ?? "");
    expect(messages.at(-1)).toBe("distilled 6 of 8 characters — skipped 2 with no card text to summarize (add a description first)");
  });

  test("a sweep with nothing skipped says so plainly (no dangling zero-count clause)", async () => {
    const { contributions } = build();
    const report = vi.fn();
    await contributions[1].run(ctx, {}, report, sig());
    const messages = report.mock.calls.map((c) => (c[0] as { message?: string }).message ?? "");
    expect(messages.at(-1)).toBe("distilled 8 of 8 characters");
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

// THE TERMINAL FAN (event-bus coverage survey §2.5/§3.4-4/F6). Before it, these five passes wrote the
// derived tables 27 dashboard reads project and announced NOTHING on any plane — the writer is a workload,
// so not even the acting tab had an `invalidates` to hang on, and every one of those reads sat frozen at
// `staleTime: Infinity`. The fan is the ONLY freshness driver those surfaces have.
describe("the corpusRecomputed terminal fan", () => {
  test("every one of the five passes announces exactly once, to the scoped owner", async () => {
    // Each index gets its OWN harness, so the five runs are independent — parallel, not a sequential loop.
    const outcomes = await Promise.all(
      ([0, 1, 2, 3, 4] as const).map(async (index) => {
        const { contributions, userEvents } = build();
        await contributions[index].run(ctx, {}, vi.fn(), sig());
        return { kind: contributions[index].kind, userEvents };
      }),
    );
    for (const { kind, userEvents } of outcomes) {
      expect(userEvents, `contribution ${kind} must announce its terminal`).toEqual([{ userId: OWNER_ID, event: { type: "corpusRecomputed" } }]);
    }
  });

  test("a BULK pass (ownerId null) fans PER OWNER — a user-bus event reaches exactly one channel", async () => {
    const { contributions, userEvents } = build();
    await contributions[0].run({ ...ctx, ownerId: null }, {}, vi.fn(), sig());
    // Not one event for the pass, and NOT to `ctx.userId` (the triggering admin): a box-wide recompute
    // rewrites every owner's analytics, and anyone not told stays frozen until gcTime evicts.
    expect(userEvents).toEqual(BULK_OWNERS.map((userId) => ({ userId, event: { type: "corpusRecomputed" } })));
  });

  test("a pass that THROWS still announces what it already wrote (the fan is in a finally)", async () => {
    const { discovery, contributions, userEvents } = build();
    vi.mocked(discovery.computeCharacterHubScores).mockRejectedValueOnce(new Error("hub math blew up"));
    await expect(contributions[4].run(ctx, {}, vi.fn(), sig())).rejects.toThrow("hub math blew up");
    // These passes write incrementally and none of them rolls back, so a mid-pass failure leaves REAL new
    // rows on disk. Swallowing the announce there would freeze exactly the owner who just had work done.
    expect(userEvents).toEqual([{ userId: OWNER_ID, event: { type: "corpusRecomputed" } }]);
  });

  // FENCE, not a defect proof: it passes against the pre-fix source too (there was no enumerator to call).
  // It guards the cost rule — a per-user run must not pay a corpus-wide distinct-owner scan on every pass.
  test("the SCOPED arm never consults the bulk enumerator", async () => {
    const discovery = fakeDiscovery();
    const listCorpusOwners = vi.fn(() => Promise.resolve([...BULK_OWNERS]));
    const contributions = createDiscoveryWorkloadContributions({
      discovery,
      loadUserSettings: () => Promise.resolve(DEFAULT_USER_SETTINGS),
      emitUserEvent: () => undefined,
      listCorpusOwners,
    });
    await contributions[0].run(ctx, {}, vi.fn(), sig());
    // A per-user run must not pay a corpus-wide distinct-owner scan on every pass.
    expect(listCorpusOwners).not.toHaveBeenCalled();
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

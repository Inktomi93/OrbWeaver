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
function fakeDiscovery(planes: PlaneOverrides = {}): Discovery {
  const { distill = {}, themes = {}, cooccurrence = {}, embeddingPlane = {} } = planes;
  // The contributions read ONLY the counts fields off each verb's stats — a full DiscoveryService factory
  // @orb-waive no-test-fabrication(unknown): would state far more than these five run bodies touch. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return {
    // `digestsRead`/`soloDigestsRead` are the pass's REFUSAL signals (issue #166, widened by #558) — the
    // contribution branches on them, so the fake has to carry them or every test here silently exercises the
    // `undefined` path.
    computeThemes: vi.fn(async () => ({ digestsAssigned: 10, clustersWritten: 5, digestsRead: 10, soloDigestsRead: 10, ...themes })),
    distillCharacters: vi.fn(async () => ({ scanned: 8, distilled: 8, failed: 0, skipped: 0, tagsStaged: 0, ...distill })),
    computeCooccurrence: vi.fn(async () => ({ charKeywordsWritten: 6, pairsWritten: 4, digestsRead: 20, ...cooccurrence })),
    // `charactersScanned`/`chatsScanned`/`rowsScored` are the EMBEDDINGS-plane census (issue #561) — the two
    // passes below branch on them, so the fake carries them explicitly for the same reason the digest ones are
    // here: a missing field would silently exercise the `undefined` path.
    computeDuplicatePairs: vi.fn(async () => ({
      charactersScanned: embeddingPlane.charactersScanned ?? 7,
      pairsWritten: embeddingPlane.charPairsWritten ?? 1,
    })),
    computeChatDuplicatePairs: vi.fn(async () => ({
      chatsScanned: embeddingPlane.chatsScanned ?? 2,
      pairsWritten: embeddingPlane.chatPairsWritten ?? 0,
    })),
    computeCharacterHubScores: vi.fn(async () => ({ rowsScored: embeddingPlane.rowsScored ?? 7 })),
  } as unknown as Discovery;
}

/** The EMBEDDINGS-plane counts a test wants the fake passes to report. All-zero is the never-indexed corpus:
 *  `find-duplicates` reads card vectors + chat segment hashes, `csls` reads card vectors, and both planes are
 *  filled by the index pass — a different job from the memory backfill the digest reasons point at. */
type EmbeddingPlaneOverride = Partial<{
  charactersScanned: number;
  charPairsWritten: number;
  chatsScanned: number;
  chatPairsWritten: number;
  rowsScored: number;
}>;

/** The distill stats a test wants the fake pass to report (the sweep's counts are what the progress line
 *  reads — a skipped/name-only card has no other reader). */
type DistillOverride = Partial<{ scanned: number; distilled: number; failed: number; skipped: number; tagsStaged: number }>;

/** The theme stats a test wants the fake pass to report — `digestsRead: 0` is the digest-less corpus, and
 *  `soloDigestsRead: 0` with digests present is the group-rooms-only corpus (the pass clusters SOLO digests). */
type ThemesOverride = Partial<{ digestsAssigned: number; clustersWritten: number; digestsRead: number; soloDigestsRead: number }>;

/** The cooccurrence stats a test wants the fake pass to report — `digestsRead: 0` is the digest-less corpus
 *  (the same input plane as compute-themes: tier-0 memory digests). */
type CooccurrenceOverride = Partial<{ charKeywordsWritten: number; pairsWritten: number; digestsRead: number }>;

/** One recorded terminal-fan emit (the `corpusRecomputed` freshness plane). */
interface UserEventCall {
  readonly userId: UserId;
  readonly event: UserBusEvent;
}

/** The BULK arm's announce audience — two owners, so a test can prove the fan is per-owner and not one. */
const BULK_OWNERS: readonly UserId[] = [castId<UserId>("user_alpha"), castId<UserId>("user_beta")];

/** Every input plane a test can empty out, in one bag — the passes read four different populations and a
 *  positional tail of them outgrew what the house allows a signature to carry. */
interface PlaneOverrides {
  readonly distill?: DistillOverride;
  readonly themes?: ThemesOverride;
  readonly cooccurrence?: CooccurrenceOverride;
  readonly embeddingPlane?: EmbeddingPlaneOverride;
}

function build(
  settings: UserSettings = DEFAULT_USER_SETTINGS,
  planes: PlaneOverrides = {},
): { readonly discovery: Discovery; readonly contributions: Contributions; readonly userEvents: UserEventCall[] } {
  const discovery = fakeDiscovery(planes);
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
    expect(discovery.computeThemes).toHaveBeenCalledWith({ ownerId: OWNER_ID, funderUserId: OWNER_ID, k: 5 });
    expect(result).toEqual({ scanned: 10, written: 5 });
  });

  test("falls back to the domain floor k when neither a param nor the user knob is set", async () => {
    const { discovery, contributions } = build();
    await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(discovery.computeThemes).toHaveBeenCalledWith({ ownerId: OWNER_ID, funderUserId: OWNER_ID, k: 12 });
  });

  test("uses the user's computeThemesK knob when no per-run k is supplied", async () => {
    const { discovery, contributions } = build(withKnobs({ computeThemesK: 7 }));
    await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(discovery.computeThemes).toHaveBeenCalledWith({ ownerId: OWNER_ID, funderUserId: OWNER_ID, k: 7 });
  });

  test("a per-run k overrides the user's computeThemesK knob", async () => {
    const { discovery, contributions } = build(withKnobs({ computeThemesK: 7 }));
    await contributions[0].run(ctx, { k: 3 }, vi.fn(), sig());
    expect(discovery.computeThemes).toHaveBeenCalledWith({ ownerId: OWNER_ID, funderUserId: OWNER_ID, k: 3 });
  });

  // ── issue #166: a zero-input run STATES its reason instead of reporting a green nothing ────────────
  test("NO DIGESTS: the result carries `emptyReason`, not a bare 0-written success", async () => {
    // Observed live: `{scanned: 0, written: 0}` under a green Succeeded, rendered as "0 rows · 0 written".
    // A pass that could not run at all is indistinguishable, in that line, from one that ran and found
    // nothing — and only one of those is fixed by running the memory backfill.
    const { contributions } = build(DEFAULT_USER_SETTINGS, { themes: { digestsAssigned: 0, clustersWritten: 0, digestsRead: 0 } });
    const result = await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(result).toEqual({ scanned: 0, written: 0, emptyReason: "no-digests" });
  });

  test("NO DIGESTS: the progress line names the fix, not just the state", async () => {
    const { contributions } = build(DEFAULT_USER_SETTINGS, { themes: { digestsRead: 0, digestsAssigned: 0, clustersWritten: 0 } });
    const report = vi.fn();
    await contributions[0].run(ctx, {}, report, sig());
    expect(report).toHaveBeenCalledWith({ message: "no memory digests to cluster — run the memory backfill first" });
  });

  test("a real run carries NO emptyReason — the discriminator is for refusals only", async () => {
    const { contributions } = build();
    expect(await contributions[0].run(ctx, {}, vi.fn(), sig())).toEqual({ scanned: 10, written: 5 });
  });

  // ── issue #558: the refusal signal is the SOLO plane, not "any digest at all" ──────────────────────
  test("GROUP-ROOMS ONLY: digests exist but none are solo — the result STATES that, not a bare success", async () => {
    // The pass clusters SOLO digests (group-room digests belong to the synthetic group character, so
    // `generate.ts` filters them out before k-means). Keying the refusal on `digestsRead` alone therefore
    // left one live shape reporting `{scanned: 0, written: 0}` under a green Succeeded — the exact zero
    // that #166 exists to kill, one input plane over.
    const { contributions } = build(DEFAULT_USER_SETTINGS, { themes: { digestsRead: 12, soloDigestsRead: 0, digestsAssigned: 0, clustersWritten: 0 } });
    const result = await contributions[0].run(ctx, {}, vi.fn(), sig());
    expect(result).toEqual({ scanned: 0, written: 0, emptyReason: "no-solo-digests" });
  });

  test("GROUP-ROOMS ONLY: the progress line names the SOLO requirement, not the backfill", async () => {
    // A backfill has already run here — telling the user to run it again is the wrong fix sentence.
    const { contributions } = build(DEFAULT_USER_SETTINGS, { themes: { digestsRead: 12, soloDigestsRead: 0, digestsAssigned: 0, clustersWritten: 0 } });
    const report = vi.fn();
    await contributions[0].run(ctx, {}, report, sig());
    expect(report).toHaveBeenCalledWith({ message: "only group-room digests to cluster — story themes come from solo chats" });
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
    const { contributions } = build(DEFAULT_USER_SETTINGS, { distill: { scanned: 8, distilled: 6, skipped: 2 } });
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

  // ── issue #558: cooccurrence reads the SAME memory-digest plane as compute-themes ─────────────────
  test("NO DIGESTS: the result carries `emptyReason`, not a bare 0-written success", async () => {
    // Keyword cooccurrence tallies tier-0 memory digests. With none, every counter is legitimately zero and
    // the run console rendered "0 rows · 0 written" under a green Succeeded — a pass whose input does not
    // exist yet, indistinguishable from one that ran and changed nothing.
    const { contributions } = build(DEFAULT_USER_SETTINGS, { cooccurrence: { charKeywordsWritten: 0, pairsWritten: 0, digestsRead: 0 } });
    const result = await contributions[2].run(ctx, {}, vi.fn(), sig());
    expect(result).toEqual({ scanned: 0, written: 0, emptyReason: "no-digests" });
  });

  test("NO DIGESTS: the progress line names the fix", async () => {
    const { contributions } = build(DEFAULT_USER_SETTINGS, { cooccurrence: { charKeywordsWritten: 0, pairsWritten: 0, digestsRead: 0 } });
    const report = vi.fn();
    await contributions[2].run(ctx, {}, report, sig());
    expect(report).toHaveBeenCalledWith({ message: "no memory digests to tally — run the memory backfill first" });
  });

  test("a real run carries NO emptyReason — a zero-change tally is not a refusal", async () => {
    const { contributions } = build(DEFAULT_USER_SETTINGS, { cooccurrence: { charKeywordsWritten: 0, pairsWritten: 0, digestsRead: 20 } });
    expect(await contributions[2].run(ctx, {}, vi.fn(), sig())).toEqual({ scanned: 0, written: 0 });
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

  // ── issue #561: the EMBEDDINGS plane gets the same honest accounting as the digest plane ───────────
  test("NOTHING INDEXED: neither arm read a row — the result STATES that, not a bare 0-written success", async () => {
    // find-duplicates reads card VECTORS and chat segment hashes; both are produced by the index pass, not
    // by the memory backfill. On a corpus that has never been indexed every counter is legitimately zero and
    // the run console rendered "0 rows · 0 written" under a green Succeeded — the #166 zero, one plane over.
    const { contributions } = build(DEFAULT_USER_SETTINGS, {
      embeddingPlane: { charactersScanned: 0, charPairsWritten: 0, chatsScanned: 0, chatPairsWritten: 0 },
    });
    const result = await contributions[3].run(ctx, {}, vi.fn(), sig());
    expect(result).toHaveProperty("emptyReason", "no-embeddings");
    expect(result).toMatchObject({ scanned: 0, written: 0 });
  });

  test("NOTHING INDEXED: the progress line names the index pass, not the backfill", async () => {
    const { contributions } = build(DEFAULT_USER_SETTINGS, {
      embeddingPlane: { charactersScanned: 0, charPairsWritten: 0, chatsScanned: 0, chatPairsWritten: 0 },
    });
    const report = vi.fn();
    await contributions[3].run(ctx, {}, report, sig());
    expect(report).toHaveBeenCalledWith({ message: "nothing embedded to compare — run the embeddings index first" });
  });

  test("A POPULATED PLANE WITH NO DUPLICATES IS A REAL ANSWER — no emptyReason", async () => {
    // The discriminator is "the input did not exist", never "the output was empty". A library of 40 distinct
    // cards legitimately has zero near-duplicate pairs, and calling that a refusal would tell the user to run
    // a job that changes nothing — the same wrong-sentence failure #558 minted its own reason to avoid.
    const { contributions } = build(DEFAULT_USER_SETTINGS, {
      embeddingPlane: { charactersScanned: 40, charPairsWritten: 0, chatsScanned: 0, chatPairsWritten: 0 },
    });
    const result = await contributions[3].run(ctx, {}, vi.fn(), sig());
    expect(result).not.toHaveProperty("emptyReason");
  });
});

describe("csls", () => {
  test("computes hub scores through the ONE discovery op and projects rowsScored", async () => {
    const { discovery, contributions } = build();
    const result = await contributions[4].run(ctx, {}, vi.fn(), sig());
    expect(discovery.computeCharacterHubScores).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 7, written: 7 });
  });

  // ── issue #561: csls's input plane is the character-embedding table ────────────────────────────────
  test("NO CHARACTER EMBEDDINGS: the result STATES that, not a bare 0-scored success", async () => {
    // `rowsScored` IS the read census here — every vector the pass loads gets exactly one hub update — so
    // zero means the plane was empty, never that the maths found nothing. Rendered as "0 rows · 0 written",
    // that was indistinguishable from a calibration that ran.
    const { contributions } = build(DEFAULT_USER_SETTINGS, { embeddingPlane: { rowsScored: 0 } });
    const result = await contributions[4].run(ctx, {}, vi.fn(), sig());
    expect(result).toHaveProperty("emptyReason", "no-embeddings");
    expect(result).toMatchObject({ scanned: 0, written: 0 });
  });

  test("NO CHARACTER EMBEDDINGS: the progress line names the index pass", async () => {
    const { contributions } = build(DEFAULT_USER_SETTINGS, { embeddingPlane: { rowsScored: 0 } });
    const report = vi.fn();
    await contributions[4].run(ctx, {}, report, sig());
    expect(report).toHaveBeenCalledWith({ message: "no character embeddings to score — run the embeddings index first" });
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

// ── #1397: the SCOPED arm forwards its owner ────────────────────────────────────────────────────────
// `computeCooccurrence` documents an absent owner as ALL-OWNERS mode and honours it:
// `readOwnedDigestKeywords` drops the host predicate entirely, then `groupByOwner` + `replaceOwner`
// DELETE-and-REINSERT `keyword_cooccurrence` + `character_keyword_profiles` for every owner in the result.
// A scoped per-user run that forgot the id therefore read every tenant's digests AND destructively
// recomputed every tenant's derived rows. Its four siblings in this file all forward the owner.
describe("compute-cooccurrence — the owner belt (#1397)", () => {
  test("SECURITY: a SCOPED run forwards ctx.ownerId — it never sweeps (nor rewrites) every tenant", async () => {
    const { discovery, contributions } = build();
    await contributions[2].run(ctx, {}, vi.fn(), sig());
    expect(discovery.computeCooccurrence).toHaveBeenCalledWith(expect.objectContaining({ ownerId: OWNER_ID }));
  });

  test("a BULK row (ownerId null) forwards NULL — the all-owners mode stays reachable, on purpose only", async () => {
    const { discovery, contributions } = build();
    await contributions[2].run({ ...ctx, ownerId: null }, {}, vi.fn(), sig());
    expect(discovery.computeCooccurrence).toHaveBeenCalledWith(expect.objectContaining({ ownerId: null }));
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

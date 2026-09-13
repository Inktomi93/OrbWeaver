// Contribution test: `index`, the parameterized embeddings reindex. Dispatches on `source`: `text` →
// embedCorpus, `image` → embedAssets, `all` → BOTH (counts folded). Threads `force` + the enumeration
// `ownerId`, and projects the service's pass counts into the wire `EmbedPassResult`.

import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { WorkloadRunContext } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { EmbeddingsWorkloadDeps } from "../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { createEmbeddingsWorkloadContributions } from "../../../../packages/server/src/domain/embeddings/workload-contributions.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER_ID = castId<UserId>("user_owner");
const T0 = 1_700_000_000_000;
const ctx: WorkloadRunContext = { userId: OWNER_ID, ownerId: OWNER_ID, now: () => T0 };
const sig = (): AbortSignal => new AbortController().signal;

/** One recorded terminal-fan emit (the `corpusRecomputed` freshness plane). */
interface UserEventCall {
  readonly userId: UserId;
  readonly event: UserBusEvent;
}

/** The BULK arm's announce audience — two owners, so the per-owner fan is provable. */
const BULK_OWNERS: readonly UserId[] = [castId<UserId>("user_alpha"), castId<UserId>("user_beta")];

function build(): {
  readonly embeddings: EmbeddingsWorkloadDeps["embeddings"];
  readonly index: ReturnType<typeof createEmbeddingsWorkloadContributions>[0];
  readonly userEvents: UserEventCall[];
} {
  // @orb-waive no-test-fabrication(unknown): the contribution reads ONLY `.embedded`/`.skipped` off each pass result. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const embeddings = {
    embedCorpus: vi.fn(async () => ({ embedded: 3, skipped: 1 })),
    embedAssets: vi.fn(async () => ({ embedded: 2, skipped: 0 })),
  } as unknown as EmbeddingsWorkloadDeps["embeddings"];
  const userEvents: UserEventCall[] = [];
  const [index] = createEmbeddingsWorkloadContributions({
    embeddings,
    emitUserEvent: (userId, event): void => void userEvents.push({ userId, event }),
    listCorpusOwners: () => Promise.resolve([...BULK_OWNERS]),
  });
  return { embeddings, index, userEvents };
}

describe("index contribution", () => {
  test("source=text drives ONLY the corpus pass and projects its counts", async () => {
    const { embeddings, index } = build();
    const result = await index.run(ctx, { source: "text", force: true }, vi.fn(), sig());
    expect(embeddings.embedCorpus).toHaveBeenCalledWith({ ownerId: OWNER_ID, force: true, signal: expect.any(AbortSignal) });
    expect(embeddings.embedAssets).not.toHaveBeenCalled();
    expect(result).toEqual({ embedded: 3, skipped: 1 });
  });

  test("source=image drives ONLY the asset pass; force defaults to false", async () => {
    const { embeddings, index } = build();
    const result = await index.run(ctx, { source: "image" }, vi.fn(), sig());
    // `onProgress` is the pass's N-of-M sink (issue #166 rider 3) — matched by shape, since the closure
    // itself is the contribution's own and has no stable identity to assert against.
    expect(embeddings.embedAssets).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      force: false,
      signal: expect.any(AbortSignal),
      onProgress: expect.any(Function),
    });
    expect(embeddings.embedCorpus).not.toHaveBeenCalled();
    expect(result).toEqual({ embedded: 2, skipped: 0 });
  });

  test("source=all runs BOTH passes and folds the counts (the atomic reindex-everything unit)", async () => {
    const { embeddings, index } = build();
    const result = await index.run(ctx, { source: "all" }, vi.fn(), sig());
    expect(embeddings.embedCorpus).toHaveBeenCalledOnce();
    expect(embeddings.embedAssets).toHaveBeenCalledOnce();
    // corpus {embedded:3, skipped:1} + assets {embedded:2, skipped:0} folded.
    expect(result).toEqual({ embedded: 5, skipped: 1 });
  });

  test("a BULK row threads ownerId: null (the all-owners enumeration scope)", async () => {
    const { embeddings, index } = build();
    await index.run({ ...ctx, ownerId: null }, { source: "text" }, vi.fn(), sig());
    expect(embeddings.embedCorpus).toHaveBeenCalledWith(expect.objectContaining({ ownerId: null }));
  });

  // THE TERMINAL FAN (survey §2.5/F6). The sweep rewrites the vectors every `discovery.*` read and
  // `search.similarArt` derive from, and it is a workload — there was no mutation anywhere for a client to
  // hang an `invalidates` on, so those surfaces had NO freshness driver at all.
  test("announces `corpusRecomputed` ONCE at the terminal, to the scoped owner — never per embedded row", async () => {
    const { index, userEvents } = build();
    // `source: "all"` runs BOTH passes over 5 embedded rows; the announce is still exactly one.
    await index.run(ctx, { source: "all" }, vi.fn(), sig());
    expect(userEvents).toEqual([{ userId: OWNER_ID, event: { type: "corpusRecomputed" } }]);
  });

  test("a BULK sweep fans PER OWNER — a user-bus event reaches exactly one channel", async () => {
    const { index, userEvents } = build();
    await index.run({ ...ctx, ownerId: null }, { source: "text" }, vi.fn(), sig());
    expect(userEvents).toEqual(BULK_OWNERS.map((userId) => ({ userId, event: { type: "corpusRecomputed" } })));
  });

  test("an aborted/failed sweep still announces the rows it already embedded (the fan is in a finally)", async () => {
    const { embeddings, index, userEvents } = build();
    vi.mocked(embeddings.embedCorpus).mockRejectedValueOnce(new Error("provider down mid-sweep"));
    await expect(index.run(ctx, { source: "text" }, vi.fn(), sig())).rejects.toThrow("provider down mid-sweep");
    // The pass is resumable-by-skip and writes as it goes, so a mid-sweep failure leaves real new vectors.
    expect(userEvents).toEqual([{ userId: OWNER_ID, event: { type: "corpusRecomputed" } }]);
  });

  test("declares the sweep lane + idempotent-restart resume policy", () => {
    const { index } = build();
    expect(index.kind).toBe("index");
    expect(index.lane).toBe("sweep");
    expect(index.resume).toBe("idempotent-restart");
  });

  // The admission unit is ONE embed space: text and image sweep concurrently, two text sweeps do not. This
  // used to be a `kind === "index"` switch inside the QUEUE; it is the owning domain's declaration now.
  test("declares the embed SOURCE as its admission key (text ∥ image; two text sweeps collide)", () => {
    const { index } = build();
    expect(index.admissionKey?.({ source: "text" })).toBe("text");
    expect(index.admissionKey?.({ source: "image" })).toBe("image");
    expect(index.admissionKey?.({ source: "all" })).toBe("all");
    // `force` is not part of the unit — a forced pass must not slip past a running one.
    expect(index.admissionKey?.({ source: "text", force: true })).toBe(index.admissionKey?.({ source: "text" }));
  });
});

// Integration: the PD-40 distill producer — the character-summary + staged-tag-suggestion write-half.
// Load-bearing proofs:
//   • THE SWAPPABLE ROLE: distill runs on the INJECTED `summarize` thunk (the same seam the memory digest
//     summarizer uses). A FAKE summarize client drives the output — swapping it changes what's produced,
//     proving the model/agent is configurable (nothing bespoke is hard-wired). The `responseFormat` structured-
//     output knob (D79) is passed through (asserted).
//   • THE STAGING: parsed `tags[]` land as `source:'auto', status:'pending'` junction rows via the REAL
//     `tag.attachCardTagByName` seam (injected, over the same db) — the Accept/Reject queue's producer.
//   • IDEMPOTENT / NO-DOWNGRADE: a re-run refreshes the summary in place and never flips an ACCEPTED tag
//     back to pending. SYNTHETIC group characters are excluded.

import { PROSE_SLOTS } from "@orb/contracts/prose";
import type { SummarizeInput, SummarizeOptions } from "@orb/contracts/role-clients";
import { characterSummaries, characterTags, tags as tagsTable } from "@orb/db";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { createTagService } from "@orb/server/domain/tag";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import type { DiscoveryContext } from "../../../../../packages/server/src/domain/discovery/index.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeTagHarness } from "../../tag/_support.ts";
import { makeDiscoveryHarness, seedCharacter, seedUser } from "../_support.ts";

// A canned distillation reply (the FAKE summarize returns this per input) — the tags here are what must land
// as pending suggestions, proving the INJECTED role drives the output.
const DISTILL_REPLY = JSON.stringify({
  genre: "fantasy",
  subGenres: ["adventure"],
  tone: "whimsical",
  setting: "a floating archipelago",
  tags: ["airships", "found-family", "sky-pirates"],
  elevatorPitch: "A runaway cartographer maps the last uncharted sky.",
  overview: "She trades star-charts for passage. RP is wry banter over open ocean-of-clouds.",
});

/** A swappable FAKE `summarize` client returning a fixed reply per input + recording the structured-output
 *  opts (so the test asserts `responseFormat` was threaded through the role seam). The `model` differs from the
 *  stamped `summarizerModel` on purpose — the summary row stamps the CONFIGURED model id, not the reply's. */
function makeDistillSummarize(reply: string): {
  readonly op: DiscoveryContext["summarize"];
  readonly schemas: unknown[];
} {
  const schemas: unknown[] = [];
  const op: DiscoveryContext["summarize"] = (inputs: SummarizeInput[], opts?: SummarizeOptions) => {
    schemas.push(opts?.responseFormat);
    return Promise.resolve({
      items: inputs.map(() => ({
        text: reply,
        usage: { tokensIn: null, tokensOut: null, costUsd: null },
      })),
      model: "swapped-in-model",
    });
  };
  return { op, schemas };
}

// A reply that PARSES as JSON but fails the payload schema (no required fields) — drives the per-card retry
// with a real zod-issue correction; `{}` extracts as an object so the correction names the missing fields.
const SCHEMA_FAIL_REPLY = "{}";

/** A distill-shaped `summarize` PROBE. The FIRST call is the batch (one reply per card, decided by
 *  `batchReply(userPrompt)`); every LATER call is a per-card RETRY (single input) routed to `retry(userPrompt)`,
 *  which may reject to simulate a provider error. Records the batch + retry inputs and the PEAK number of
 *  retries in flight at once — the observable that pins the bounded-concurrency fan-out (F2). */
function makeDistillProbe(cfg: { readonly batchReply: (userPrompt: string) => string; readonly retry?: (userPrompt: string) => Promise<string> }): {
  readonly op: DiscoveryContext["summarize"];
  readonly batchInputs: string[];
  readonly retryInputs: string[];
  readonly peakConcurrentRetries: () => number;
} {
  const batchInputs: string[] = [];
  const retryInputs: string[] = [];
  let calls = 0;
  let inFlight = 0;
  let peak = 0;
  const usage = { tokensIn: null, tokensOut: null, costUsd: null };
  const op: DiscoveryContext["summarize"] = async (inputs: SummarizeInput[], _opts?: SummarizeOptions) => {
    if (calls === 0) {
      calls += 1;
      for (const i of inputs) {
        batchInputs.push(i.userPrompt);
      }
      return { items: inputs.map((i) => ({ text: cfg.batchReply(i.userPrompt), usage })), model: "probe" };
    }
    calls += 1;
    const prompt = inputs[0]?.userPrompt ?? "";
    retryInputs.push(prompt);
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    try {
      // A macrotask barrier so sibling retries in the same wave pile up BEFORE any resolves — that peak is
      // what a lost concurrency bound (a naive Promise.all over the whole batch) would blow past.
      await new Promise((r) => setTimeout(r, 5));
      const text = cfg.retry ? await cfg.retry(prompt) : "";
      return { items: [{ text, usage }], model: "probe" };
    } finally {
      inFlight -= 1;
    }
  };
  return { op, batchInputs, retryInputs, peakConcurrentRetries: () => peak };
}

describe("distillCharacters", () => {
  test("runs on the injected summarize role and stages its tags as source:auto/pending", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const character = await seedCharacter(db, {
      id: "character_hero",
      ownerId: owner,
      name: "Wren",
      description: "A sky cartographer.",
    });
    // A synthetic group character must be EXCLUDED (no real card, would stage nonsense tags).
    await seedCharacter(db, { id: "character_group", ownerId: owner, synthetic: true });

    const summarize = makeDistillSummarize(DISTILL_REPLY);
    const tagSvc = createTagService(makeTagHarness(db).ctx);
    // The harness default `summarize` returns theme NAMES; override it with our distill-shaped fake (and the
    // real tag seam + a configured model id) on the ctx the service closes over.
    const svc = createDiscoveryService({
      ...makeDiscoveryHarness(db, {
        attachCardTagByName: tagSvc.attachCardTagByName,
        summarizerModel: "configured-summarizer",
      }).ctx,
      summarize: summarize.op,
    });

    const stats = await svc.distillCharacters();

    // ONE non-synthetic card distilled (the synthetic group char was skipped).
    expect(stats).toMatchObject({ scanned: 1, distilled: 1, failed: 0, tagsStaged: 3 });
    // The structured-output schema was threaded through the role seam.
    expect(summarize.schemas[0]).toBeDefined();

    // The summary row carries the parsed facets + the CONFIGURED model id (not the reply's `model`).
    const summary = await db.select().from(characterSummaries).where(eq(characterSummaries.characterId, character));
    expect(summary[0]).toMatchObject({
      genre: "fantasy",
      tone: "whimsical",
      setting: "a floating archipelago",
      elevatorPitch: "A runaway cartographer maps the last uncharted sky.",
      model: "configured-summarizer",
    });
    expect(summary[0]?.tags).toEqual(["airships", "found-family", "sky-pirates"]);
    expect(summary[0]?.subGenres).toEqual(["adventure"]);

    // The tags landed as source:'auto', status:'pending' junction rows (the review queue's producer).
    const staged = await db
      .select({ name: tagsTable.name, source: tagsTable.source, status: characterTags.status })
      .from(characterTags)
      .innerJoin(tagsTable, eq(characterTags.tagId, tagsTable.id))
      .where(eq(characterTags.characterId, character));
    expect(staged).toHaveLength(3);
    expect(staged.every((r) => r.source === "auto")).toBe(true);
    expect(staged.every((r) => r.status === "pending")).toBe(true);
    expect(staged.map((r) => r.name).sort()).toEqual(["airships", "found-family", "sky-pirates"]);

    // The synthetic character got NO summary + NO staged tags.
    const groupSummary = await db
      .select()
      .from(characterSummaries)
      .where(eq(characterSummaries.characterId, castId("character_group")));
    expect(groupSummary).toHaveLength(0);
  });

  test("swapping the injected summarize client changes what is produced (the role is configurable)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const character = await seedCharacter(db, { id: "character_x", ownerId: owner, name: "X" });
    const tagSvc = createTagService(makeTagHarness(db).ctx);
    const altReply = JSON.stringify({
      genre: "horror",
      subGenres: [],
      tone: "dark",
      setting: "a drowned city",
      tags: ["eldritch", "isolation", "dread"],
      elevatorPitch: "The lighthouse keeper hears something answer back.",
      overview: "Slow-burn cosmic horror. RP is dread and diminishing hope.",
    });
    const svc = createDiscoveryService({
      ...makeDiscoveryHarness(db, { attachCardTagByName: tagSvc.attachCardTagByName }).ctx,
      summarize: makeDistillSummarize(altReply).op,
    });

    await svc.distillCharacters({ characterId: character, ownerId: owner });

    const staged = await db
      .select({ name: tagsTable.name })
      .from(characterTags)
      .innerJoin(tagsTable, eq(characterTags.tagId, tagsTable.id))
      .where(eq(characterTags.characterId, character));
    // The staged tags are the SWAPPED client's output — proving nothing is hard-wired.
    expect(staged.map((r) => r.name).sort()).toEqual(["dread", "eldritch", "isolation"]);
  });

  // ── PROSE-1 `discovery.distill.system` ────────────────────────────────────────────────────────────
  /** A summarize probe recording the SYSTEM prompt of every call. Call 1 (the batch) replies with a payload
   *  that parses as JSON but fails the schema, so the bounded per-card RETRY fires — which is the second
   *  call site the resolved prose has to reach (a retry on a different system prompt is a silent drift). */
  function makeSystemProbe(): { readonly op: DiscoveryContext["summarize"]; readonly systems: string[] } {
    const systems: string[] = [];
    let calls = 0;
    const usage = { tokensIn: null, tokensOut: null, costUsd: null };
    const op: DiscoveryContext["summarize"] = (inputs: SummarizeInput[], _opts?: SummarizeOptions) => {
      calls += 1;
      for (const i of inputs) {
        systems.push(i.systemPrompt);
      }
      const text = calls === 1 ? SCHEMA_FAIL_REPLY : DISTILL_REPLY;
      return Promise.resolve({ items: inputs.map(() => ({ text, usage })), model: "probe" });
    };
    return { op, systems };
  }

  test("an owner-narrowed run reads that owner's PROSE override — on the batch call AND the retry", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const character = await seedCharacter(db, { id: "character_z", ownerId: owner, name: "Z", description: "Z the zookeeper." });
    const probe = makeSystemProbe();
    const svc = createDiscoveryService({
      ...makeDiscoveryHarness(db, {
        resolveUserProse: () => Promise.resolve({ "discovery.distill.system": { text: "Summarize this card as JSON.", baseVersion: 1 } }),
      }).ctx,
      summarize: probe.op,
    });

    await svc.distillCharacters({ characterId: character, ownerId: owner });

    // Both the batch and the retry fired, and BOTH carried the host's bytes — one resolution, no drift.
    expect(probe.systems.length).toBeGreaterThanOrEqual(2);
    expect([...new Set(probe.systems)]).toStrictEqual(["Summarize this card as JSON."]);
  });

  test("the OWNERLESS whole-library batch resolves no prose at all — the shipped prompt stands", async () => {
    // Same rule the sampling rung already follows: a mixed-owner run has no single host to read, so it must
    // not silently pick one. `resolveUserProse` is never called and every card gets the default prompt.
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedCharacter(db, { id: "character_q", ownerId: owner, name: "Q", description: "Q the quartermaster." });
    const probe = makeSystemProbe();
    let proseReads = 0;
    const svc = createDiscoveryService({
      ...makeDiscoveryHarness(db, {
        resolveUserProse: () => {
          proseReads += 1;
          return Promise.resolve({ "discovery.distill.system": { text: "never reached", baseVersion: 1 } });
        },
      }).ctx,
      summarize: probe.op,
    });

    await svc.distillCharacters({});

    expect(proseReads).toBe(0);
    expect([...new Set(probe.systems)]).toStrictEqual([PROSE_SLOTS["discovery.distill.system"].text]);
  });

  test("a re-run never downgrades an ACCEPTED tag back to pending (idempotent no-downgrade)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const character = await seedCharacter(db, { id: "character_y", ownerId: owner, name: "Y" });
    const tagSvc = createTagService(makeTagHarness(db).ctx);
    const ctx = {
      ...makeDiscoveryHarness(db, { attachCardTagByName: tagSvc.attachCardTagByName }).ctx,
      summarize: makeDistillSummarize(DISTILL_REPLY).op,
    };
    const svc = createDiscoveryService(ctx);

    await svc.distillCharacters({ characterId: character, ownerId: owner });
    // Accept one suggestion (flip pending → accepted).
    const airships = await db
      .select()
      .from(tagsTable)
      .where(and(eq(tagsTable.ownerId, owner), eq(tagsTable.name, "airships")));
    const acceptedId = airships[0]?.id;
    expect(acceptedId).toBeDefined();
    await db
      .update(characterTags)
      .set({ status: "accepted" })
      .where(and(eq(characterTags.characterId, character), eq(characterTags.tagId, acceptedId as TagId)));

    // Re-run distill (same reply). The accepted tag must STAY accepted (onConflictDoNothing).
    await svc.distillCharacters({ characterId: character, ownerId: owner });
    const afterRerun = await db
      .select({ status: characterTags.status })
      .from(characterTags)
      .where(and(eq(characterTags.characterId, character), eq(characterTags.tagId, acceptedId as TagId)));
    expect(afterRerun[0]?.status).toBe("accepted");
  });

  test("a card invalid in the batch retries ONLY that card (its own text) — cards after it still land", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedCharacter(db, { id: "character_alpha", ownerId: owner, name: "Alpha", description: "Alpha the aeronaut." });
    await seedCharacter(db, { id: "character_beta", ownerId: owner, name: "Beta", description: "Beta the botanist." });
    await seedCharacter(db, { id: "character_gamma", ownerId: owner, name: "Gamma", description: "Gamma the gunslinger." });
    // Beta's batch reply fails validation; Alpha/Gamma parse first-try. Beta's retry recovers.
    const probe = makeDistillProbe({
      batchReply: (prompt) => (prompt.includes("Beta") ? SCHEMA_FAIL_REPLY : DISTILL_REPLY),
      retry: () => Promise.resolve(DISTILL_REPLY),
    });
    const svc = createDiscoveryService({ ...makeDiscoveryHarness(db).ctx, summarize: probe.op });

    const stats = await svc.distillCharacters({ ownerId: owner });

    // Only Beta retried — exactly one retry call, carrying Beta's text + the correction, NOT the other cards.
    expect(probe.retryInputs).toHaveLength(1);
    expect(probe.retryInputs[0]).toContain("Beta");
    expect(probe.retryInputs[0]).not.toContain("Alpha");
    expect(probe.retryInputs[0]).not.toContain("Gamma");
    // Beta recovered; every card (including Gamma, AFTER the failed one) committed a summary.
    expect(stats).toMatchObject({ scanned: 3, distilled: 3, failed: 0 });
    const summaries = await db.select({ id: characterSummaries.characterId }).from(characterSummaries);
    expect(summaries).toHaveLength(3);
  });

  test("a card that fails BOTH the batch and its retry counts failed — the pass completes and commits the rest", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedCharacter(db, { id: "character_alpha", ownerId: owner, name: "Alpha", description: "Alpha the aeronaut." });
    await seedCharacter(db, { id: "character_beta", ownerId: owner, name: "Beta", description: "Beta the botanist." });
    await seedCharacter(db, { id: "character_gamma", ownerId: owner, name: "Gamma", description: "Gamma the gunslinger." });
    // Beta fails the batch AND the retry (double failure); Alpha/Gamma parse first-try.
    const probe = makeDistillProbe({
      batchReply: (prompt) => (prompt.includes("Beta") ? SCHEMA_FAIL_REPLY : DISTILL_REPLY),
      retry: () => Promise.resolve(SCHEMA_FAIL_REPLY),
    });
    const svc = createDiscoveryService({ ...makeDiscoveryHarness(db).ctx, summarize: probe.op });

    const stats = await svc.distillCharacters({ ownerId: owner });

    expect(stats).toMatchObject({ scanned: 3, distilled: 2, failed: 1 });
    // Beta got no summary; the other two committed (a failed card never aborts the pass).
    const summaries = await db.select({ id: characterSummaries.characterId }).from(characterSummaries);
    expect(summaries.map((s) => s.id).sort()).toEqual([castId("character_alpha"), castId("character_gamma")]);
  });

  test("a retry that throws a provider error counts that card failed — the pass completes and commits the rest", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedCharacter(db, { id: "character_alpha", ownerId: owner, name: "Alpha", description: "Alpha the aeronaut." });
    await seedCharacter(db, { id: "character_beta", ownerId: owner, name: "Beta", description: "Beta the botanist." });
    await seedCharacter(db, { id: "character_gamma", ownerId: owner, name: "Gamma", description: "Gamma the gunslinger." });
    // Beta's retry hits an infra error (a 429/timeout the provider would throw) — it must NOT abort the pass.
    const probe = makeDistillProbe({
      batchReply: (prompt) => (prompt.includes("Beta") ? SCHEMA_FAIL_REPLY : DISTILL_REPLY),
      retry: () => Promise.reject(new Error("429 rate limited")),
    });
    const svc = createDiscoveryService({ ...makeDiscoveryHarness(db).ctx, summarize: probe.op });

    // The pass RESOLVES (pre-fix, the rethrown provider error aborted the whole batch before commit).
    const stats = await svc.distillCharacters({ ownerId: owner });

    expect(stats).toMatchObject({ scanned: 3, distilled: 2, failed: 1 });
    const summaries = await db.select({ id: characterSummaries.characterId }).from(characterSummaries);
    expect(summaries.map((s) => s.id).sort()).toEqual([castId("character_alpha"), castId("character_gamma")]);
  });

  test("a correlated schema failure (every card fails the batch) retries at BOUNDED concurrency, not a fan-out", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    // 20 cards (> the 8-wide retry bound) so an unbounded Promise.all would peak at 20 concurrent retries.
    const N = 20;
    await Promise.all(
      Array.from({ length: N }, (_unused, i) => {
        const tag = String(i).padStart(2, "0");
        return seedCharacter(db, { id: `character_c${tag}`, ownerId: owner, name: `Card${tag}`, description: `Card ${tag} bio.` });
      }),
    );
    // A schema-ignoring model fails EVERY card in the batch identically; each recovers on its retry.
    const probe = makeDistillProbe({
      batchReply: () => SCHEMA_FAIL_REPLY,
      retry: () => Promise.resolve(DISTILL_REPLY),
    });
    const svc = createDiscoveryService({ ...makeDiscoveryHarness(db).ctx, summarize: probe.op });

    const stats = await svc.distillCharacters({ ownerId: owner });

    // Every card retried (correlated failure), all recovered — and the peak in-flight retries stayed within the
    // 8-wide bound (an unbounded fan-out would peak at N = 20).
    expect(probe.retryInputs).toHaveLength(N);
    expect(probe.peakConcurrentRetries()).toBeGreaterThan(0);
    expect(probe.peakConcurrentRetries()).toBeLessThanOrEqual(8);
    expect(stats).toMatchObject({ scanned: N, distilled: N, failed: 0 });
  });
});

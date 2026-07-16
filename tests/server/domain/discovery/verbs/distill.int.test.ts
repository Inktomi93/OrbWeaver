// Integration: the PD-40 distill producer — the character-summary + staged-tag-suggestion write-half.
// Load-bearing proofs:
//   • THE SWAPPABLE ROLE: distill runs on the INJECTED `summarize` thunk (the same seam the memory digest
//     summarizer uses). A FAKE summarize client drives the output — swapping it changes what's produced,
//     proving the model/agent is configurable (nothing bespoke is hard-wired). The `jsonSchema` structured-
//     output knob is passed through (asserted).
//   • THE STAGING: parsed `tags[]` land as `source:'auto', status:'pending'` junction rows via the REAL
//     `tag.attachCardTagByName` seam (injected, over the same db) — the Accept/Reject queue's producer.
//   • IDEMPOTENT / NO-DOWNGRADE: a re-run refreshes the summary in place and never flips an ACCEPTED tag
//     back to pending. SYNTHETIC group characters are excluded.

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
 *  opts (so the test asserts `jsonSchema` was threaded through the role seam). The `model` differs from the
 *  stamped `summarizerModel` on purpose — the summary row stamps the CONFIGURED model id, not the reply's. */
function makeDistillSummarize(reply: string): {
  readonly op: DiscoveryContext["summarize"];
  readonly schemas: unknown[];
} {
  const schemas: unknown[] = [];
  const op: DiscoveryContext["summarize"] = (inputs: SummarizeInput[], opts?: SummarizeOptions) => {
    schemas.push(opts?.jsonSchema);
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
});

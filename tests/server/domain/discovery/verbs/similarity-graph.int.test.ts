// Integration: PD-40 similarityGraph — DISCOVERY-NATIVE all-pairs card cosine → nodes + edges (zero search).
// Every within-space pair over `minSimilarity` is an edge; nodes are the highest-degree characters, capped;
// name + distilled genre per node; owner-scoped (audit #1); synthetic characters excluded.

import type { Db } from "@orb/db";
import { characterSummaries } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  FROZEN_AT,
  makeDiscoveryHarness,
  seedCharacter,
  seedCharacterEmbedding,
  seedUser,
  vec,
} from "../_support.ts";

async function seedCard(
  db: Db,
  args: {
    id: string;
    ownerId: UserId;
    embedding: Float32Array;
    genre?: string;
    synthetic?: boolean;
    distill?: boolean;
  },
): Promise<CharacterId> {
  const id = await seedCharacter(db, {
    id: args.id,
    ownerId: args.ownerId,
    name: args.id,
    ...(args.synthetic !== undefined ? { synthetic: args.synthetic } : {}),
  });
  await seedCharacterEmbedding(db, { characterId: id, embedding: args.embedding });
  if (args.distill !== false) {
    await db.insert(characterSummaries).values({
      characterId: id,
      genre: args.genre ?? null,
      model: "test-summarize-model",
      computedAt: FROZEN_AT,
    });
  }
  return id;
}

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

describe("similarityGraph", () => {
  test("edges the near pairs, ranks nodes by degree, labels name + genre", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    // A/B/C are mutually near (a dense triangle); D is orthogonal (an isolated node — no edge).
    const a = await seedCard(db, {
      id: "alpha",
      ownerId: owner,
      embedding: vec(1, 0),
      genre: "fantasy",
    });
    const b = await seedCard(db, { id: "beta", ownerId: owner, embedding: vec(1, 0.02) });
    const c = await seedCard(db, { id: "gamma", ownerId: owner, embedding: vec(1, 0.04) });
    await seedCard(db, { id: "delta", ownerId: owner, embedding: vec(0, 1) });

    const graph = await svcFor(db).similarityGraph(owner);
    // The triangle A-B-C: three undirected edges, all over the 0.65 floor; D never edges.
    expect(graph.edges).toHaveLength(3);
    const ids = new Set(graph.nodes.map((n) => n.characterId));
    expect(ids).toEqual(new Set([a, b, c]));
    const alpha = graph.nodes.find((n) => n.characterId === a);
    expect(alpha).toMatchObject({ name: "alpha", genre: "fantasy", degree: 2 });
    for (const e of graph.edges) {
      expect(e.similarity).toBeGreaterThanOrEqual(0.65);
    }
  });

  test("maxNodes keeps the highest-degree dense core", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    // A hub (near everything) + three leaves near only the hub.
    await seedCard(db, { id: "hub", ownerId: owner, embedding: vec(1, 0) });
    await seedCard(db, { id: "leaf1", ownerId: owner, embedding: vec(1, 0.02) });
    await seedCard(db, { id: "leaf2", ownerId: owner, embedding: vec(1, 0.03) });
    await seedCard(db, { id: "leaf3", ownerId: owner, embedding: vec(1, 0.04) });

    const graph = await svcFor(db).similarityGraph(owner, { maxNodes: 1 });
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]?.name).toBe("hub");
    // Every edge endpoint must be a kept node — a one-node graph has no surviving edge.
    expect(graph.edges).toEqual([]);
  });

  test("synthetic characters are excluded; a lonely corpus yields an empty graph", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedCard(db, {
      id: "syn",
      ownerId: owner,
      embedding: vec(1, 0),
      synthetic: true,
      distill: false,
    });
    await seedCard(db, { id: "solo", ownerId: owner, embedding: vec(1, 0) });
    const graph = await svcFor(db).similarityGraph(owner);
    expect(graph).toEqual({ nodes: [], edges: [] });
  });

  test("a foreign owner sees an empty graph (audit #1)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    await seedCard(db, { id: "a", ownerId: owner, embedding: vec(1, 0) });
    await seedCard(db, { id: "b", ownerId: owner, embedding: vec(1, 0.02) });
    expect(await svcFor(db).similarityGraph(other)).toEqual({ nodes: [], edges: [] });
  });
});

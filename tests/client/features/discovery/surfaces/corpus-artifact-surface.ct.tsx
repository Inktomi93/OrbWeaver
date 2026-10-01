import type { CorpusDestination } from "@orb/client/lib";
import type { EmbedGenerationId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { CORPUS_PREVIEW_COVERAGE, corpusDigestSource } from "../../../../support/node/corpus-source.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CorpusArtifactReaderStory, CorpusEmbeddedResultsStory } from "../_ct-stories.tsx";

const MEMBERS = Array.from({ length: 14 }, (_unused, index) => ({
  characterId: mintTypeId(ID_PREFIX.character),
  name: `Member ${index + 1}`,
  avatarHash: null,
}));
const CLUSTER = {
  baseLabel: "mixed",
  label: "mixed",
  passId: "c".repeat(64),
  generationId: castId<EmbedGenerationId>("a".repeat(64)),
  fingerprint: "b".repeat(64),
  model: "encoder",
  genre: null,
  tone: null,
  topTags: [],
  size: MEMBERS.length,
  members: MEMBERS,
};
const GROUP = { kind: "cluster", cluster: CLUSTER, visual: false, k: 2, title: "Selected grouping" } satisfies CorpusDestination;

test("group detail retains every member from its selected pass after recompute", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.archetypes": [{ ...CLUSTER, passId: "d".repeat(64), members: MEMBERS.slice(0, 2), size: 2 }] });
  const component = await mount(<CorpusArtifactReaderStory destination={GROUP} />);
  await component.getByRole("button", { name: "Select evidence" }).click();
  await expect(component.getByRole("button", { name: "Back to Explore" })).toBeFocused();
  await expect(component.getByRole("button", { name: "Member 14", exact: true })).toBeVisible();
  await expect(component.getByRole("list").getByRole("listitem")).toHaveCount(14);
  await expect(component.getByRole("status").filter({ hasText: "Showing the selected membership snapshot" })).toBeVisible();
  await expect(component.getByText(`Generation: ${CLUSTER.generationId}`)).toBeVisible();
});

test("a different theme at the same cluster index cannot replace the selected theme identity", async ({ mount, page }) => {
  const row = {
    id: mintTypeId(ID_PREFIX.themeCluster),
    clusterIdx: 2,
    name: "Selected story theme",
    level: "scene" as const,
    model: "distiller",
    computedAt: 0,
    size: 4,
  };
  await routeTrpc(page, {
    "discovery.themeDetail": {
      ...row,
      id: mintTypeId(ID_PREFIX.themeCluster),
      name: "Replacement story theme",
      members: [],
      sources: [],
      sourceLimit: 20,
      timeline: [],
    },
  });
  const component = await mount(<CorpusArtifactReaderStory destination={{ kind: "theme", row }} />);
  await component.getByRole("button", { name: "Select evidence" }).click();
  await expect(component.getByRole("status").filter({ hasText: "Its selected identity is retained" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Selected story theme" })).toBeVisible();
  await expect(component.getByText("Replacement story theme", { exact: true })).toHaveCount(0);
});

for (const width of [360, 720]) {
  test(`a route's absent accounting stays unrecorded and its mean names its sample denominator at ${width}px`, async ({ mount }) => {
    const destination = {
      kind: "modelroute",
      route: {
        genre: "fantasy",
        model: "local",
        provider: null,
        generations: 20,
        tokensOut: null,
        tokensOutProvenance: "unrecorded",
        costUsd: null,
        avgGenTimeMs: 250,
        genTimeSamples: 2,
      },
    } satisfies CorpusDestination;
    const component = await mount(<CorpusArtifactReaderStory destination={destination} width={width} />);
    await component.getByRole("button", { name: "Select evidence" }).click();
    await expect(component.getByText("Returned tokens: not recorded")).toBeVisible();
    await expect(component.getByText("Cost: not recorded", { exact: true })).toBeVisible();
    await expect(component.getByText("Timing denominator: 2 generations with both timestamps, out of 20 generations in this route.")).toBeVisible();
    await expect(component.getByText("$0.00", { exact: false })).toHaveCount(0);
  });
}

test("embedded source previews cannot overwrite the retained Explore finder position", async ({ mount, page }) => {
  const hits = Array.from({ length: 20 }, (_unused, index) => {
    const blockKey = { chatId: mintTypeId(ID_PREFIX.chat), scopedCharacterId: mintTypeId(ID_PREFIX.character), tier: 0, blockIdx: index };
    return {
      blockKey,
      source: corpusDigestSource(blockKey),
      score: 0,
      relevance: 0.9,
      text: `Embedded evidence ${index}`,
      chatTitle: `Room ${index}`,
      scopedCharacterName: "Witness",
    };
  });
  await routeTrpc(page, { "search.search": { over: "digests", coverage: CORPUS_PREVIEW_COVERAGE, hits } });
  const component = await mount(<CorpusEmbeddedResultsStory />);
  const list = component.getByRole("list", { name: "Search results — Memories" });
  await expect(list.getByRole("button", { name: "Room 19", exact: true })).toHaveCount(1);
  await component.getByRole("button", { name: "Remember finder position" }).click();
  await list.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await component.getByRole("button", { name: "Read finder position" }).click();
  await expect(component.getByTestId("ct-finder-position")).toHaveText("240");
});

// A message bubble's fill paints apart from the page in every carried palette, so the bubble style never reads as no bubble.
import { BUBBLE_HOSTS, bubblePageMisses, carriedInks, carriedTonePalette } from "@orb/kit/theme-derivation";
import { ACCEPTED_BASES } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

test("every accepted base derives bubble fills that paint the bubble separation off the page", () => {
  const misses = ACCEPTED_BASES.flatMap((base) => {
    const palette = carriedTonePalette(base, carriedInks(base));
    const fills = Object.fromEntries(BUBBLE_HOSTS.map((host) => [host, palette.hosts[host]]));
    return bubblePageMisses(palette.background, fills).map(({ host, distance }) => `${JSON.stringify(base)} ${host} ${distance.toFixed(4)}`);
  });
  expect(misses).toEqual([]);
});

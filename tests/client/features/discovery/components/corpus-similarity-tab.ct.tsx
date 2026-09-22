// CT: the Corpus CONTEXT "Similarity" tab's INFORMATION ARCHITECTURE on a populated library (#554,
// docs/reviews/side-eye/2026-08-23-rail-corpus-populated.md [P1-2]).
//
// WHY THIS FILE EXISTS. At 12 characters this tab was one pair row and every claim below was vacuously
// true. At 327 the sweep measured `pairRows: 1782 · clickablePairs: 0 · panelScrollH: 56177` against a
// 1,493px panel — 37.6 screens — with the three duplicate headings, the tab's actual JOBS, beginning
// 52,151px down. All three defects are VOLUME defects, so the fixture is what had to change; the
// assertions are ordinary geometry and ordinary roles.
//
// WHAT EACH TEST PINS:
//   • the three duplicate FINDINGS sections render above the raw edge list, within the first viewport;
//   • the edge list draws a bounded head and STATES what it left out;
//   • a character pair row is a control that LANDS — the Compare surface renders the pair it seeded, which
//     is the only honest receipt for a module-private store (a click that "fires" proves nothing);
//   • a chat pair row is a control too, and its door goes somewhere that exists.
//
// BARRIER DISCIPLINE: every test waits on a heading the SETTLED arm produces. The tab's three duplicate
// reads are suspense reads behind one QueryBoundary, and the edge list is a separate non-suspending query,
// so "Nearest pairs" being visible is the settle for the section order and the pair list needs its own.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CorpusSimilarityTabStory, CorpusSimilarityToCompareStory } from "../_ct-stories.tsx";

/** The truncation line the capped list owes — matched loosely so the cap can be re-tuned without a re-red. */
const TRUNCATION_NOTE = /Showing the closest \d+ of \d+ pairs/;
/** The two pair rows the door tests click, by their rendered face. */
const CHARACTER_PAIR = /Freya ↔ Frida/;
const CHAT_PAIR = /Ayami — Aug 18, 2025 \(3\) ↔ Ayami — Aug 19, 2025 \(4\)/;
/** N8: the chat door's destination, in the accessible NAME rather than a hover-only `title`. */
const CHAT_PAIR_DESTINATION = /opens Ayami — Aug 18, 2025 \(3\)/;
/** #564: a pairwise row naming a clique member — the expansion the collapse deletes. */
const CLIQUE_PAIR_ROW = /Card A ↔ Card/;
/** …and the one near-identical pair that must NOT collapse (0.97 is not a transitive relation). */
const SUB_IDENTICAL_PAIR = /Yuki ↔ Yuuna/;

/** More edges than any cap, ranked so the head is predictable. Proportional to the audited 1,782. */
const EDGE_COUNT = 120;
const NODES = Array.from({ length: EDGE_COUNT + 1 }, (_, index) => ({ characterId: `character_${index}`, name: `Node ${index}` }));
const EDGES = Array.from({ length: EDGE_COUNT }, (_, index) => ({
  source: "character_0",
  target: `character_${index + 1}`,
  similarity: 0.99 - index * 0.001,
}));

const DUP_CHARACTERS = [
  {
    id: "dupchar_1",
    characterIdA: "character_freya",
    characterIdB: "character_frida",
    nameA: "Freya",
    nameB: "Frida",
    similarity: 0.81,
    cslsScore: 0.4,
    model: "m",
    computedAt: 1,
  },
];
const DUP_ART = [{ characterIdA: "character_yuki", nameA: "Yuki", characterIdB: "character_yuuna", nameB: "Yuuna", similarity: 0.97 }];
const DUP_CHATS = [
  {
    id: "dupchat_1",
    chatIdA: "chat_aug18",
    chatIdB: "chat_aug19",
    titleA: "Ayami — Aug 18, 2025 (3)",
    titleB: "Ayami — Aug 19, 2025 (4)",
    similarity: 1,
    cslsScore: 0.9,
    relation: "forked",
    model: "m",
    computedAt: 1,
  },
] satisfies TrpcWireOutput<"discovery.duplicateChats">;

const POPULATED: TrpcRoutes<
  | "discovery.duplicateCharacters"
  | "discovery.duplicateChats"
  | "discovery.imageDuplicates"
  | "discovery.similarityGraph"
  | "discovery.browseCharacters"
  | "discovery.compareCharacters"
> = {
  "discovery.duplicateCharacters": DUP_CHARACTERS,
  "discovery.duplicateChats": DUP_CHATS,
  "discovery.imageDuplicates": DUP_ART,
  "discovery.similarityGraph": { nodes: NODES, edges: EDGES },
  // The Compare tab's own picker read (only the two-tab story mounts it).
  "discovery.browseCharacters": {
    items: [
      { characterId: "character_freya", name: "Freya", avatarHash: null, genre: null, tone: null, elevatorPitch: null },
      { characterId: "character_frida", name: "Frida", avatarHash: null, genre: null, tone: null, elevatorPitch: null },
    ],
    nextCursor: null,
    totalCount: 2,
  },
  "discovery.compareCharacters": {
    a: { characterId: "character_freya", name: "Freya" },
    b: { characterId: "character_frida", name: "Frida" },
    sameGenre: true,
    sameTone: false,
    redundancy: 0.42,
    sharedTags: ["elf"],
    onlyA: ["knight"],
    onlyB: ["mage"],
  },
};

/** The tab's settle: the raw list's own heading, which renders only once the three suspense reads land. */
async function settled(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Nearest pairs" })).toBeVisible();
}

test("#554: the duplicate FINDINGS lead, and the raw pair list follows them", async ({ mount, page }) => {
  await routeTrpc(page, POPULATED);
  const component = await mount(<CorpusSimilarityTabStory />);
  await settled(page);

  const offsets = await component.evaluate((root) => {
    const top = root.getBoundingClientRect().top;
    const at = (text: string): number => {
      const heading = [...root.querySelectorAll("h2, h3")].find((node) => (node.textContent ?? "") === text);
      if (heading === undefined) {
        throw new Error(`no heading ${text}`);
      }
      return heading.getBoundingClientRect().top - top + (root.scrollTop || 0);
    };
    return {
      characters: at("Duplicate characters"),
      art: at("Duplicate art"),
      chats: at("Duplicate chats"),
      nearest: at("Nearest pairs"),
      viewport: root.clientHeight,
    };
  });

  // THE DEFECT: 52,151 / 52,270 / 54,882px. The findings are what the tab is FOR; the edge list is the
  // raw material they were found in.
  expect(offsets.characters, "the first finding section is the top of the tab").toBeLessThan(offsets.art);
  expect(offsets.chats, "…and all three precede the raw list").toBeLessThan(offsets.nearest);
  expect(offsets.chats, "…within the first viewport, which is the whole of [P1-2]").toBeLessThan(offsets.viewport);
});

test("#554: the raw pair list draws a bounded head and states what it left out", async ({ mount, page }) => {
  await routeTrpc(page, POPULATED);
  const component = await mount(<CorpusSimilarityTabStory />);
  await settled(page);

  // SCOPED TO THE RAW LIST'S OWN SECTION. Since the IA fix the FIRST pair button on this tab belongs to
  // "Duplicate characters" — which is the point of the sibling test — so an unscoped `.first()` would
  // measure the findings and report the ranking as broken.
  const section = component.locator("section").filter({ has: page.getByRole("heading", { name: "Nearest pairs" }) });
  // SETTLED for THIS arm: the truncation line, which only the resolved graph query produces (the edge
  // list is a plain query beside three suspense reads, so the section heading above is not its settle).
  const note = section.getByText(TRUNCATION_NOTE);
  await expect(note).toBeVisible();
  await expect(note, "the denominator is the whole ranked graph, not the drawn head").toContainText(`of ${EDGE_COUNT.toString()} pairs`);

  const rows = section.getByRole("button").filter({ hasText: "↔" });
  const drawn = await rows.count();
  expect(drawn, "a bounded head — 1,782 un-clickable rows is what 37.6 screens of panel scroll were made of").toBeLessThan(EDGE_COUNT);
  // …and the head is the TOP of the ranking, not an arbitrary window.
  await expect(rows.first()).toContainText("99%");
});

test("#554: a character pair row is a door that LANDS in Compare, pre-filled", async ({ mount, page }) => {
  await routeTrpc(page, POPULATED);
  const component = await mount(<CorpusSimilarityToCompareStory />);
  await settled(page);

  // Before the click the Compare surface is at its rest state — the receipt only means something if the
  // pair was NOT already there.
  await expect(component.getByText("Pick two different characters to compare.")).toBeVisible();

  await component.getByRole("button", { name: CHARACTER_PAIR }).click();

  // THE LANDING, not the firing: the Compare surface renders the diff for the pair the row carried.
  await expect(component.getByRole("heading", { name: "Facet diff" })).toBeVisible();
  await expect(component.getByText("Pick two different characters to compare.")).toHaveCount(0);
  await expect(component.getByText("Redundancy:", { exact: false })).toBeVisible();
});

test("#563: the Compare pickers NAME a seeded pair that is off the catalog page", async ({ mount, page }) => {
  // THE DEFECT, exactly: a Select resolves its trigger text out of the `items` it was handed, and this tab
  // reads ONE page of `browseCharacters`. A pair seeded from a 313-card similarity list routinely is not in
  // it, so both triggers printed raw ULIDs over a body that named the same two characters in words. The
  // fixture is the page WITHOUT the pair — which is the only arm the old code could fail.
  await routeTrpc(page, {
    ...POPULATED,
    "discovery.browseCharacters": {
      items: [{ characterId: "character_someone_else", name: "Someone Else", avatarHash: null, genre: null, tone: null, elevatorPitch: null }],
      nextCursor: null,
      totalCount: 1,
    },
  });
  const component = await mount(<CorpusSimilarityToCompareStory />);
  await settled(page);

  await component.getByRole("button", { name: CHARACTER_PAIR }).click();
  // Barrier on the settled landing, then read the triggers.
  await expect(component.getByRole("heading", { name: "Facet diff" })).toBeVisible();

  const first = component.getByRole("combobox", { name: "First character" });
  const second = component.getByRole("combobox", { name: "Second character" });
  await expect(first, "the picker names the character, never its database key").toContainText("Freya");
  await expect(second).toContainText("Frida");
  await expect(first).not.toContainText("character_");
  await expect(second).not.toContainText("character_");
});

test("#554: a chat pair row is a control too, and names the room it opens", async ({ mount, page }) => {
  await routeTrpc(page, POPULATED);
  const component = await mount(<CorpusSimilarityTabStory />);
  await settled(page);

  // The house rowQualifier treatment the report singled out as the one this section already gets right —
  // now inside a control instead of beside one.
  const row = component.getByRole("button", { name: CHAT_PAIR });
  await expect(row).toBeVisible();
  await expect(row, "the badge and the score ride the visible face, so the row shows its own finding").toContainText("forked");
  // N8: the destination used to live in a `title` tooltip — invisible to touch, to keyboard, and to a
  // screen reader announcing the button's content. It is in the accessible NAME now, and the section says
  // the rule once above the rows.
  await expect(row).toHaveAccessibleName(CHAT_PAIR_DESTINATION);
  await expect(component.getByText("opening a pair opens the first of the two chats", { exact: false })).toBeVisible();
});

test("#564: an identical-art clique is ONE finding, not C(n,2) pairwise rows", async ({ mount, page }) => {
  // The audited section drew 82 rows / 3,572px because twelve cards sharing a placeholder portrait expand
  // to 66 pairs at 100%. Four cards is the same defect at a size a fixture can state: C(4,2) = 6 rows.
  const clique = ["a", "b", "c", "d"];
  const cliquePairs = clique.flatMap((left, index) =>
    clique.slice(index + 1).map((right) => ({
      characterIdA: `character_${left}`,
      nameA: `Card ${left.toUpperCase()}`,
      characterIdB: `character_${right}`,
      nameB: `Card ${right.toUpperCase()}`,
      similarity: 1,
    })),
  );
  await routeTrpc(page, { ...POPULATED, "discovery.imageDuplicates": [...cliquePairs, ...DUP_ART] });
  const component = await mount(<CorpusSimilarityTabStory />);
  await settled(page);

  // ONE row states the group…
  await expect(component.getByText("4 cards share this portrait")).toBeVisible();
  // …and the six pairwise rows it replaced are gone: no ↔ row mentions a clique member.
  await expect(component.getByRole("button", { name: CLIQUE_PAIR_ROW })).toHaveCount(0);
  // …while every member stays reachable as its own door.
  await expect(component.getByRole("button", { name: "Card D", exact: true })).toBeVisible();
  // The unrelated sub-identical pair is untouched — that relation is not transitive and never collapses.
  await expect(component.getByRole("button", { name: SUB_IDENTICAL_PAIR })).toBeVisible();
});

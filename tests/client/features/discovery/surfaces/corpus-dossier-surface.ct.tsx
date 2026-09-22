// CT: the Corpus CONTENT dossier's ASK panel — the answer's PROVENANCE badge. Drives the production path
// (`askCard` through the real data layer) and pins the three states apart, because they are three different
// claims by two different authors and the copy is the only place a user can tell them apart:
//   • grounded    — the MODEL says its answer is supported by the sampled scenes.
//   • speculative — the MODEL says it is not.
//   • degraded    — OURS: the reply failed the payload schema twice, so the body is raw unparsed text and the
//                   model made no claim at all. Before the degrade travelled as data this rendered as
//                   "Speculative", blaming the model for our parse failure and hiding that nothing validated.
// Each case barriers on the SETTLED badge (`data-answer-state`), never on an in-flight fetching state.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcFixtureOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CorpusDossierSurfaceStory } from "../_ct-stories.tsx";

const DOSSIER = {
  characterId: "char_aria",
  name: "Aria",
  genre: "fantasy",
  tone: "dark",
  elevatorPitch: "A cursed knight walking north.",
  tags: ["rogue"],
  portrait: null,
  refineryScore: null,
  similar: [],
};

/** The dossier's other reads, stubbed flat so only the ASK answer varies between cases. */
async function routeDossier(
  page: Page,
  answer: TrpcFixtureOutput<"discovery.askCard">,
  dossier: TrpcFixtureOutput<"discovery.characterDossier"> = DOSSIER,
): Promise<void> {
  await routeTrpc(page, {
    "discovery.characterDossier": dossier,
    "discovery.characterKeywords": [],
    "search.similarArt": [],
    "discovery.askCard": answer,
  });
}

const QUESTION = "What drives them?";
// The quality readout's two locators, matched by their leading copy.
const SCORE_READOUT = /Refinery score:/;
const NOT_SCORED = /Not scored yet/;
/** B8/U3 locators, hoisted for the same reason. */
const REFINERY_DOOR = /Open the Refinery/;
const RAW_COSINE = /cosine/;
const NO_KEYWORD_PROFILE = /No keyword profile/;
// P3-1 re-worded this line: it opened on "Closest first" and then spent two clauses walking that claim
// back, over a percent column that visibly does not descend. Same two facts, ordered so the sentence
// survives its own evidence — the CLAIM under test is unchanged (the list states its own sort).
const SORT_STATED = /Ranked by distinctive similarity/;

test("a GROUNDED answer badges the model's own claim", async ({ mount, page }) => {
  await routeDossier(page, {
    characterId: "char_aria",
    question: QUESTION,
    answer: "Their oath to the queen.",
    grounded: true,
    degraded: false,
    sampledMessages: 4,
  });
  const component = await mount(<CorpusDossierSurfaceStory />);

  await component.getByTestId("corpus-ask-input").fill(QUESTION);
  await component.getByTestId("corpus-ask-submit").click();

  const badge = component.getByTestId("corpus-ask-state");
  await expect(badge).toHaveAttribute("data-answer-state", "grounded");
  await expect(badge).toContainText("Grounded");
  await expect(component.getByText("4 scenes sampled")).toBeVisible();
  await expect(component.getByText("Their oath to the queen.")).toBeVisible();
});

test("a SPECULATIVE answer badges the model's own hedge (the scenes didn't support it)", async ({ mount, page }) => {
  await routeDossier(page, {
    characterId: "char_aria",
    question: QUESTION,
    answer: "Probably revenge.",
    grounded: false,
    degraded: false,
    sampledMessages: 2,
  });
  const component = await mount(<CorpusDossierSurfaceStory />);

  await component.getByTestId("corpus-ask-input").fill(QUESTION);
  await component.getByTestId("corpus-ask-submit").click();

  const badge = component.getByTestId("corpus-ask-state");
  await expect(badge).toHaveAttribute("data-answer-state", "speculative");
  await expect(badge).toContainText("Speculative");
  // The model DID answer in shape, so the scene count still stands as the gloss.
  await expect(component.getByText("2 scenes sampled")).toBeVisible();
});

test("a DEGRADED answer says OUR parse failed — never the model's 'Speculative'", async ({ mount, page }) => {
  // `grounded: false` here is the safe floor, NOT a model claim (the reply never validated). A badge reading
  // "Speculative" would attribute our failure to the model and imply the text below was checked against the
  // scenes; it was not.
  await routeDossier(page, {
    characterId: "char_aria",
    question: QUESTION,
    answer: "Well, let me think about that one...",
    grounded: false,
    degraded: true,
    sampledMessages: 3,
  });
  const component = await mount(<CorpusDossierSurfaceStory />);

  await component.getByTestId("corpus-ask-input").fill(QUESTION);
  await component.getByTestId("corpus-ask-submit").click();

  const badge = component.getByTestId("corpus-ask-state");
  await expect(badge).toHaveAttribute("data-answer-state", "degraded");
  await expect(badge).toContainText("Unstructured reply");
  await expect(badge).not.toContainText("Speculative");
  // The gloss names the cause instead of the scene count — the count is meaningless on an unparsed reply.
  await expect(component.getByText("The model didn't answer in the expected shape — this is its raw text.")).toBeVisible();
  await expect(component.getByText("3 scenes sampled")).toHaveCount(0);
  // The raw text is still shown (it may be useful) — it is LABELLED, not hidden.
  await expect(component.getByText("Well, let me think about that one...")).toBeVisible();
});

// ── The CARD QUALITY readout (R4 / I2 — the refinery score, made visible where the library's understanding
//    of a character lives). Two states, both DESIGNED: a number, or the empty state that names its door. ──

/** An answer stub the quality cases never submit — the ASK panel stays idle so only the readout varies. */
const IDLE_ANSWER = { characterId: "char_aria", question: "", answer: "", grounded: true, degraded: false, sampledMessages: 0 };

test("a SCORED card shows its refinery score against the rubric ceiling", async ({ mount, page }) => {
  await routeDossier(page, IDLE_ANSWER, { ...DOSSIER, refineryScore: 6.75 });
  const component = await mount(<CorpusDossierSurfaceStory />);

  await expect(component.getByRole("heading", { name: "Card quality" })).toBeVisible();
  // WORD-PRIMARY: the printed numeral IS the signal (one decimal — the rubric is a weighted average), and
  // the scale it is measured against rides with it rather than being folklore.
  const readout = component.getByText(SCORE_READOUT);
  await expect(readout).toBeVisible();
  await expect(readout).toContainText("6.8");
  await expect(readout).toContainText("/ 10");
});

test("an UNSCORED card renders the designed empty state, naming the sweep as its door", async ({ mount, page }) => {
  await routeDossier(page, IDLE_ANSWER, { ...DOSSIER, refineryScore: null });
  const component = await mount(<CorpusDossierSurfaceStory />);

  await expect(component.getByRole("heading", { name: "Card quality" })).toBeVisible();
  // "Not scored" is a real state with a real exit — it must never collapse to a blank where other cards
  // show a number (empty-states-are-load-bearing).
  const empty = component.getByText(NOT_SCORED);
  await expect(empty).toBeVisible();
  await expect(empty).toContainText("library score sweep");
  await expect(component.getByText(SCORE_READOUT)).toHaveCount(0);
  // …AND THE SENTENCE CARRIES ITS DOOR (side-eye corpus re-pass B8). It named two verbs beside zero
  // controls — a section that exists only to say what you cannot do from here.
  await expect(component.getByRole("button", { name: REFINERY_DOOR })).toBeVisible();
  // …AND IT IS CAPPED AT THE READING MEASURE (side-eye corpus re-pass #3, P3-E). It was the one paragraph
  // on this surface at `max-width: none` (78.6ch on a wide pane) while its siblings carried the token. The
  // assertion is the RESOLVED value rather than the class: a Tailwind arbitrary-property class that never
  // got generated computes to `none` and looks identical in the source.
  const measure = await empty.evaluate((el) => globalThis.getComputedStyle(el).maxWidth);
  expect(measure, "the reading-measure token resolved to a real cap").not.toBe("none");
});

// ── THE DOSSIER'S EMPTY-SECTION SPRAWL AND ITS TWO NUMBER VOCABULARIES (side-eye corpus re-pass B8/U3) ──

test("a dossier with NO keyword profile renders no Keywords section at all", async ({ mount, page }) => {
  await routeDossier(page, IDLE_ANSWER);
  const component = await mount(<CorpusDossierSurfaceStory />);

  // SETTLED barrier: a section that IS always present on a resolved dossier.
  await expect(component.getByRole("heading", { name: "Card quality" })).toBeVisible();
  // The readiness rail is the ONE place this section of the app says what has not run; a heading plus
  // "No keyword profile computed yet." one drill deeper is the same true nothing printed twice.
  await expect(component.getByRole("heading", { name: "Keywords" })).toHaveCount(0);
  await expect(component.getByText(NO_KEYWORD_PROFILE)).toHaveCount(0);
});

test("the portrait readout speaks the surface's ONE similarity vocabulary — a percent, not a raw cosine", async ({ mount, page }) => {
  await routeDossier(page, IDLE_ANSWER, { ...DOSSIER, portrait: { avatarHash: "aaaa1111", alignment: 0.25 } });
  const component = await mount(<CorpusDossierSurfaceStory />);

  await expect(component.getByRole("heading", { name: "Portrait alignment" })).toBeVisible();
  await expect(component.getByText("Card ↔ art match: 25%")).toBeVisible();
  // The shipped spelling: an engineer's unit with no scale, beside neighbours quoted in whole percents.
  await expect(component.getByText(RAW_COSINE)).toHaveCount(0);
});

test("the neighbour list STATES ITS SORT — the printed percent is not the rank (U3)", async ({ mount, page }) => {
  // The live shape: the best match by the printed number sits at position 9, because the ORDER is search's
  // hub-adjusted CSLS rank and the readout is the raw cosine. Two true numbers, one column.
  await routeDossier(page, IDLE_ANSWER, {
    ...DOSSIER,
    similar: [
      { characterId: "character_olivette", name: "Olivette", score: 0, relevance: 0.66, avatarHash: null, genre: null, tone: null, elevatorPitch: null },
      { characterId: "character_gunnhildr", name: "Gunnhildr", score: 0.02, relevance: 0.74, avatarHash: null, genre: null, tone: null, elevatorPitch: null },
    ],
  });
  const component = await mount(<CorpusDossierSurfaceStory />);

  await expect(component.getByRole("heading", { name: "Similar characters" })).toBeVisible();
  // Both numbers still render, in the server's rank order — the fix is not a re-sort.
  await expect(component.getByText("66%")).toBeVisible();
  await expect(component.getByText("74%")).toBeVisible();
  // …and the list says what its order MEANS, so a bigger number below a smaller one reads as a rule
  // rather than a bug. Before this, nothing on the surface distinguished the two.
  await expect(component.getByText(SORT_STATED)).toBeVisible();
});

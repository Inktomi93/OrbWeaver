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
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { CorpusDossierSurfaceStory } from "../_ct-stories.tsx";

const DOSSIER = {
  characterId: "char_aria",
  name: "Aria",
  genre: "fantasy",
  tone: "dark",
  elevatorPitch: "A cursed knight walking north.",
  tags: ["rogue"],
  portrait: null,
  similar: [],
};

/** The dossier's other reads, stubbed flat so only the ASK answer varies between cases. */
async function routeDossier(page: Page, answer: Record<string, unknown>): Promise<void> {
  await routeTrpc(page, {
    "discovery.characterDossier": DOSSIER,
    "discovery.characterKeywords": [],
    "search.similarArt": [],
    "discovery.askCard": answer,
  });
}

const QUESTION = "What drives them?";

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

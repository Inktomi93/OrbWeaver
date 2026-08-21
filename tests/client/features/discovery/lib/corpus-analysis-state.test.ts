// The corpus surface's state-swap, at the boundaries (program #102 corpus leg, issue #127).
//
// This is the one thing the whole composition branches on — which island holds the surface's single focal
// — so it is derived in a pure function and walked here rather than only being observed through a mount.
// A CT can prove "the invitation rendered"; only this tier can prove the PREDICATE, and specifically that
// the visual pass alone does NOT flip it (the exact confusion the ruling exists to settle: eight computed
// families with zero understanding of what any of them are about is still an un-analysed library).

import { describe } from "vitest";
import type { CorpusAnalysisInput } from "../../../../../packages/client/src/features/discovery/lib/corpus-analysis-state.ts";
import { deriveCorpusAnalysisState } from "../../../../../packages/client/src/features/discovery/lib/corpus-analysis-state.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** The audited instance, measured 2026-08-16: ten characters, eight visual families, nothing distilled. */
const AUDITED: CorpusAnalysisInput = {
  characters: 10,
  familySizes: [2, 2, 1, 1, 1, 1, 1, 1],
  distilled: 0,
  sceneThemes: 0,
  arcThemes: 0,
  keywords: 0,
  keywordsEverRan: false,
  duplicateCharacters: 0,
  duplicateChats: 0,
  identicalCharacterPairs: 0,
  // The audited instance HAD run the dedup pass — which is what makes its zero a result. Issue #164 item 4
  // is the other case, pinned below: the same zero from a pass that never ran is a different sentence.
  duplicatesEverRan: true,
};

function stageDatum(input: CorpusAnalysisInput, id: string): string {
  const stage = deriveCorpusAnalysisState(input).stages.find((row) => row.id === id);
  if (stage === undefined) {
    throw new Error(`no readiness stage ${id}`);
  }
  return stage.datum;
}

describe("phase — which island takes the focal", () => {
  test("an empty library is neither un-analysed nor analysed: there is nothing to read", () => {
    const state = deriveCorpusAnalysisState({ ...AUDITED, characters: 0, familySizes: [] });
    expect(state.phase).toBe("empty");
    expect(state.headline).toBe("Nothing in your library yet.");
  });

  test("THE RULING: the visual pass alone does NOT reclaim the focal — eight families, still un-analysed", () => {
    const state = deriveCorpusAnalysisState(AUDITED);
    expect(state.phase).toBe("unanalysed");
    expect(state.headline).toBe("Ten characters, grouped into eight visual families.");
  });

  test("distillation alone flips it — the map takes the focal before any story theme exists", () => {
    expect(deriveCorpusAnalysisState({ ...AUDITED, distilled: 1 }).phase).toBe("analysed");
  });

  test("story themes alone flip it too — either half of the semantic pass is enough", () => {
    expect(deriveCorpusAnalysisState({ ...AUDITED, arcThemes: 3 }).phase).toBe("analysed");
  });

  test("a library with characters but no families at all still reads as un-analysed, and says so", () => {
    const state = deriveCorpusAnalysisState({ ...AUDITED, familySizes: [] });
    expect(state.phase).toBe("unanalysed");
    expect(state.headline).toBe("Ten characters. Nothing read yet.");
  });
});

describe("the THIN in-between — analysed, but barely", () => {
  test("distilled with no story themes: the map takes the focal AND the rail still says the themes pass has not run", () => {
    const thin: CorpusAnalysisInput = { ...AUDITED, distilled: 3 };
    const state = deriveCorpusAnalysisState(thin);
    expect(state.phase).toBe("analysed");
    expect(state.headline).toBe("Ten characters, three cards distilled.");
    expect(stageDatum(thin, "storyThemes")).toBe("not run");
    // …and the completeness is stated, not rounded to a tick: three of ten is not "done".
    expect(stageDatum(thin, "distilled")).toBe("3 of 10");
  });
});

// ── THE MASTHEAD STATES EACH NUMBER ONCE (side-eye corpus re-pass 2026-08-19 §5 `distill`) ─────────────
// THE FORK, ON THE RECORD. This block used to pin "un-analysed ⇒ the hero IS the family count" and
// "analysed ⇒ the hero IS the story-theme count", from the ruling that the hero MOVES WITH THE PHASE. The
// re-pass measured what that produces on a real library: the h1 read "327 characters, distilled into 24
// story themes" and the figure row beside it printed 327 and 24 AGAIN — one of six more-than-one-home
// findings, and the only one where a surface argues with itself six inches apart.
// The old MECHANISM is kept (at most one hero, chosen by phase, never a zero while un-analysed); what is
// new is that the sentence is spent FIRST — a figure whose number the headline already gives is dropped,
// and the hero is the first survivor. When the sentence covers everything the library knows, there is no
// figure row at all, which is what "state it once" means when the sentence wins.
describe("the hero figure — at most ONE per surface, and never a number the sentence just said", () => {
  test("un-analysed: the sentence already names the characters AND the families, so no figure repeats them", () => {
    const state = deriveCorpusAnalysisState(AUDITED);
    expect(state.headline).toBe("Ten characters, grouped into eight visual families.");
    expect(state.hero).toBeNull();
    expect(state.support).toStrictEqual([]);
  });

  test("un-analysed with no families, the sentence is the whole masthead too", () => {
    const state = deriveCorpusAnalysisState({ ...AUDITED, familySizes: [] });
    expect(state.headline).toBe("Ten characters. Nothing read yet.");
    expect(state.hero).toBeNull();
    expect(state.support).toStrictEqual([]);
  });

  test("analysed: the sentence takes characters + story themes, so the hero is what it did NOT say", () => {
    const state = deriveCorpusAnalysisState({ ...AUDITED, sceneThemes: 4, arcThemes: 2 });
    expect(state.headline).toBe("Ten characters, distilled into six story themes.");
    expect(state.hero).toStrictEqual({ id: "families", value: "8", caption: "visual families" });
    expect(state.support).toStrictEqual([]);
  });

  test("analysed with no story themes, the sentence spends the distilled count and the families lead again", () => {
    const state = deriveCorpusAnalysisState({ ...AUDITED, distilled: 3 });
    expect(state.headline).toBe("Ten characters, three cards distilled.");
    expect(state.hero?.id).toBe("families");
  });

  test("no figure — hero or support — ever repeats a number the headline states", () => {
    for (const input of [AUDITED, { ...AUDITED, distilled: 3 }, { ...AUDITED, sceneThemes: 4 }, { ...AUDITED, familySizes: [] }]) {
      const state = deriveCorpusAnalysisState(input);
      const figures = [...(state.hero === null ? [] : [state.hero]), ...state.support];
      // The value as it appears in the sentence: the headline spells small counts as words, so the check is
      // on the CAPTION's subject rather than the digits — a figure captioned "characters" beside a headline
      // that opens "Ten characters" is the duplication, whichever way each renders the ten.
      for (const figure of figures) {
        expect(state.headline.toLowerCase(), `the masthead states "${figure.caption}" twice`).not.toContain(figure.caption.toLowerCase());
      }
      // …and the support still never repeats the hero.
      expect(state.support.map((figure) => figure.id)).not.toContain(state.hero?.id);
    }
  });

  test("ONCE ANALYSED a zero prints, because then it IS a measurement (#99 item 7's own rule)", () => {
    // The un-run story-theme zero is absent while un-analysed and PRESENT once the semantic pass has run —
    // unchanged by the distill above, which only subtracts what the sentence already said (characters).
    const thin = deriveCorpusAnalysisState({ ...AUDITED, distilled: 3 });
    expect(thin.support.map((figure) => `${figure.value} ${figure.caption}`)).toStrictEqual(["0 story themes"]);
    expect(deriveCorpusAnalysisState(AUDITED).support).toStrictEqual([]);
  });
});

describe("the readiness rail — a measurement or an honest 'not run', never a bare zero", () => {
  test("families reads as TWO UNITS, not the mockup's false 'N of M clustered'", () => {
    // The mockup's "8 of 10 clustered" parses as "8 of 10 characters are clustered", which is false: all
    // ten are, into eight families. §L.8 deviation, pinned here so it cannot drift back.
    expect(stageDatum(AUDITED, "families")).toBe("8 families · 10 characters");
  });

  test("a pass that has produced nothing says 'not run', and its dot is not lit", () => {
    const stages = deriveCorpusAnalysisState({ ...AUDITED, familySizes: [] }).stages;
    expect(stages.find((row) => row.id === "families")).toStrictEqual({
      id: "families",
      label: "Visual families",
      datum: "not run",
      done: false,
    });
  });

  test("near-duplicates at zero is a RESULT, not an absence — it reads 'none found'", () => {
    expect(stageDatum(AUDITED, "duplicates")).toBe("none found");
    expect(stageDatum({ ...AUDITED, duplicateCharacters: 2, duplicateChats: 1 }, "duplicates")).toBe("3 found");
  });

  test("…but only once the pass has RUN: an un-run dedup reads 'not run', never the reassuring zero (#164)", () => {
    // The owner read "none found" on a 327-card imported library and took it for a defect. It was not — the
    // `find-duplicates` pass had simply never run (it later found 30 pairs). Two zeros, two different
    // actions, and this rail's whole contract is that a zero is a state a reader can act on.
    expect(stageDatum({ ...AUDITED, duplicatesEverRan: false }, "duplicates")).toBe("not run");
    // A pass that never ran cannot have found anything, so the un-run arm outranks a stale count too.
    expect(stageDatum({ ...AUDITED, duplicatesEverRan: false, duplicateChats: 4 }, "duplicates")).toBe("not run");
  });

  test("the pass's BLIND SPOT is stated beside its result, never folded into it (forensics §5.2)", () => {
    // The rail read "1 found" while two cosine-1.00 same-name pairs sat one tab away: byte-identical cards
    // collapse to one representative before the all-pairs scan, so they can never BE a pair. Both numbers
    // are true about different questions, so the row carries both.
    expect(stageDatum({ ...AUDITED, duplicateCharacters: 1, identicalCharacterPairs: 2 }, "duplicates")).toBe("1 found · 2 identical");
    // Identical copies are read off the cards themselves, so they are known even when the pass never ran.
    expect(stageDatum({ ...AUDITED, duplicatesEverRan: false, identicalCharacterPairs: 2 }, "duplicates")).toBe("not run · 2 identical");
    expect(stageDatum({ ...AUDITED, identicalCharacterPairs: 0 }, "duplicates")).toBe("none found");
  });

  test("keywords are their OWN row, and never marked done on the theme pass's evidence (forensics §9.1)", () => {
    // The row said "Story themes & keywords" and read story themes alone — so a library with 16 themes and
    // an empty keyword table showed one green row for two passes, one of which has never run.
    const themed: CorpusAnalysisInput = { ...AUDITED, sceneThemes: 16 };
    expect(deriveCorpusAnalysisState(themed).stages.find((s) => s.id === "storyThemes")?.label).toBe("Story themes");
    expect(deriveCorpusAnalysisState(themed).stages.find((s) => s.id === "keywords")?.done).toBe(false);
    expect(stageDatum(themed, "keywords")).toBe("not run");
    expect(stageDatum({ ...themed, keywordsEverRan: true }, "keywords")).toBe("none found");
    expect(stageDatum({ ...themed, keywordsEverRan: true, keywords: 40 }, "keywords")).toBe("40 keywords");
  });

  test("an UN-ANSWERED keyword read is a third state, never the measurement branch (#384)", () => {
    // The rail row renders while `topKeywords` is still in flight (the #269 deferral took that read off the
    // suspense boundary), and `data?.length ?? 0` handed it a measured zero. On a warm queue — the pass HAS
    // succeeded, which is the only state in which "none found" is even reachable — the surface printed a
    // result for a table it had not read, for one round trip. That is the #164 incident, recreated.
    const warm: CorpusAnalysisInput = { ...AUDITED, sceneThemes: 16, keywordsEverRan: true };
    expect(stageDatum({ ...warm, keywords: "pending" }, "keywords")).toBe("checking…");
    expect(stageDatum({ ...warm, keywords: 0 }, "keywords")).toBe("none found");
    // …and a pass the queue says never succeeded still outranks the read's own state: that is a fact about
    // the PASS, true whatever the keyword table holds or whether anyone has looked at it.
    expect(stageDatum({ ...warm, keywordsEverRan: false, keywords: "pending" }, "keywords")).toBe("not run");
  });

  test("a keyword read that FAILED says so, rather than borrowing either zero (#384)", () => {
    // The surface renders its own error + Retry for this read, so the row's job is to state that it has no
    // reading — not to report the failure twice, and above all not to call it "none found".
    const warm: CorpusAnalysisInput = { ...AUDITED, keywordsEverRan: true, keywords: "unavailable" };
    expect(stageDatum(warm, "keywords")).toBe("unavailable");
    expect(deriveCorpusAnalysisState(warm).stages.find((row) => row.id === "keywords")?.done).toBe(false);
  });

  test("the un-measured arms never light the dot — the dot means 'this pass produced something'", () => {
    for (const keywords of ["pending", "unavailable"] as const) {
      const state = deriveCorpusAnalysisState({ ...AUDITED, keywordsEverRan: true, keywords });
      expect(state.stages.find((row) => row.id === "keywords")?.done).toBe(false);
    }
  });

  test("every stage carries a datum and none of them is a bare zero", () => {
    for (const stage of deriveCorpusAnalysisState(AUDITED).stages) {
      expect(stage.datum).not.toBe("0");
      expect(stage.datum.length).toBeGreaterThan(0);
    }
  });

  test("a partial pass is DONE-with-a-count, so the dot means 'produced something', not 'finished'", () => {
    const partial = deriveCorpusAnalysisState({ ...AUDITED, distilled: 3 }).stages.find((row) => row.id === "distilled");
    expect(partial?.done).toBe(true);
    expect(partial?.datum).toBe("3 of 10");
  });
});

describe("copy law", () => {
  test("every emitted string that names the distillation output says STORY theme, never a bare 'theme'", () => {
    const state = deriveCorpusAnalysisState({ ...AUDITED, sceneThemes: 4 });
    const strings = [
      state.headline,
      ...(state.hero === null ? [] : [state.hero.caption]),
      ...state.support.map((f) => f.caption),
      ...state.stages.map((s) => s.label),
    ];
    const unqualified = strings.filter((text) => text.toLowerCase().includes("theme") && !text.toLowerCase().includes("story theme"));
    expect(unqualified, "every 'theme' on this surface must be qualified as a STORY theme").toStrictEqual([]);
  });

  test("counts past ten stop being spelled out — a masthead cannot say 'three thousand'", () => {
    const big = deriveCorpusAnalysisState({ ...AUDITED, characters: 3000, familySizes: [3000] });
    expect(big.headline).toBe("3,000 characters, grouped into one visual family.");
  });

  test("one of anything is singular in both the prose and the datum forms", () => {
    const single: CorpusAnalysisInput = { ...AUDITED, characters: 1, familySizes: [1] };
    expect(deriveCorpusAnalysisState(single).headline).toBe("One character, grouped into one visual family.");
    expect(stageDatum(single, "families")).toBe("1 families · 1 character");
  });
});

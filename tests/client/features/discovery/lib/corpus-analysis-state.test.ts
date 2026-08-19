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

describe("the hero figure — ONE per surface, and it moves with the phase", () => {
  test("un-analysed, the hero is the only real computed number: the family count", () => {
    const state = deriveCorpusAnalysisState(AUDITED);
    expect(state.hero).toStrictEqual({ id: "families", value: "8", caption: "visual families" });
  });

  test("un-analysed with no families, it falls back to the library itself rather than showing a zero", () => {
    expect(deriveCorpusAnalysisState({ ...AUDITED, familySizes: [] }).hero.id).toBe("characters");
  });

  test("analysed, the hero is the understanding — story themes when they exist", () => {
    expect(deriveCorpusAnalysisState({ ...AUDITED, sceneThemes: 4, arcThemes: 2 }).hero).toStrictEqual({
      id: "storyThemes",
      value: "6",
      caption: "story themes",
    });
  });

  test("analysed with no story themes, it is the distilled count", () => {
    expect(deriveCorpusAnalysisState({ ...AUDITED, distilled: 3 }).hero.id).toBe("distilled");
  });

  test("the support figures NEVER repeat the hero — the same datum twice on one row is the duplication habit", () => {
    for (const input of [AUDITED, { ...AUDITED, distilled: 3 }, { ...AUDITED, sceneThemes: 4 }, { ...AUDITED, familySizes: [] }]) {
      const state = deriveCorpusAnalysisState(input);
      expect(state.support.map((figure) => figure.id)).not.toContain(state.hero.id);
    }
  });

  test("UN-ANALYSED, no support figure is a zero — an un-run pass has measured nothing, not zero", () => {
    // The audited defect in miniature. A library with nothing clustered and nothing distilled prints ONE
    // number (its own size, at hero weight) and no companions at all.
    expect(deriveCorpusAnalysisState({ ...AUDITED, familySizes: [] }).support).toStrictEqual([]);
    // …and with families computed, only the real counts ride along: the un-run story-theme zero is absent.
    expect(deriveCorpusAnalysisState(AUDITED).support.map((figure) => figure.id)).toStrictEqual(["characters"]);
  });

  test("ONCE ANALYSED a zero prints, because then it IS a measurement (#99 item 7's own rule)", () => {
    const thin = deriveCorpusAnalysisState({ ...AUDITED, distilled: 3 });
    expect(thin.support.map((figure) => `${figure.value} ${figure.caption}`)).toStrictEqual(["10 characters", "8 visual families", "0 story themes"]);
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
    const strings = [state.headline, state.hero.caption, ...state.support.map((f) => f.caption), ...state.stages.map((s) => s.label)];
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

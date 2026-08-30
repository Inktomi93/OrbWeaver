// THE CORPUS SURFACE'S ANALYSIS STATE — one pure derivation, from the reads the home surface already
// suspends on, of the single fact the whole composition turns on: WHICH island is the surface's focal.
//
// WHY A STATE AND NOT A FORK (program #102 corpus leg, owner ruling on issue #127). The owner picked
// mockup A "The Cartographer" — the visual family map as the glowing focal — WITH a ruled swap: while the
// library is un-analysed the map is thin (on the audited instance six of eight families are singletons and
// every label is the unlabelled `"mixed"`), so it cannot carry a focal, and variant B's INVITATION takes it
// instead. The moment real analysis output exists the map reclaims it. That is ONE surface whose focal is
// data-driven, never two designs behind a flag — and CD3 (UI-Density-Law.md §3.2: exactly one element
// per surface may carry accent fill, glow, or elevated shadow at rest) is what makes the swap mandatory
// rather than decorative: rendering both islands at focal weight would mean the surface has no focal.
//
// THE PHASE PREDICATE IS THE SEMANTIC PASS, NOT THE VISUAL ONE, and the distinction is the whole ruling.
// Visual families come from the avatar-embedding clustering, which runs off the indexer; genre/tone/pitch
// and story themes come from `distill-characters` + `compute-themes`. A corpus can therefore have eight
// families and zero understanding of what any of them are ABOUT, which is exactly the audited state. So
// `analysed` reads distilled ∪ story-themes — carried over verbatim from the predicate this surface has
// used since the 2026-08-08 collapse, so the swap inherits a behaviour that was already reviewed rather
// than inventing a second definition of "has this library been read".
//
// "THEMES" HERE IS ALWAYS THE SEMANTIC KIND. Every string this module emits says "story themes", never a
// bare "themes" — the discovery domain's distillation output shares a word with the app's colour themes and
// the owner has already been caught out by it once. The spelling is law on this surface, not preference.

/** The three shapes a library can be in, declared ONCE as the axis tuple (Spine-TypeScript §7.5) — the
 *  phase decides the focal island and nothing else branches on it. */
const CORPUS_ANALYSIS_PHASES = ["empty", "unanalysed", "analysed"] as const;
type CorpusAnalysisPhase = (typeof CORPUS_ANALYSIS_PHASES)[number];

/** One row of the readiness rail — a pass, what it has produced, and whether it has produced anything. */
export interface CorpusReadinessStage {
  readonly id: "families" | "distilled" | "storyThemes" | "keywords" | "duplicates";
  readonly label: string;
  /** The right-hand mono reading. Always a MEASUREMENT or the honest `not run`, never a bare `0`. */
  readonly datum: string;
  /** Has this pass produced ANY output? Completeness lives in `datum`; this is the dot. */
  readonly done: boolean;
}

/** A masthead figure — a number and the words under it. */
interface CorpusFigure {
  readonly id: string;
  readonly value: string;
  readonly caption: string;
}

export interface CorpusAnalysisState {
  readonly phase: CorpusAnalysisPhase;
  /** The masthead sentence — the surface's ONE opening statement (`voice="masthead"`). */
  readonly headline: string;
  /**
   * THE ONE figure the surface exists to produce (`voice="hero"`, which is at most ONE per surface by law).
   * It moves with the phase because the number that matters moves with it: un-analysed, the real count is
   * how much shape the visual pass found; analysed, it is how much the library has been understood.
   *
   * `null` WHEN THE SENTENCE ALREADY SAID EVERYTHING (side-eye corpus re-pass 2026-08-19 §5, the
   * more-than-one-home list). See {@link deriveCorpusAnalysisState} for the fork this resolves: the figures
   * state what the headline does NOT, so a library whose whole state fits in the opening sentence carries
   * the sentence alone rather than the sentence plus its own numbers repeated six inches to the right.
   */
  readonly hero: CorpusFigure | null;
  /** The quiet companions beside the hero (`voice="datum"`). Never the loudest thing on the page. */
  readonly support: readonly CorpusFigure[];
  readonly stages: readonly CorpusReadinessStage[];
}

/**
 * A pass's count AS THE SURFACE KNOWS IT — a number, or why there is no number yet.
 *
 * The rail's contract is that a zero is a state a reader can ACT on (issue #164), and that only holds while
 * every zero it prints is a zero somebody measured. A read that has not answered has measured nothing, so it
 * cannot be spelled `0`; a read that FAILED has measured nothing either, and it says a different thing
 * because the surface is already offering that one a retry. Reads that suspend the whole surface never reach
 * here — this exists for the below-fold reads the #269 deferral made non-suspending, which now render the
 * rail while they are still in flight.
 *
 * MODULE-PRIVATE, and it has to be: an EXPORTED type alias outside a type home is `no-inline-types` RED
 * (the exported interfaces beside it survive because that gate chases exported INTERFACES only inside a
 * server domain). Nothing needs to name it — callers spell the literals and the field type checks them.
 */
type CorpusPassCount = number | "pending" | "unavailable";

/** Exactly the fields the four suspended discovery reads contribute — no query shapes leak in here. */
export interface CorpusAnalysisInput {
  readonly characters: number;
  /** One entry per visual family, its member count. Length is the family count. */
  readonly familySizes: readonly number[];
  readonly distilled: number;
  readonly sceneThemes: number;
  readonly arcThemes: number;
  /** Has `compute-themes` ever succeeded? THE ROW THAT DIDN'T HAVE THIS (side-eye populated arm, P1-3).
   *  Every other pass on this rail already distinguishes "it has not run" from "it ran and found nothing"
   *  — that three-state doctrine is stated three functions down and was honoured by four rows out of five.
   *  The story-themes row branched on the COUNT alone, so on the audited library `compute-themes` succeeded
   *  at `createdAt 1787431820258`, clustered zero themes, and the rail reported it as never-run — next to a
   *  button inviting the user to run it. A zero from a pass that ran is a measurement; the rail's whole
   *  contract is that the two get different words. */
  readonly storyThemesEverRan: boolean;
  /** Keyword profiles are their OWN pass (`compute-cooccurrence`), which is NOT in the understanding-pass
   *  chain — so it needs its own datum and its own ran/not-run, exactly like the near-dup row. It is also
   *  the one count on this rail that arrives from a NON-suspending read, which is why it is a
   *  {@link CorpusPassCount} rather than a plain number. */
  readonly keywords: CorpusPassCount;
  readonly keywordsEverRan: boolean;
  readonly duplicateCharacters: number;
  readonly duplicateChats: number;
  /** Pairs the near-dup pass CANNOT see: byte-identical cards collapse to one representative before its
   *  all-pairs scan, so exact duplicates — the ones a reader most wants found — are structurally excluded. */
  readonly identicalCharacterPairs: number;
  /** Has the near-duplicate pass ever succeeded? Zero pairs means two entirely different things depending on
   *  this, and the rail used to print the reassuring one for both (issue #164 item 4). */
  readonly duplicatesEverRan: boolean;
}

// The locale is FIXED for the same reason the preset surface fixes its own (`preset/lib/format-count.ts`):
// these figures are read down a column in tabular mono, and a locale that groups with `.` or a thin space
// breaks the alignment the tabular figures exist to give. Module scope — a per-call formatter is the cost
// the perf gate patrols. Deliberately NOT imported from preset: features never import each other, and a
// third copy of a two-line formatter is cheaper than a shared home nothing else asked for.
const COUNT_FORMAT = new Intl.NumberFormat("en-US");

/** A count, digit-grouped (`10,217`). */
export function formatCount(value: number): string {
  return COUNT_FORMAT.format(value);
}

// Counts up to ten SPELLED OUT — the masthead register home already ratified (`home-masthead-body.tsx`:
// "a masthead sentence reads as prose, and '6 rooms' in a warm line is a receipt, not a sentence"). Past
// ten the word stops helping and the numeral takes over, which is also what keeps the line honest for a
// three-thousand-character library the mockup's hand-written "Ten" could never have described.
const SPELLED = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"] as const;

/** `Three characters` / `One character` — the masthead's prose form. Lead-capitalised. */
function spelled(count: number, one: string, many = `${one}s`): string {
  return `${SPELLED[count] ?? formatCount(count)} ${count === 1 ? one : many}`;
}

/** The same phrase mid-sentence, where a capital would read as a proper noun. */
function spelledInline(count: number, one: string, many = `${one}s`): string {
  return spelled(count, one, many).toLowerCase();
}

/** `3 characters` / `1 character` — the DATUM form (rail rows, figures), always numeric. */
function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/**
 * The near-dup rail reading. Three states for the PASS (not run · none found · N found), plus the pass's
 * structural BLIND SPOT stated beside its result rather than folded into it (corpus forensics §5.2).
 *
 * The rail read "Near-duplicates — 1 found" while the Similarity tab one click away opened with two
 * cosine-1.00 same-name pairs: the finder scans content-hash-collapsed representatives, so byte-identical
 * cards can never form a pair. Both numbers are true and they answer different questions, so the row says
 * both — and the identical count stands ALONE when the pass has never run, because "2 identical copies" is
 * something we know from the cards themselves and does not depend on a pass at all.
 */
function duplicatesDatum(everRan: boolean, found: number, identical: number): string {
  const passPart = passDatum(everRan, found, `${formatCount(found)} found`);
  return identical === 0 ? passPart : `${passPart} · ${formatCount(identical)} identical`;
}

/** The shared three-state reading of a pass: it has not run · it ran and found nothing · what it found. */
function passDatum(everRan: boolean, found: number, foundLabel: string): string {
  if (!everRan) {
    return "not run";
  }
  return found === 0 ? "none found" : foundLabel;
}

/**
 * The keyword row, which has TWO more states than its neighbours because its count arrives from a read that
 * does not suspend the surface (issue #384).
 *
 * THE DEFECT THIS EXISTS FOR, and it is the #164 incident recreated by a correct performance fix. The #269
 * deferral moved `topKeywords` off the suspense boundary — right, and it stays — so the rail now renders
 * while that read is in flight. The count then arrived as `data?.length ?? 0`, which is a MEASUREMENT branch,
 * and a library whose keyword pass had genuinely succeeded read "Keywords — none found" for one round trip
 * before flipping to the real number. That is the sentence the owner read as a defect on a 327-card library,
 * and it was fabricated from a table nobody had looked at yet.
 *
 * The un-run arm still outranks everything: a queue that says the pass never succeeded is a fact about the
 * pass, not about the read, and it is true whatever the keyword table happens to hold.
 */
function keywordsDatum(everRan: boolean, count: CorpusPassCount): string {
  if (!everRan) {
    return "not run";
  }
  if (count === "pending") {
    return "checking…";
  }
  if (count === "unavailable") {
    // The surface renders its own error + Retry for this read; the row states that it has no reading rather
    // than reporting the failure a second time (the rail says what has not run, never what broke).
    return "unavailable";
  }
  return passDatum(everRan, count, plural(count, "keyword"));
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** `empty` is a library with nothing in it; `analysed` is the SEMANTIC pass having produced anything. */
function phaseFor(characters: number, distilled: number, storyThemes: number): CorpusAnalysisPhase {
  if (characters === 0) {
    return "empty";
  }
  return distilled > 0 || storyThemes > 0 ? "analysed" : "unanalysed";
}

/** Which figure the phase WANTS at hero weight, before the headline's own claim is subtracted. */
function preferredHeroIdFor(phase: CorpusAnalysisPhase, families: number, storyThemes: number): string {
  if (phase === "analysed") {
    return storyThemes > 0 ? "storyThemes" : "distilled";
  }
  return families > 0 ? "families" : "characters";
}

/** The masthead sentence AND the figures it has already spent. `states` is not documentation: it is what
 *  the figure row subtracts itself by (see {@link deriveCorpusAnalysisState}), so an arm that puts a number
 *  in the sentence without declaring it here would put that number on the surface twice. The two travel
 *  together in one return value precisely so they cannot drift apart. */
function headlineFor(
  phase: CorpusAnalysisPhase,
  input: CorpusAnalysisInput,
  families: number,
  storyThemes: number,
): { readonly text: string; readonly states: readonly string[] } {
  if (phase === "empty") {
    return { text: "Nothing in your library yet.", states: [] };
  }
  if (phase === "unanalysed" && families === 0) {
    return { text: `${spelled(input.characters, "character")}. Nothing read yet.`, states: ["characters"] };
  }
  if (phase === "unanalysed") {
    return {
      text: `${spelled(input.characters, "character")}, grouped into ${spelledInline(families, "visual family", "visual families")}.`,
      states: ["characters", "families"],
    };
  }
  if (storyThemes === 0) {
    return {
      text: `${spelled(input.characters, "character")}, ${spelledInline(input.distilled, "card")} distilled.`,
      states: ["characters", "distilled"],
    };
  }
  return {
    text: `${spelled(input.characters, "character")}, distilled into ${spelledInline(storyThemes, "story theme")}.`,
    states: ["characters", "storyThemes"],
  };
}

/**
 * Derive the whole state-swap from the four reads.
 *
 * PURE and unit-tested (`tests/client/features/discovery/lib/corpus-analysis-state.test.ts`) precisely
 * because it is the thing the composition branches on: a CT can prove the right island rendered, but only
 * a unit test can walk every phase boundary — including the thin in-between (distilled, no story themes)
 * that the ruling calls out as the state that has to degrade gracefully rather than pick a side.
 */
export function deriveCorpusAnalysisState(input: CorpusAnalysisInput): CorpusAnalysisState {
  const families = input.familySizes.length;
  const clustered = sum(input.familySizes);
  const storyThemes = input.sceneThemes + input.arcThemes;
  const nearDuplicates = input.duplicateCharacters + input.duplicateChats;

  const phase = phaseFor(input.characters, input.distilled, storyThemes);

  const headline = headlineFor(phase, input, families, storyThemes);
  const stated = new Set(headline.states);

  // THE FIGURES STATE WHAT THE SENTENCE DOES NOT — the fork, resolved (side-eye corpus re-pass 2026-08-19
  // §5, and it contradicts what this file used to say, so both readings are recorded).
  //   OLD MECHANISM (kept): `hero` is the voice for THE value, at most one per surface, and WHICH figure it
  //     is moves with the phase rather than being pinned to a column.
  //   NEW SYMPTOM: on the audited library the h1 read "327 characters, distilled into 24 story themes" and
  //     the figure row beside it printed 327 and 24 again. The masthead argued with itself; the only figure
  //     that added anything was the family count.
  //   RESOLUTION: a figure is DROPPED when the headline already gives its number, and the hero is then the
  //     first SURVIVOR in the phase's own priority order. Nothing survives ⇒ no figure row at all, and the
  //     sentence carries the masthead alone — which is the honest end of "state it once".
  //
  // The other two subtractions are unchanged:
  //   • whichever figure the hero already is never repeats as a companion (the same datum twice on one row);
  //   • while the library is un-analysed, anything at ZERO is absent — a pass that has never run has not
  //     measured zero, it has measured nothing, and the readiness rail says "not run" for exactly those.
  //     Once the semantic pass HAS run a zero prints, because then it IS a measurement (#99 item 7).
  const candidates: readonly { readonly figure: CorpusFigure; readonly count: number }[] = [
    { figure: { id: "characters", value: formatCount(input.characters), caption: "characters" }, count: input.characters },
    { figure: { id: "families", value: formatCount(families), caption: "visual families" }, count: families },
    { figure: { id: "storyThemes", value: formatCount(storyThemes), caption: "story themes" }, count: storyThemes },
  ];
  const survivors = candidates
    .filter((candidate) => !stated.has(candidate.figure.id) && (phase === "analysed" || candidate.count > 0))
    .map((candidate) => candidate.figure);
  // The phase's preferred hero, when the sentence has not already spent it: un-analysed, the only real
  // computed number is the shape the visual pass found (or, with no families, the library itself);
  // analysed, it is the understanding — story themes, or the distilled count when themes have not run.
  const preferredHeroId = preferredHeroIdFor(phase, families, storyThemes);
  const distilledFigure: CorpusFigure = { id: "distilled", value: formatCount(input.distilled), caption: "distilled" };
  const preferred = preferredHeroId === "distilled" && !stated.has("distilled") ? distilledFigure : survivors.find((f) => f.id === preferredHeroId);
  const hero = preferred ?? survivors[0] ?? null;
  const support = survivors.filter((figure) => figure.id !== hero?.id);

  const stages: readonly CorpusReadinessStage[] = [
    {
      id: "families",
      label: "Visual families",
      // NOT the mockup's "8 of 10 clustered" (§L.8 deviation, receipted): that parses as "8 of 10
      // characters are clustered", which is false — all ten are, into eight families. The two numbers are
      // different units and the copy has to say so.
      //
      // …AND THE CHARACTER COUNT NAMES ITS BASE (side-eye populated arm, #535's surviving half). This read
      // `8 families · 242 characters` on a 327-character library: 242 is a real measurement of a real
      // thing — how many characters the portrait clustering placed — and NOTHING on the surface said what
      // it was 242 OUT OF, so the 85 characters in no visual family were invisible in every one of the
      // four denominators this section prints (327 / 313 / 242 / 204). A clustered count and an owned
      // count are still different units from the family count, which is why the row keeps two clauses
      // rather than collapsing to one ratio — the second clause simply stops being a bare number.
      datum: families === 0 ? "not run" : `${formatCount(families)} families · ${formatCount(clustered)} of ${plural(input.characters, "character")}`,
      done: families > 0,
    },
    {
      id: "distilled",
      label: "Distilled — genre, tone, pitch",
      datum: `${formatCount(input.distilled)} of ${formatCount(input.characters)}`,
      done: input.distilled > 0,
    },
    {
      id: "storyThemes",
      // "& keywords" IS GONE from this label (corpus forensics §9.1). The row read `storyThemes` alone, so it
      // marked the keyword pass DONE on the theme pass's evidence — while `topKeywords` was empty, the
      // dossier printed "No keyword profile computed yet.", and the rail is the surface's ONE designated home
      // for what has not run. Two passes, two rows.
      label: "Story themes",
      // THE THREE-STATE DOCTRINE, FINALLY APPLIED TO THIS ROW (side-eye populated arm, P1-3). It read
      // `storyThemes === 0 ? "not run"`, which is the #164 incident this module was rebuilt to prevent,
      // surviving in the one row that never got an `everRan` input: on the audited library the pass HAD
      // succeeded and clustered nothing, and the rail called that never-run beside a button offering to
      // run it. `passDatum` is the shared reading its four siblings already go through.
      datum: passDatum(input.storyThemesEverRan, storyThemes, `${plural(storyThemes, "theme")} computed`),
      done: storyThemes > 0,
    },
    {
      id: "keywords",
      label: "Keywords",
      datum: keywordsDatum(input.keywordsEverRan, input.keywords),
      done: typeof input.keywords === "number" && input.keywords > 0,
    },
    {
      id: "duplicates",
      label: "Near-duplicates",
      // "none found" IS A RESULT — but only once the pass has produced one (issue #164 item 4). The old line
      // read `nearDuplicates === 0 ? "none found"`, which stated a measurement for a pass that had never run:
      // the owner read "none found" on a 327-card imported library and reasonably took it for a defect. It
      // was not; `find-duplicates` simply had not run yet (it later found 30 pairs). The rail's whole
      // contract is "a zero must be a state a reader can act on", and those two zeros need different actions.
      datum: duplicatesDatum(input.duplicatesEverRan, nearDuplicates, input.identicalCharacterPairs),
      done: nearDuplicates > 0 || input.identicalCharacterPairs > 0,
    },
  ];

  return { phase, headline: headline.text, hero, support, stages };
}

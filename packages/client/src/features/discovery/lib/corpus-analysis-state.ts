// THE CORPUS SURFACE'S ANALYSIS STATE — one pure derivation, from the reads the home surface already
// suspends on, of the single fact the whole composition turns on: WHICH island is the surface's focal.
//
// WHY A STATE AND NOT A FORK (program #102 corpus leg, owner ruling on issue #127). The owner picked
// mockup A "The Cartographer" — the visual family map as the glowing focal — WITH a ruled swap: while the
// library is un-analysed the map is thin (on the audited instance six of eight families are singletons and
// every label is the unlabelled `"mixed"`), so it cannot carry a focal, and variant B's INVITATION takes it
// instead. The moment real analysis output exists the map reclaims it. That is ONE surface whose focal is
// data-driven, never two designs behind a flag — and CD3 (density-pass-spec.md §3.2: exactly one element
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
  readonly id: "families" | "distilled" | "storyThemes" | "duplicates";
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
   * THE ONE figure the surface exists to produce (`voice="hero"`, which is ONE per surface by law).
   * It moves with the phase because the number that matters moves with it: un-analysed, the real count is
   * how much shape the visual pass found; analysed, it is how much the library has been understood.
   */
  readonly hero: CorpusFigure;
  /** The quiet companions beside the hero (`voice="datum"`). Never the loudest thing on the page. */
  readonly support: readonly CorpusFigure[];
  readonly stages: readonly CorpusReadinessStage[];
}

/** Exactly the fields the four suspended discovery reads contribute — no query shapes leak in here. */
export interface CorpusAnalysisInput {
  readonly characters: number;
  /** One entry per visual family, its member count. Length is the family count. */
  readonly familySizes: readonly number[];
  readonly distilled: number;
  readonly sceneThemes: number;
  readonly arcThemes: number;
  readonly duplicateCharacters: number;
  readonly duplicateChats: number;
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

/** The near-dup rail reading — three states, not two (see the stage's own comment). */
function duplicatesDatum(everRan: boolean, found: number): string {
  if (!everRan) {
    return "not run";
  }
  return found === 0 ? "none found" : `${formatCount(found)} found`;
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

function headlineFor(phase: CorpusAnalysisPhase, input: CorpusAnalysisInput, families: number, storyThemes: number): string {
  if (phase === "empty") {
    return "Nothing in your library yet.";
  }
  if (phase === "unanalysed" && families === 0) {
    return `${spelled(input.characters, "character")}. Nothing read yet.`;
  }
  if (phase === "unanalysed") {
    return `${spelled(input.characters, "character")}, grouped into ${spelledInline(families, "visual family", "visual families")}.`;
  }
  if (storyThemes === 0) {
    return `${spelled(input.characters, "character")}, ${spelledInline(input.distilled, "card")} distilled.`;
  }
  return `${spelled(input.characters, "character")}, distilled into ${spelledInline(storyThemes, "story theme")}.`;
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

  // THE HERO MOVES WITH THE PHASE. `hero` is the voice for THE value (density-pass-spec.md §2.3) and there
  // is one per surface, so it cannot be "whichever figure happens to be first": un-analysed, the only real
  // computed number is the shape the visual pass found (or, with no families, the library itself);
  // analysed, it is the understanding — story themes, or the distilled count when themes have not run.
  const heroUnanalysed: CorpusFigure =
    families > 0
      ? { id: "families", value: formatCount(families), caption: "visual families" }
      : { id: "characters", value: formatCount(input.characters), caption: "characters" };
  const heroAnalysed: CorpusFigure =
    storyThemes > 0
      ? { id: "storyThemes", value: formatCount(storyThemes), caption: "story themes" }
      : { id: "distilled", value: formatCount(input.distilled), caption: "distilled" };
  const hero = phase === "analysed" ? heroAnalysed : heroUnanalysed;

  // The companions are every other figure the masthead carries, MINUS two things:
  //   1. whichever one the hero already is — the same datum twice on one row is the IA duplication the
  //      density pass names as its fourth habit;
  //   2. while the library is un-analysed, anything at ZERO. That is the audited defect in miniature: a
  //      pass that has never run has not measured zero, it has measured nothing, and printing its zero in
  //      the masthead is the wall of confident nothing this whole rebuild deletes. The readiness rail says
  //      "not run" for exactly those, which is the true statement.
  //   Once the semantic pass HAS run, a zero prints — then it IS a measurement, which is the same rule the
  //   surface has carried since #99 item 7.
  const candidates: readonly { readonly figure: CorpusFigure; readonly count: number }[] = [
    { figure: { id: "characters", value: formatCount(input.characters), caption: "characters" }, count: input.characters },
    { figure: { id: "families", value: formatCount(families), caption: "visual families" }, count: families },
    { figure: { id: "storyThemes", value: formatCount(storyThemes), caption: "story themes" }, count: storyThemes },
  ];
  const support = candidates
    .filter((candidate) => candidate.figure.id !== hero.id && (phase === "analysed" || candidate.count > 0))
    .map((candidate) => candidate.figure);

  const stages: readonly CorpusReadinessStage[] = [
    {
      id: "families",
      label: "Visual families",
      // NOT the mockup's "8 of 10 clustered" (§L.8 deviation, receipted): that parses as "8 of 10
      // characters are clustered", which is false — all ten are, into eight families. The two numbers are
      // different units and the copy has to say so.
      datum: families === 0 ? "not run" : `${formatCount(families)} families · ${plural(clustered, "character")}`,
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
      label: "Story themes & keywords",
      datum: storyThemes === 0 ? "not run" : `${plural(storyThemes, "theme")} computed`,
      done: storyThemes > 0,
    },
    {
      id: "duplicates",
      label: "Near-duplicates",
      // "none found" IS A RESULT — but only once the pass has produced one (issue #164 item 4). The old line
      // read `nearDuplicates === 0 ? "none found"`, which stated a measurement for a pass that had never run:
      // the owner read "none found" on a 327-card imported library and reasonably took it for a defect. It
      // was not; `find-duplicates` simply had not run yet (it later found 30 pairs). The rail's whole
      // contract is "a zero must be a state a reader can act on", and those two zeros need different actions.
      datum: duplicatesDatum(input.duplicatesEverRan, nearDuplicates),
      done: nearDuplicates > 0,
    },
  ];

  return { phase, headline: headlineFor(phase, input, families, storyThemes), hero, support, stages };
}

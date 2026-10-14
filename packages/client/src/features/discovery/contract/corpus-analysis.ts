// The client masthead/readiness fold's aggregate facts; no server response carries this composition.
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
  /**
   * DID THE QUEUE READ THE THREE `*EverRan` FLAGS COME FROM ACTUALLY ANSWER? (#1546.)
   *
   * One field rather than three widened flags, because there is one fact: all three are `some(row => …)`
   * over a single `workloads.list` result, so a failure moves them together and stating it three times
   * would let the three drift. `"failed"` turns every `false` flag beside it into {@link CorpusPassRan}'s
   * `"unknown"` — a flag that is TRUE still means the pass ran, because a row that says so is a row we saw.
   *
   * The surface's own conservative pre-answer for a read still IN FLIGHT stays `"answered"` + `false` ("not
   * run"), which is the ruling `corpus-home-surface.tsx` records and this does not disturb: a settling queue
   * resolves in a beat, a failed one does not resolve at all.
   */
  readonly queueRead: "answered" | "failed";
}

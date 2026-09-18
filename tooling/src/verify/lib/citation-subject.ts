// THE CITATION SUBJECT JOIN (#2156's filed contract, built 2026-09-13 on codex review F1) — the half of
// board-citation reconciliation that asks not "does this id resolve" but "does the row it names describe
// THIS defect".
//
// WHY RESOLUTION WAS NEVER ENOUGH. #2156's founding example is #2153: the ledger closed the
// `authoredExclusionReason` row citing #2114 when #2116 owned that deletion, and closed the
// refusal-vocabulary row citing #2116 when #2115 owned it. BOTH wrong numbers EXIST, so a resolution-only
// barrier reports zero crossings on the exact defect it was filed for — recreate the crossing today and
// the run still exits 0. The first shipped barrier said so in its own report and proposed closing #2156
// anyway; this module is the missing half.
//
// THE MATCHING CONTRACT, WHICH IS DETERMINISTIC AND HAS NO KEYWORD HEURISTIC IN IT. Two texts carry the
// same authored key and the join is string equality over them:
//
//   • THE LEDGER ROW'S key is the leading segment of its `wave`/`lane` column, up to the first `·`:
//     `cb-v-parity-instruments L4 · \`…/conversion-refusal-liveness.ts:161\`` → `cb-v-parity-instruments L4`.
//   • THE BOARD ROW'S key is the leading segment of the `**Where:**` line in the ISSUE BODY, same cut:
//     `**Where:** cb-v-parity-instruments L4 · \`…:161\`` → `cb-v-parity-instruments L4`. This is the
//     grammar the verifier ingress already writes; 61 rows on the board carried it when this landed and
//     every one of them spells the row label `L<digits>`.
//
// A key splits into FAMILY (the wave/lane name) and ROW (`L<digits>`). The verdicts:
//
//   • `matched`      — the two keys are equal. 54 of 362 ledger citations, measured 2026-09-13.
//   • `crossed`      — SAME FAMILY, DIFFERENT ROW. **This is the hard arm** and it is exactly #2153's
//     shape: the cited row belongs to the same wave and is not this row. Restore #2153's two cells and it
//     reports 2; on today's tree it reports 0.
//   • `cross-family` — the declared subject names a DIFFERENT wave. ADVISORY, never a verdict, because the
//     ledger legitimately closes a row by pointing at the earlier board row of the same defect FAMILY
//     ("a NEW instance of #2150's family", "the FOURTH carrier of #2136's false parenthetical"). All four
//     such citations on today's tree read that way; a hard arm here would have shipped four day-one false
//     positives, which is the failure mode the class-2 openness rule was already refused for.
//   • `undeclared`   — the cited row carries no `**Where:**` line, so it makes no subject claim to check.
//     303 of 362 citations over 133 distinct issues. COUNTED, never a verdict: many are THEMATIC rows one
//     ledger row cannot name (#2041 is cited by four rows across waves 8-10, #1978 by five), so a
//     one-subject-per-issue key would be false for them. This is the residue that keeps #2156 OPEN.
//   • `unkeyed`      — one side's key does not parse into family + row (an older `w6 :157` wave label, or
//     a declared key in a spelling this grammar does not know). Counted and printed, never a verdict.
//
// THE NON-VACUITY GUARD IS THE OTHER HALF OF THE CONTRACT and lives in `board-citations.ts`: a configured
// ledger that yields ZERO `matched` citations means the join stopped reading, not that the tree is clean.

/** A parsed citation subject: which wave/lane, and which of its rows. */
export interface CitationSubject {
  readonly family: string;
  readonly row: string;
}

/** How a ledger citation's subject stands against the row it names — see the verdict table in the header. */
const SUBJECT_VERDICTS = ["matched", "crossed", "cross-family", "undeclared", "unkeyed"] as const;
// @orb-waive no-inline-types(SubjectVerdict): consumed within the citation lib/ cluster only; not a cross-domain shape; ends when a gate imports it
export type SubjectVerdict = (typeof SUBJECT_VERDICTS)[number];

/** The `**Where:**` line the verifier ingress writes into an issue body. Anchored to the line start so a
 *  quotation of the grammar inside prose cannot be read as the row's own declaration. */
const DECLARED_SUBJECT = /^\*\*Where:\*\*[ \t]*(.+)$/mu;
/** `<family> L<digits>` — the ONE row-label spelling every declaring row uses (all 61, measured
 *  2026-09-13). A key in any other spelling is `unkeyed`: counted and printed, never guessed at. */
const SUBJECT_ROW = /^(?<family>.+?)[ \t]+(?<row>L\d+)$/u;

/** The leading segment of an authored subject cell, up to the first `·`, with markdown emphasis and code
 *  ticks stripped and whitespace collapsed. `undefined` when nothing is left. */
export function subjectKey(cell: string): string | undefined {
  const head = cell.split("·")[0] ?? "";
  const flat = head.replaceAll(/[`*]/gu, "").replaceAll(/\s+/gu, " ").trim();
  return flat === "" ? undefined : flat;
}

/** The subject key a BOARD ROW declares about itself, read off its body. `undefined` when the row declares
 *  none — which is a population to count, never a finding. */
export function declaredSubjectKey(body: string): string | undefined {
  const line = DECLARED_SUBJECT.exec(body)?.[1];
  return line === undefined ? undefined : subjectKey(line);
}

/** Split a key into family + row, or `undefined` when it is not in the known spelling. */
export function parseSubject(key: string | undefined): CitationSubject | undefined {
  const groups = key === undefined ? undefined : SUBJECT_ROW.exec(key)?.groups;
  return groups === undefined ? undefined : { family: groups["family"] ?? "", row: groups["row"] ?? "" };
}

/** Judge ONE ledger citation's subject against the body of the row it names. Pure and total — the caller
 *  decides which verdicts are findings (only `crossed` is). */
export function subjectVerdict(ledgerKey: string | undefined, issueBody: string): SubjectVerdict {
  const declared = declaredSubjectKey(issueBody);
  if (declared === undefined) {
    return "undeclared";
  }
  if (ledgerKey !== undefined && declared === ledgerKey) {
    return "matched";
  }
  const mine = parseSubject(ledgerKey);
  const theirs = parseSubject(declared);
  if (mine === undefined || theirs === undefined) {
    return "unkeyed";
  }
  return mine.family === theirs.family ? "crossed" : "cross-family";
}

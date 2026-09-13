// THE `@orb-waive` POSITION GRAMMAR AND ITS COORDINATE HELPER — one home, gate-facing (#2155, arm B).
//
// WHY THIS MODULE EXISTS AT ALL. §12.5: "Gate modules receive neither grant tables nor marker parsers."
// `lib/ordinary-waiver.ts` is the marker ENGINE — `acquireMarkers`, `matchBatch`, `reconcileMatch`, the
// carrier walk — and after #2107 three gates imported it for one pure string helper
// (`no-raw-color-in-css`, `no-tailwind-dark-variant`, `rest-transform-grid`), which handed each of them the
// parser's whole export surface. That is the red the forge's `policy-legacy-imports` arm names.
//
// WHY THE GRAMMAR MOVED TOO, RATHER THAN THE HELPER ALONE (the fork, ruled 2026-09-12). Leaving
// `isWaivablePosition` and the character class in the engine would have forced this module to import them,
// so a gate would still reach the engine TRANSITIVELY, and — the tell — the engine would have had to grow a
// NEW EXPORT (the excluded-character set) purely to serve gate modules. A fix whose cost is widening the
// marker engine's export surface in order to serve gates points the wrong way down the sentence it is
// trying to satisfy. Moving the grammar whole removes the engine from the gates' closure entirely, adds
// zero engine exports, and is correct under a direct-import rule AND a closure rule instead of betting on
// which one the arm implements. `ordinary-waiver.ts` is left exporting exactly one thing —
// `createOrdinaryWaiverEngine` — which is what a module called "the engine" should export.
//
// NOTHING IS RESPELLED. The character class, the predicate and the scan are the same bytes they were in
// `ordinary-waiver.ts`; the engine now imports {@link POSITION} from here to build its marker regex, so the
// parser and every minting site still read ONE definition. A second copy of `[^()\r\n]` would be a rule that
// can drift from the thing it mirrors, which is the defect #1957 closed.

/** THE POSITION CHARACTER SET — the one home, because every other spelling is DERIVED from it rather than
 *  retyped (#1957). {@link POSITION} builds the regex character class from it and {@link waivableCoordinate}
 *  scans with it, so the two readers cannot disagree. The marker's position group is delimited by parentheses
 *  and lives on one comment line, so a position containing `(`, `)`, CR or LF cannot be expressed at all: a
 *  marker naming one parses as `malformed` and the finding it targets is UNWAIVABLE. That made the escape
 *  hatch a policy's `fix` string promises unreachable for any finding whose reported token carries a paren,
 *  with nothing saying so. The rule binds at the REPORT door (`lib/policy-pass-context.ts`) through
 *  {@link isWaivablePosition}, so an unwaivable position is a loud tool error at the moment it is minted
 *  instead of a finding nobody can ever answer. */
const POSITION_EXCLUDED = ["(", ")", "\r", "\n"] as const;
const POSITION_EXCLUDED_SET: ReadonlySet<string> = new Set(POSITION_EXCLUDED);

/** The regex FRAGMENT for one position, consumed by this module's own predicate and by the engine's marker
 *  regex (`lib/ordinary-waiver.ts`). Exported so the parser and the minting sites read one definition. */
export const POSITION = `[^${POSITION_EXCLUDED.join("")}]+`;

const POSITION_RE = new RegExp(`^${POSITION}$`, "u");

/** Can the marker grammar hold this position at all? The one door every minting site asks, so the answer can
 *  never drift from {@link POSITION} above. A blank position is rejected for the same reason the parser
 *  rejects it: `parseMarker` treats an empty capture as `malformed`. */
export function isWaivablePosition(position: string): boolean {
  return position.trim() !== "" && POSITION_RE.test(position);
}

/** THE COORDINATE for a value the grammar cannot hold whole (#2107 arm c, guide §2.1): the value's own leading
 *  paren-free slice, so `oklch(0.5 0.2 30)` → `oklch` and `[&:where(.x:y)]:dark:bg-card` → `[&:where`. A
 *  value that IS waivable is returned unchanged, which is what keeps the split free for `#ff0000`.
 *
 *  `undefined` means NO anchorable head exists, and every caller must treat that as a refusal rather than
 *  dropping the finding — a finding nobody can name is the defect the split exists to remove.
 *
 *  WHY A PREFIX AND NOT SOMETHING MORE SPECIFIC: the position must be an EXACT SLICE of the source at the
 *  reported coordinate (`locateFinding` re-reads it out of comment-blanked text), so it can only be a
 *  contiguous run starting where the finding points. WHAT IT COSTS, statable in one line: two findings in one
 *  carrier sharing a coordinate are mutually unwaivable (`over-broad`, a loud alarm) — but a collision needs
 *  both values to share a paren-free PREFIX, which means both contain a paren, which means NEITHER was
 *  waivable before. The split therefore never takes waivability away from a site that had it.
 *
 *  THE SCAN USES THE EXCLUDED SET, not a re-derivation through {@link isWaivablePosition} one character at a
 *  time: that alternative reads a leading SPACE as unwaivable (the predicate rejects a blank position) and
 *  would silently return `undefined` for a value the pre-move code accepted. */
export function waivableCoordinate(value: string): string | undefined {
  if (isWaivablePosition(value)) {
    return value;
  }
  let head = "";
  for (const char of value) {
    if (POSITION_EXCLUDED_SET.has(char)) {
      break;
    }
    head += char;
  }
  return isWaivablePosition(head) ? head : undefined;
}

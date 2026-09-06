// The forced-state pass's GROUP-VARIANT arm, all four directions (#1073 then #1084).
//
// MIRRORS `ops/hover-walker.ts` — the census that PAIRS a painted element with the subject whose state
// repaints it. The depth scan (`stateHoverScan`) and the anchor derivation (`groupVariantPairOf`) live in
// ops/walker/state-paint.ts and ops/walker/group-variant.ts, but the defect and both fixes are in the
// pairing loops here.
//
// THE TWO-STEP THIS FILE RECORDS, because the second step only makes sense against the first:
//   #1073 — `:hover` had no functional-pseudo depth guard, so Tailwind's compiled group variant built a
//           pair whose subject resolved to the PAINTED element. CDP held `:hover` there, nothing
//           repainted, and the pass published `excluded(noHoverChange)`: a measurement claim about a rule
//           it never engaged. Replaced with `withheld(complexStateSelector)` — honest, but a NO VERDICT.
//   #1084 — the owner's follow-through, and the house idiom exactly: THE RULING SURVIVES, ITS INPUT
//           CHANGED. The shape was withheld because it was unforcible; the anchor inside the `:is()` is
//           rest-resolvable, so the pass resolves it, forces THAT, and judges. What is still withheld is
//           what the derivation still refuses — and the third test below is that refusal, on the shape
//           (`peer-hover:`, a SIBLING combinator) where `closest()` has no answer.
//
// THE FIXTURE SELECTORS ARE THE LIVE ONES, not plausible ones. Read out of the CSS the dev stack actually
// serves (`packages/ui/src/styles/globals.css`, 2026-09-01): `:is(:where(.group):hover *)`, also in a
// named form `:is(:where(.group\/row):hover *)`. Live carriers:
// packages/client/src/features/chat/components/home-hearth-room.tsx:184 and
// packages/ui/src/primitives/list-row/variants.ts:107.
//
// THE BACKSLASH IS THE CSS ESCAPE, NEVER THE CLASS TOKEN: Tailwind's markup carries
// `class="group-hover:text-foreground"` and only its stylesheet spells `\:`. Writing the backslash into
// the HTML mints a class nothing matches, and the census then reports `noHoverPaint` — the selector was
// never engaged rather than the pair being wrong (caught here by a red-first run).
// The rest colour is a STYLESHEET declaration, not an inline one: an inline `style` outranks any class
// rule, so an inline rest colour makes even a correct `:hover` read as `noHoverChange`.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { AUDIT_ARGV, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../support/ui-audit-relational.ts";

const GROUP_HOVER_FIXTURE = `<style>
.label { color: #8a8a8a; }
.group-hover\\:text-foreground:is(:where(.group):hover *) { color: #ffffff; }
</style>
<div class="group" style="padding:8px"><span class="label group-hover:text-foreground">ancestor-driven label</span></div>`;

const PLAIN_HOVER_FIXTURE = `<style>
.plain-label { display: inline-block; color: #8a8a8a; }
.plain-label:hover { color: #ffffff; }
</style>
<span class="plain-label">self-driven label</span>`;

/** Tailwind's `peer-hover:` variant — the SIBLING form. `closest()` cannot reach a preceding sibling, so
 *  the derivation refuses this shape and the pass withholds it. The refusal is the reason the acceptance
 *  above is worth anything. */
const PEER_HOVER_FIXTURE = `<style>
.peer-label { display: inline-block; color: #8a8a8a; }
.peer-hover\\:text-foreground:is(:where(.peer):hover ~ *) { color: #ffffff; }
</style>
<div><span class="peer" style="display:inline-block">trigger</span><span class="peer-label peer-hover:text-foreground">sibling-driven label</span></div>`;

/** The ATTRIBUTE twin of the group variant. Its subject resolution is identical — `closest(anchor)` — so
 *  #1084 retires `complexStateSelector` on BOTH mechanisms rather than one. The anchor deliberately does
 *  NOT carry the attribute at rest: a subject already in the state is `excluded(alreadyInState)`, which
 *  would prove nothing about forcing. */
const GROUP_ATTR_FIXTURE = `<style>
.attr-label { color: #8a8a8a; }
.group-data-\\[selected\\]\\:text-foreground:is(:where(.group)[data-selected] *) { color: #ffffff; }
</style>
<div class="group" style="padding:8px"><span class="attr-label group-data-[selected]:text-foreground">ancestor-attribute label</span></div>`;

/** TWO subjects, ONE painted element (#1092). Both rules paint `.two-subject-label`; the subjects are an
 *  ancestor pair, so a pointer can produce EITHER state — inside `.card` (both hovered, the `.card` rule
 *  wins the equal-specificity tie) or elsewhere in `.row` (only the `.row` rule applies). Two reachable
 *  paints, two questions. Specificity is deliberately equal (0,3,0 each) so the second declaration wins
 *  by ORDER: a specificity fight would make the shallow subject's paint unreachable and the fixture would
 *  be proving the opposite of what it claims. */
const TWO_SUBJECT_FIXTURE = `<style>
.two-subject-label { color: #8a8a8a; }
.row:hover .two-subject-label { color: #d2d2d2; }
.card:hover .two-subject-label { color: #ffffff; }
</style>
<div class="row" style="padding:24px"><div class="card" style="padding:8px"><span class="two-subject-label">two-subject label</span></div></div>`;

test("an element painted by TWO hover subjects asks TWO questions — the pair map keys by subject, as the attribute side does", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "two-subject-hover.html"), relationalDocument(TWO_SUBJECT_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "two-subject-hover.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // RED-FIRST (#1092): `hoverPaintOf` was a single-subject map with deepest-wins, so the `.row` state was
  // never asked and this read `candidates=1 judged=1 … hover-subjects-forced=1` — a denominator that
  // silently dropped a reachable state, while the ATTRIBUTE side keyed by state and kept both.
  expect(res.stdout, "one element, two reachable hover states, two candidate rows").toMatch(/POPULATION\s+hover-contrast candidates=2 judged=2 /u);
  // Both subjects were really HELD: a second candidate that shared the deeper subject's single force
  // would be two rows describing one measurement.
  expect(res.stdout).toMatch(/hover-subjects-forced=2\b/u);
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

test("a compiled group-hover rule is JUDGED against its resolved ancestor, not the painted element", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "group-hover.html"), relationalDocument(GROUP_HOVER_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "group-hover.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // JUDGED — the whole point of #1084. Pre-#1073 this read `judged=1 … excluded(noHoverChange=1)` (a lie:
  // the forced element was the painted one); post-#1073 and pre-#1084 it read
  // `judged=0 … withheld(complexStateSelector=1)` (honest, but no verdict).
  expect(res.stdout, "the anchor inside the :is() is rest-resolvable, so the pair is forcible").toMatch(/POPULATION\s+hover-contrast candidates=1 judged=1 /u);
  expect(res.stdout, "a shape the forcer can now hold is not a withheld shape").not.toContain("complexStateSelector");
  // A subject WAS held: a run that judged without forcing anything would be the same lie in a new costume.
  expect(res.stdout).toMatch(/hover-subjects-forced=1\b/u);
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

test("the ATTRIBUTE twin of the group variant is judged the same way", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "group-attr.html"), relationalDocument(GROUP_ATTR_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "group-attr.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  expect(res.stdout, "the attr half resolves the same anchor and forces it in page").toMatch(/POPULATION\s+hover-contrast candidates=1 judged=1 /u);
  expect(res.stdout).not.toContain("complexStateSelector");
  expect(res.stdout).toMatch(/attr-subjects-forced=1\b/u);
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

test("a SIBLING-combinator group variant stays WITHHELD — closest() has no answer for it", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "peer-hover.html"), relationalDocument(PEER_HOVER_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "peer-hover.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // The refusal control. A derivation that accepted this would resolve the WRONG ancestor (or none) and
  // put the census straight back into publishing measurements it never took.
  expect(res.stdout, "an unforcible shape is withheld by name, never quietly judged or excluded").toMatch(
    /POPULATION\s+hover-contrast candidates=\d+ judged=0 .*withheld\(complexStateSelector=\d+\)/u,
  );
  expect(res.stdout).toContain("rule population completeness is ABSENT");
  await expect(res).toExitWith(2);
});

test("a plain :hover rule on the painted element itself keeps being judged", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "plain-hover.html"), relationalDocument(PLAIN_HOVER_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "plain-hover.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // The fence that has been green on both sides of both fixes: a top-level `:hover` names its own
  // subject, and neither the depth guard nor the anchor derivation may swallow it.
  expect(res.stdout, "a self-subject hover pair is forcible and must stay judged").toMatch(/POPULATION\s+hover-contrast candidates=1 judged=1 /u);
  expect(res.stdout).not.toContain("complexStateSelector");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

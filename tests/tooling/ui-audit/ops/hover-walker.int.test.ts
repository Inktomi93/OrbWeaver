// The forced-state pass's GROUP-VARIANT arm, both directions (#1073).
//
// MIRRORS `ops/hover-walker.ts` — the census that PAIRS a painted element with the subject whose state
// repaints it. The depth scan it now consults (`stateHoverScan`) lives one file over in
// ops/walker/state-paint.ts, but the defect and the fix are both in the pairing loop here.
//
// THE DEFECT. `ops/walker/state-paint.ts`'s attribute scanner has always tracked functional-pseudo DEPTH:
// a state test reachable only inside `:is()`/`:where()` names an ANCESTOR as its subject, so forcing the
// element the compound names would not engage the rule, and those pairs are `withheld(complexStateSelector)`
// (docs/design/state-paint-census.md, the Polarity bullet). The `:hover` half had no such guard — one
// `hasStateHover` boolean for "anywhere" — so Tailwind's compiled group-hover rule built a pair whose
// subject resolved to the PAINTED element, CDP held `:hover` on it, nothing repainted, and the pass
// published `excluded(noHoverChange)`: a MEASUREMENT CLAIM about a rule it never engaged.
//
// THE FIXTURE SELECTOR IS THE LIVE ONE, not a plausible one. Read out of the CSS the dev stack actually
// serves (`packages/ui/src/styles/globals.css`, 2026-09-01):
//   .group-hover\:text-foreground:is(:where(.group):hover *)
// Live carriers of that exact shape: packages/client/src/features/chat/components/home-hearth-room.tsx:184
// (`group-hover:text-foreground` on a text span) and packages/ui/src/primitives/list-row/variants.ts:107.
//
// WHY THE CLI TIER. The scanner runs inside HOVER_CENSUS — a JS string evaluated in a real browser against
// real CSSOM — so the compiled selector, the escaped variant colon in the class NAME, and the CDP force are
// all only reachable end to end.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../support/ui-audit-relational.ts";

// The BACKSLASH IS THE CSS ESCAPE, NEVER THE CLASS TOKEN: Tailwind's markup carries
// `class="group-hover:text-foreground"` and only its stylesheet spells `\\:`. Writing the backslash into
// the HTML mints a class nothing matches, and the census then reports `noHoverPaint` — the selector was
// never engaged rather than the pair being wrong (caught here by the red-first run).
// The rest colour is a STYLESHEET declaration, not an inline one: an inline `style` outranks any class
// rule, so an inline rest colour makes even a correct `:hover` read as `noHoverChange`.
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

test("a compiled group-hover rule is WITHHELD, never excluded as unchanged", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "group-hover.html"), relationalDocument(GROUP_HOVER_FIXTURE));
  const res = await runCli("ui-audit", ["/group-hover.html", "--base", `file://${scratch}`], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // THE POLARITY IS THE WHOLE FINDING. Pre-#1073 this read `judged=1 … excluded(noHoverChange=1)` — the
  // instrument asserting it had measured a rule whose subject it never held.
  expect(res.stdout, "the ancestor-subject shape must withhold by name, exactly as its attribute twin does").toMatch(
    /POPULATION\s+hover-contrast candidates=1 judged=0 .*withheld\(complexStateSelector=1\)/u,
  );
  expect(res.stdout, "a withheld candidate is never also an exclusion claim").not.toContain("noHoverChange");
  // Withheld (non-cap) is a NO VERDICT run by the house rule — that is the point of the polarity.
  expect(res.stdout).toContain("rule population completeness is ABSENT");
  await expect(res).toExitWith(2);
});

test("a plain :hover rule on the painted element itself keeps being judged", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "plain-hover.html"), relationalDocument(PLAIN_HOVER_FIXTURE));
  const res = await runCli("ui-audit", ["/plain-hover.html", "--base", `file://${scratch}`], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // The negative control: the depth guard must not swallow the mechanism it is guarding. A top-level
  // `:hover` names its own subject, CDP can force it, and the pass owes a verdict.
  expect(res.stdout, "a self-subject hover pair is forcible and must stay judged").toMatch(/POPULATION\s+hover-contrast candidates=1 judged=1 /u);
  expect(res.stdout).not.toContain("complexStateSelector=1");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

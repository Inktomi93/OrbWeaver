// THE #2000 TIER-3 CLOSE-BY-RULE ROSTER, HELD TWO-SIDEDLY — lane p-parity-tier2bc.
//
// WHY THIS FILE EXISTS AND NOT A LIST IN A DOC. #2000's Tier 3 was "17 one-to-one ports at 0/0, close BY
// RULE". The NUMBER survived; the LIST did not — it lived in a
// session scratchpad (`parity-A/B/C.txt`) that was never committed, and
// `git log --all --diff-filter=A -- '*parity-C*'` finds nothing. A roster with nothing two-sided holding
// it decays into a number nobody can act on, and this one decayed all the way. So the ruling is written
// as a MEMBERSHIP TEST — executed here, over today's corpus — and the roster is its OUTPUT. A conversion
// that changes who qualifies turns this file red instead of quietly invalidating a paragraph.
//
// THE RULING (its prose home, with the reasoning and the census disagreement, is
// `docs/reviews/gate-runtime/tier3-one-to-one-port-ruling.md`):
//
//   A converted module owes NO §4.6 differential when its conversion was a ONE-TO-ONE PORT OF A
//   PURE-SYNTAX VISITOR THAT STILL CARRIES ITS LEGACY PROOF ROWS. Clause 6 is the load-bearing one: if the
//   final module's `mustFlag`/`mustPass` rows are still the legacy rows, then `check:policy-conformance`
//   already runs the legacy corpus through the production dispatcher every static pass, and a replay adds
//   nothing a carried row does not already assert. Rewrite the rows and that argument dies with them.
//
// CARRIAGE MEANS LABELS AND BYTES, AND THE FIRST VERSION OF THIS FILE CHECKED ONLY THE LABELS (#2118,
// found by a fresh-context read of this file rather than by a failure). Clause 6 compared each legacy
// row's `why` and nothing else, so a conversion that kept every `why` while rewriting the FIXTURES still
// qualified — and the "conformance already runs the legacy corpus" argument was then false, because the
// dispatcher was running re-authored fixtures. That was not hypothetical: `no-decorators` carried all
// three `why` strings verbatim through a conversion that re-indented and re-homed all three of its
// template-literal fixtures. It sat on the roster from the first commit until this clause grew its second
// half, and it is now REPLAY-OWED. The roster went 12 → 11; no other module moved.
//
// A CONVERSION LANDING AFTER THIS COMMIT IS EXPECTED TO RED THIS FILE, and that is the mechanism working
// rather than a flake: a newly converted pure-syntax one-to-one port JOINS the roster the moment it lands.
// The response is to read the diff `toEqual` prints, add the module to `CLOSED_BY_RULE` here and to the
// table in the ruling doc, and say so in the merge commit — never to relax a clause. This is exactly what
// the lost seventeen could not do for itself.
//
// WHAT THIS TEST CANNOT DECIDE, stated because a silent limit is how a rule becomes a rubber stamp — and
// kept SHORT on purpose, because the third entry this block used to owe is now enforced rather than
// declared (see clause 6 above; "declare the limit" is a partial fix wearing a receipt's clothes):
//
//  · IT CLASSIFIES BY THE LEGACY BLOB'S SHAPE, NEVER BY A REAL-TREE RUN. It cannot see whether a legacy
//    gate's live findings were zero. Clause 6 is the substitute for that evidence, not a proxy for it.
//  · IT READS THE LEGACY `scanRoot` FOR A NEGATION rather than proving the absence of a population
//    subtraction. Conservative — a negation REFUSES the module — but "no negation" is not "no
//    subtraction", so a CLOSED module whose population later turns out to have been narrowed is a defect
//    to FILE, not a verdict this file defends.
//  · BYTE CARRIAGE IS A SUBSTRING COMPARISON over the legacy `files`/`at` payload. It proves the fixture
//    text survived; it does not prove the row's `expect` still pins the same node, which is conformance's
//    job and runs on the static bar every pass.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const REPO = process.cwd();
const GATES = "tooling/src/verify/gates";

/** THE ROSTER — the membership test's output on the corpus this commit landed against, committed so a
 *  later conversion cannot change it silently. `docs/reviews/gate-runtime/tier3-one-to-one-port-ruling.md`
 *  carries the same list with each module's legacy SHA and the reasoning. */
const CLOSED_BY_RULE: readonly string[] = [
  "baseui-render-prop-composition",
  "ct-story-single-import",
  "infra-auth-no-userid",
  "member-card-clamped",
  "no-array-literal-querykey",
  "no-default-props",
  "no-external-media-without-gate",
  "no-layout-context-props",
  "no-media-queries-in-features",
  "no-raw-container-widths",
  "ui-accname-survives-spread",
];

function git(...args: readonly string[]): string {
  return execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

/** `git show <sha>^:<path>` EXITS NON-ZERO when the path did not exist at the conversion parent — which is
 *  exactly the BORN-FINAL case, a membership refusal rather than a tool failure. Any other git failure is
 *  rethrown, because a differential that treats a broken repo read as "no legacy" would close every module
 *  by rule. */
function legacyBlob(conversion: string, path: string): string {
  if (conversion === "") {
    return "";
  }
  try {
    return git("show", `${conversion}^:${path}`);
  } catch (error) {
    const message = error instanceof Error ? `${error.message}${"stderr" in error ? String(error.stderr) : ""}` : String(error);
    if (message.includes("exists on disk, but not in") || message.includes("does not exist in")) {
      return "";
    }
    throw error;
  }
}

const WHY = /why:\s*\n?\s*"((?:[^"\\]|\\.)*)"/gu;
const LEGACY_LIB = /from "\.\.\/lib\/([a-z0-9-]+)\.ts"/gu;
const SCAN_ROOT = /scanRoot:.*/gu;
/** A legacy `GateExample`'s `files:` or `at:` value, up to the next sibling key — the row's BYTES. `expect:`
 *  is deliberately excluded: a conversion legitimately gains a `mode` and may split a message. */
const FIXTURE_PAYLOAD = /\b(?:files|at):\s*([\s\S]*?)(?=\n\s*(?:files|at|expect|why|mode)\s*:|\n\s*\},)/gu;
/** Every quoted or template string inside such a value. Template literals are the spelling `no-decorators`
 *  used, and the spelling a quote-only sweep silently reported as zero payload. */
const PAYLOAD_STRING = /'((?:[^'\\]|\\[\s\S])*)'|"((?:[^"\\]|\\[\s\S])*)"|`((?:[^`\\]|\\[\s\S])*)`/gu;

/** Clauses 1-4 and 6, over the FROZEN LEGACY blob. */
function legacyRefusals(module: string, final: string, legacy: string): readonly string[] {
  const out: string[] = [];
  // 1 · ONE descriptor in, ONE policy out, under the SAME id.
  if (legacy.includes("defineGate")) {
    out.push("the conversion parent is already final");
  }
  if ((legacy.match(/export const gate/gu) ?? []).length !== 1) {
    out.push("the legacy blob is not a single exported descriptor");
  }
  const legacyName = /name:\s*"([^"]+)"/u.exec(legacy)?.[1];
  const finalId = /id:\s*"([^"]+)"/u.exec(final)?.[1];
  if (legacyName === undefined || finalId === undefined || legacyName !== finalId || finalId !== module) {
    out.push("the id is not a one-to-one carry of the legacy name");
  }
  // 2 · PURE SYNTAX: no shared semantic reader, no `_shared` reader, no type checker.
  const libs = new Set([...legacy.matchAll(LEGACY_LIB)].map((match) => match[1] as string));
  libs.delete("pass");
  if (libs.size > 0) {
    out.push(`the legacy reached shared readers: ${[...libs].toSorted((left, right) => left.localeCompare(right)).join(", ")}`);
  }
  if (legacy.includes("@orb/tooling/_shared/")) {
    out.push("the legacy reached a _shared reader");
  }
  if (legacy.includes("checker") || legacy.includes("getType(")) {
    out.push("the legacy reached the type checker");
  }
  // 3 · NO CROSS-FILE OR REAL-TREE STATE, and no exemption table: neither is reachable by a replay.
  if (legacy.includes("finalize:")) {
    out.push("the legacy carried a finalize arm");
  }
  if (legacy.includes("ExemptionTable") || legacy.includes("ExemptionRow")) {
    out.push("the legacy carried an exemption table");
  }
  // 4 · NO POPULATION SUBTRACTION in the legacy scanRoot — the vacuity shape §4.6 names by hand.
  if (legacy.includes("scanRoot") && [...legacy.matchAll(SCAN_ROOT)].some((match) => match[0].includes("!"))) {
    out.push("the legacy scanRoot carries a negation (a possible population subtraction)");
  }
  out.push(...carriageRefusals(final, legacy));
  return out;
}

/** Clause 6, THE LOAD-BEARING ONE: the final CARRIES the legacy proof rows, so `check:policy-conformance`
 *  already runs the legacy corpus through the production dispatcher every static pass.
 *
 *  CARRIAGE IS TWO THINGS, AND CHECKING ONLY THE FIRST WAS A REAL HOLE (#2118, found by a fresh-context
 *  read of this very file). The `why` strings are the row's LABELS; the `files`/`at` payload is the row's
 *  BYTES, and it is the bytes conformance actually runs. A conversion that keeps every `why` while
 *  rewriting the fixtures satisfies a label-only check and makes the soundness argument FALSE — the
 *  dispatcher is then running re-authored fixtures, not the legacy corpus. `no-decorators` is exactly that
 *  module: all three `why` strings survived its conversion verbatim while all three template-literal
 *  fixtures were re-indented and re-homed, and it sat on the roster until this clause grew its second
 *  half. It is now REPLAY-OWED. */
function carriageRefusals(final: string, legacy: string): readonly string[] {
  const region = legacy.slice(Math.max(legacy.indexOf("mustFlag:"), 0));
  const whys = [...legacy.matchAll(WHY)].map((match) => match[1] as string);
  const payload = [...region.matchAll(FIXTURE_PAYLOAD)]
    .flatMap((span) => [...(span[1] ?? "").matchAll(PAYLOAD_STRING)])
    .map((match) => (match[1] ?? match[2] ?? match[3] ?? "").trim())
    .filter((literal) => literal !== "");
  if (whys.length === 0) {
    return ["the legacy declared no proof rows — carriage cannot be checked"];
  }
  // The payload sweep is its own blindness risk: a legacy spelling it cannot parse yields zero literals
  // and would pass by measuring nothing, which is the clean-zero-from-a-blind-detector §4.5 refuses.
  if (payload.length === 0) {
    return ["the legacy proof rows declare no readable `files`/`at` payload — byte carriage cannot be checked"];
  }
  const missingWhy = whys.filter((why) => !final.includes(why));
  const missingBytes = payload.filter((literal) => !final.includes(literal));
  const out: string[] = [];
  if (missingWhy.length > 0) {
    out.push(`the final does not carry ${missingWhy.length} of ${whys.length} legacy proof rows verbatim`);
  }
  if (missingBytes.length > 0) {
    out.push(`the final does not carry ${missingBytes.length} of ${payload.length} legacy fixture payloads verbatim`);
  }
  return out;
}

/** Clause 5, over the FINAL descriptor: a conversion that acquired a fact, a resource or type analysis
 *  changed what the policy can SEE, which is precisely a differential's subject. */
function finalRefusals(final: string): readonly string[] {
  const out: string[] = [];
  if (!final.includes('analysis: "syntax"')) {
    out.push("the final is not analysis: syntax");
  }
  if (!final.includes("facts: []")) {
    out.push("the final declares facts");
  }
  if (!final.includes("resources: []")) {
    out.push("the final declares resources");
  }
  return out;
}

/** Every clause that can refuse a module, in the ruling's order. An empty list is membership. */
function refusals(module: string, final: string, legacy: string): readonly string[] {
  const finalSide = finalRefusals(final);
  return legacy === "" ? ["born final — no legacy blob at the conversion parent", ...finalSide] : [...legacyRefusals(module, final, legacy), ...finalSide];
}

test(
  "the Tier-3 close-by-rule roster is the membership test's output on today's corpus, not an inherited list",
  () => {
    const closed: string[] = [];
    let scanned = 0;
    for (const name of readdirSync(join(REPO, GATES)).toSorted((left, right) => left.localeCompare(right))) {
      if (!name.endsWith(".ts")) {
        continue;
      }
      const path = `${GATES}/${name}`;
      const final = readFileSync(join(REPO, path), "utf8");
      if (!final.includes("defineGate({")) {
        continue;
      }
      scanned += 1;
      const conversion = git("log", "--format=%H", "-S", "defineGate", "--reverse", "--", path).split("\n")[0] ?? "";
      const legacy = legacyBlob(conversion, path);
      if (refusals(name.slice(0, -3), final, legacy).length === 0) {
        closed.push(name.slice(0, -3));
      }
    }
    // THE SCAN'S OWN POSITIVE CONTROL: a zero here would make the roster comparison below pass by
    // measuring nothing, which is the "clean zero from a detector that might be blind" §4.5 refuses.
    expect(scanned, "the scan reached the final corpus").toBeGreaterThan(200);
    expect(
      closed.toSorted((left, right) => left.localeCompare(right)),
      "the derived roster equals the committed one",
    ).toEqual([...CLOSED_BY_RULE].toSorted((left, right) => left.localeCompare(right)));
  },
  scaledBudget(120_000),
);

test("the membership test refuses each way it is meant to refuse", () => {
  // The control legacy blob carries a REAL proof row — a `files` payload, an `at` path and a `why` — because
  // clause 6 now checks all three and a control without them would exercise nothing.
  const fixture = "export const probe = 1;";
  const fixturePath = "packages/server/src/probe.ts";
  const pureLegacy = [
    "export const gate: GateDescriptor = {",
    '  name: "probe",',
    "  mustFlag: [",
    "    {",
    `      files: '${fixture}',`,
    `      at: "${fixturePath}",`,
    '      why: "the founding row",',
    "    },",
    "  ],",
    "};",
  ].join("\n");
  const pureFinal = [
    'id: "probe"',
    'analysis: "syntax"',
    "facts: []",
    "resources: []",
    '  why: "the founding row",',
    `  files: { "${fixturePath}": "${fixture}" },`,
  ].join("\n");
  expect(refusals("probe", pureFinal, pureLegacy), "the control PASSES, so every refusal below is the clause and not the fixture").toEqual([]);
  // One planted break per clause, each asserted to name its own clause — a membership test nobody has seen
  // refuse is a rubber stamp.
  expect(refusals("probe", pureFinal, "")).toEqual(["born final — no legacy blob at the conversion parent"]);
  expect(refusals("probe", pureFinal, `${pureLegacy}\nimport { x } from "../lib/ast-read.ts";`)).toEqual(["the legacy reached shared readers: ast-read"]);
  expect(refusals("probe", pureFinal, `${pureLegacy}\nimport { y } from "@orb/tooling/_shared/schema-read";`)).toEqual(["the legacy reached a _shared reader"]);
  expect(refusals("probe", pureFinal, `${pureLegacy}\nfinalize: (ctx) => {},`)).toEqual(["the legacy carried a finalize arm"]);
  expect(refusals("probe", pureFinal, `${pureLegacy}\nconst EXEMPT: ExemptionTable = [];`)).toEqual(["the legacy carried an exemption table"]);
  expect(refusals("probe", pureFinal, `${pureLegacy}\nscanRoot: (p) => !p.includes("x"),`)).toEqual([
    "the legacy scanRoot carries a negation (a possible population subtraction)",
  ]);
  expect(refusals("probe", pureFinal, pureLegacy.replace('name: "probe"', 'name: "other"'))).toEqual(["the id is not a one-to-one carry of the legacy name"]);
  expect(refusals("probe", pureFinal.replace('analysis: "syntax"', 'analysis: "types"'), pureLegacy)).toEqual(["the final is not analysis: syntax"]);
  expect(refusals("probe", pureFinal.replace("facts: []", "facts: [someFact]"), pureLegacy)).toEqual(["the final declares facts"]);
  expect(refusals("probe", pureFinal.replace("resources: []", "resources: [someResource]"), pureLegacy)).toEqual(["the final declares resources"]);
  expect(refusals("probe", pureFinal.replace('why: "the founding row"', 'why: "a rewritten row"'), pureLegacy)).toEqual([
    "the final does not carry 1 of 1 legacy proof rows verbatim",
  ]);
  expect(refusals("probe", pureFinal, pureLegacy.replace('  why: "the founding row",\n', ""))).toEqual([
    "the legacy declared no proof rows — carriage cannot be checked",
  ]);
  // CLAUSE 6'S SECOND HALF (#2118): the labels survive and the BYTES do not. This is the live shape —
  // `no-decorators` kept all three `why` strings through a fixture rewrite — so it is planted, not argued.
  expect(refusals("probe", pureFinal.replace(fixture, "export const rewritten = 1;"), pureLegacy)).toEqual([
    "the final does not carry 1 of 2 legacy fixture payloads verbatim",
  ]);
  // AND THE SWEEP'S OWN BLINDNESS: a legacy row the payload reader cannot parse must REFUSE, never pass by
  // measuring nothing.
  expect(refusals("probe", pureFinal, pureLegacy.replace(`      files: '${fixture}',\n`, "").replace(`      at: "${fixturePath}",\n`, ""))).toEqual([
    "the legacy proof rows declare no readable `files`/`at` payload — byte carriage cannot be checked",
  ]);
});

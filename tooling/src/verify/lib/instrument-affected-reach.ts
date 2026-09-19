// THE GATE-ID REACH (#1967): which specs under `tests/tooling/verify/gates/` name a policy by ID.
//
// WHY A TEXT SEARCH AND NOT THE MIRROR. A converted policy's family test routinely lives under its WAVE's
// name rather than its gate's — `contract-shape-wave-1.test.ts`, `simple-visitors-wave-2.test.ts`,
// `callback-provenance-family.suite.test.ts` — so `tooling/src/verify/gates/<id>.ts` prefix-swaps to a
// path that does not exist while the policy's §4.2/§4.5 proofs sit one directory over. That is not an
// accident to be fixed by renaming: a family's proofs belong in ONE file, which by construction cannot be
// named after each of its members. `.claude/rules/gates-and-tooling.md` already states the rule for
// humans ("grep the gate ID as a STRING, never the filename"); this is that rule with a machine behind it.
//
// THE SEARCH IS DELIBERATELY DUMB — a quoted-ID substring over the spec's own text. It over-selects (a
// spec that merely MENTIONS a policy in a comment is selected) and that direction is the safe one: the
// cost is running a spec that did not need running, and the alternative direction is the silent miss this
// whole stage exists to remove. It cannot under-select through an alias or an import rewrite, because a
// proof row, a `policy:` pin and an ID assertion all spell the ID literally.
// NO try/catch ANYWHERE IN THIS MODULE, deliberately. Absence is ASKED (`existsSync`), never caught: a
// `catch` here would be an unproven caught-failure site (`caught-failure-ownership`) AND would turn an
// unreadable tests tree — a real tool error — into a quiet empty reach, which is the bare-zero shape this
// whole stage exists to remove. Every read below is of a path the directory listing produced moments
// earlier, so a failure is a genuine I/O fault and belongs as a throw the stage reports as exit 2.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GATE_TESTS_DIR = "tests/tooling/verify/gates";
const SPEC_SUFFIX = ".ts";

/** Every spec under the gate-tests directory, repo-relative, recursively. An ABSENT directory (a synthetic
 *  fixture root) yields none — the caller's empty-specs arm is what reports a policy with no proofs. */
function gateSpecs(root: string, relative: string = GATE_TESTS_DIR): readonly string[] {
  if (!existsSync(join(root, relative))) {
    return [];
  }
  const out: string[] = [];
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...gateSpecs(root, child));
    } else if (entry.name.endsWith(SPEC_SUFFIX)) {
      out.push(child);
    }
  }
  return out;
}

/** The specs whose text names `policyId` as a quoted string — the family test wherever it actually lives. */
export function toolingTestsNaming(root: string, policyId: string): readonly string[] {
  const needle = JSON.stringify(policyId);
  return gateSpecs(root).filter((rel) => readFileSync(join(root, rel), "utf8").includes(needle));
}

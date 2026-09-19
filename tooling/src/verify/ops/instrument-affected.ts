// THE AFFECTED-INSTRUMENT TEST LANE (#1967) — the family tests of the instruments THIS BRANCH CHANGED,
// run at a tier below `--full`.
//
// THE GAP IT CLOSES, read off `pnpm verify --list` rather than remembered: `structure:policy-conformance`
// runs in changed/static/push/full, so a policy's DECLARED `mustFlag`/`mustPass`/`mustRefuse` rows bind at
// every tier — but everything a declared row structurally CANNOT express runs in `tests:tooling`, which is
// `full` ONLY. That is the §4.2 production-dispatched identity arm (`waivedFindings === 1`,
// `authorityAlarms === []`), the central grant table's wrong-identity/duplicate/stale boundaries, and the
// §4.5 refusal and receipt pins. Measured cost, twice, five days each:
// `tests/tooling/verify/gates/registry-family.test.ts` red from `ab675b23b` (95 refused proof rows across
// eight policies, #1953) and `tests/tooling/static-class-consumers.int.test.ts` red from `1416f2c98`
// (#1956). Both commits ran and passed their named scoped floor; NEITHER TOUCHED A FAMILY TEST, which is
// exactly why the per-conversion floor rule — prose, "run the family test(s) you touched" — did not fire.
//
// THE #1842 PLACEMENT IS NOT REVERTED, and this row is careful to be the narrow thing rather than the
// battery: `tests:tooling` is 71 CPU-minutes over 284 files recertifying our tools, and it stays at
// `--full`. This lane runs the AFFECTED subset and nothing else, and refuses to run anything when the
// branch touched no instrument.
//
// TWO REACHES, and the second is the one the measured failures needed:
//   1. THE MIRROR — `tooling/src/X.ts` → `tests/tooling/X<suffix>.ts`, through the shared
//      `_shared/test-mirror.ts#resolveMirrors` the mutation probe already reads. Never re-derived here:
//      `test-layout` enforces that relation in the other direction and one spelling of it is the point.
//   2. THE GATE-ID STRING — a changed `tooling/src/verify/gates/<id>.ts` also selects every spec under
//      `tests/tooling/verify/gates/` whose TEXT contains `"<id>"`. This is load-bearing and is the whole
//      reason the mirror alone is not enough: a family test routinely lives under its WAVE's name rather
//      than its gate's (`contract-shape-wave-1.test.ts`, `simple-visitors-wave-2.test.ts`, …), so the
//      mirror maps a converted policy to a file that does not exist while its real proofs sit one
//      directory over. `.claude/rules/gates-and-tooling.md` states this as a rule for humans; this is the
//      same rule with a machine behind it.
//
// THE BRANCH ANSWER, NEVER THE WORKING-TREE ONE. At `--push` the changes are COMMITTED and the working
// tree is clean, so a working-tree read selects nothing and the stage passes vacuously — the #1967 defect
// in a new costume. `branchChangedPaths` unions the merge-base diff with the working tree and returns
// `null` when it cannot answer; `null` RUNS THE WHOLE BATTERY rather than selecting nothing, because an
// uncomputable precondition that reads as "nothing changed" is a silent false clean (the bare-zero law).
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { emitLine, warn } from "@orb/tooling/_shared/log";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { resolveMirrors } from "@orb/tooling/_shared/test-mirror";
import { toolingTestsNaming } from "../lib/instrument-affected-reach.ts";
import { branchChangedPaths, existsRel } from "../lib/repo-paths.ts";

refuseDirectInvocation(import.meta.url, "pnpm verify --push  /  pnpm check:instrument-affected");

const INSTRUMENT_SRC_PREFIX = "tooling/src/";
const GATES_PREFIX = "tooling/src/verify/gates/";
const TS_SUFFIX = ".ts";

/** The instrument sources in a changed set — the only inputs that can select a family test. */
function instrumentSources(root: string, changed: readonly string[]): readonly string[] {
  // A DELETED source is filtered out deliberately: its specs go with it, and selecting a path that is not
  // there would hand vitest an operand the preflight refuses.
  return changed.filter((path) => path.startsWith(INSTRUMENT_SRC_PREFIX) && path.endsWith(TS_SUFFIX) && existsRel(path, root));
}

/** The policy ID a changed gate module carries, or undefined — the loader's filename contract. */
function policyIdOf(path: string): string | undefined {
  if (!path.startsWith(GATES_PREFIX)) {
    return;
  }
  const id = path.slice(GATES_PREFIX.length, -TS_SUFFIX.length);
  // A nested path (`gates/_proof/x.ts`) is a proof helper, not a policy: the loader's filename contract is
  // one flat `<id>.ts` under the gates directory.
  return id.includes("/") ? undefined : id;
}

export interface InstrumentAffectedSelection {
  /** The instrument sources this branch changed. */
  readonly sources: readonly string[];
  /** The `tests/tooling/**` specs those sources reach, sorted and de-duplicated. */
  readonly specs: readonly string[];
  /** Set when the branch answer was UNCOMPUTABLE: the caller must run the whole battery, never nothing. */
  readonly unknown: boolean;
}

/** THE SELECTION, as a pure function of a changed set so the pin can drive it without a git repository. */
export function selectAffectedInstrumentTests(root: string, changed: readonly string[] | null): InstrumentAffectedSelection {
  if (changed === null) {
    return { sources: [], specs: [], unknown: true };
  }
  const sources = instrumentSources(root, changed);
  const specs = new Set<string>();
  for (const source of sources) {
    for (const mirror of resolveMirrors(root, source)) {
      specs.add(mirror);
    }
    const id = policyIdOf(source);
    if (id !== undefined) {
      for (const spec of toolingTestsNaming(root, id)) {
        specs.add(spec);
      }
    }
  }
  return { sources, specs: [...specs].toSorted(), unknown: false };
}

/** `pnpm check:instrument-affected` — the stage body. */
export function runInstrumentAffected(root: string): number {
  const selection = selectAffectedInstrumentTests(root, branchChangedPaths(root));
  if (selection.unknown) {
    warn(
      "instrument-affected: the branch's changed set could not be computed (no usable merge base, or git failed) — running the WHOLE instrument battery rather than selecting nothing, because an uncomputable precondition that reads as 'nothing changed' is a silent false clean.",
    );
    return runSpecs(root, ["tests/tooling"]);
  }
  if (selection.sources.length === 0) {
    emitLine("instrument-affected: this branch changed no tooling/src source — nothing to recertify.");
    return EXIT.clean;
  }
  if (selection.specs.length === 0) {
    // A CHANGED INSTRUMENT THAT REACHES NO SPEC IS A FINDING, NOT A PASS. `test-presence` owns the
    // obligation; this stage would otherwise print a clean zero over the exact blindness #1967 is about.
    warn(
      `instrument-affected: ${String(selection.sources.length)} changed instrument source(s) reach NO spec under tests/tooling — ` +
        `${selection.sources.join(", ")}. A changed instrument with no test that names it is unrecertified, not clean (tooling/src/verify/gates/GATE-AUTHORING.md §8).`,
    );
    return EXIT.violations;
  }
  emitLine(`instrument-affected: ${String(selection.sources.length)} changed source(s) → ${String(selection.specs.length)} spec(s).`);
  return runSpecs(root, selection.specs);
}

function runSpecs(root: string, specs: readonly string[]): number {
  const res = runNicedSync(process.execPath, [`${root}/scripts/vitest-supervised.mjs`, "run", ...specs, "--runtime-only", "--reporter=default"], {
    cwd: root,
    stdio: "inherit",
  });
  return res.status ?? EXIT.toolError;
}

// The probe's own honesty pins. Both cases below made the instrument report a CONFIDENT WRONG ANSWER
// before they were fixed, and both fail silently — the run looks like a successful adjudication.
//
// @instrument-proof: a mirror suite that is RED on unmutated source must REFUSE (every planted mutant
//   would read as killed), and a suite killed by the wall-clock ceiling must never be scored as a kill.
// @instrument-absence-proof: a source with no runnable mirror suite, and a report whose survivor
//   population is empty, must both fail loudly rather than return a clean zero-survivor summary.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { probeMutants } from "../../../../tooling/src/mutation-probe/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SRC_REL = "packages/server/src/domain/admin/guard.ts";
const SOURCE = "export const can = 1;\n";

interface Fixture {
  readonly root: string;
  readonly reportPath: string;
}

/** A fake repo root carrying the source, optionally its mirror suite, and a report over it. */
function fixture(opts: { readonly withSpec: boolean; readonly status?: string }): Fixture {
  const root = mkdtempSync(join(tmpdir(), "mutation-probe-op-"));
  const src = join(root, SRC_REL);
  mkdirSync(dirname(src), { recursive: true });
  writeFileSync(src, SOURCE);
  if (opts.withSpec) {
    const spec = join(root, "tests/server/domain/admin/guard.test.ts");
    mkdirSync(dirname(spec), { recursive: true });
    writeFileSync(spec, "");
  }
  const reportPath = join(root, "report.json");
  writeFileSync(
    reportPath,
    JSON.stringify({
      files: {
        [SRC_REL]: {
          source: SOURCE,
          mutants: [
            {
              mutatorName: "StringLiteral",
              replacement: '""',
              status: opts.status ?? "Survived",
              location: { start: { line: 1, column: 19 }, end: { line: 1, column: 20 } },
            },
          ],
        },
      },
    }),
  );
  return { root, reportPath };
}

test("a source with NO runnable mirror suite refuses instead of adjudicating nothing", () => {
  const { root, reportPath } = fixture({ withSpec: false });
  // Without this refusal the loop runs zero specs, every mutant survives, and the tool reports a
  // confident "N real survivors" over a file it never actually tested.
  expect(() => probeMutants({ reportPath, sourceRel: SRC_REL, root })).toThrow(/no runnable mirror suite/u);
});

test("an all-killed report refuses rather than returning a clean zero-survivor summary", () => {
  const { root, reportPath } = fixture({ withSpec: true, status: "Killed" });
  expect(() => probeMutants({ reportPath, sourceRel: SRC_REL, root })).toThrow(/ZERO survivors/u);
});

test("a red-on-pristine mirror suite refuses — the positive control the whole measurement rests on", () => {
  // The fixture root is not a real workspace, so `pnpm test:scoped` cannot come back green there. That
  // is precisely the baseline condition this arm exists to catch: no green baseline, no adjudication.
  const { root, reportPath } = fixture({ withSpec: true });
  expect(() => probeMutants({ reportPath, sourceRel: SRC_REL, root })).toThrow(/unmutated source/u);
});

test("REFUSES to plant into a source that already has uncommitted changes", () => {
  // A dirty target means the operator's WIP would be captured as "pristine" and restored over — and a
  // mutation stranded by an earlier hard kill looks identical to a deliberate edit. The repo shipped a
  // BLINDED gate this way once already (2026-08-24, a probe swept in by a broad `git add`).
  const { root, reportPath } = fixture({ withSpec: true });
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base"]);
  writeFileSync(join(root, SRC_REL), "export const can = 2; // operator WIP\n");
  expect(() => probeMutants({ reportPath, sourceRel: SRC_REL, root })).toThrow(/uncommitted changes/u);
});

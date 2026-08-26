// @instrument-proof: a mutation stranded by a mid-plant kill must be RESTORED on the next run, not left
//   on the tree wearing the camouflage of a normal edit.
// @instrument-absence-proof: with no marker present, healing must report "nothing to heal" rather than
//   silently touching a file — a heal that fires on a clean tree would clobber real work.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { armStrandGuard, healStranded } from "../../../../tooling/src/mutation-probe/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SRC_REL = "packages/server/src/domain/admin/guard.ts";
const PRISTINE = "export const can = 1;\n";
const MUTATED = "export const can = 999;\n";

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "mutation-probe-strand-"));
  const src = join(root, SRC_REL);
  mkdirSync(dirname(src), { recursive: true });
  writeFileSync(src, PRISTINE);
  return root;
}

test("a mutation stranded by a mid-plant kill is healed on the next run", () => {
  const root = fixtureRoot();
  // Arm, plant, then simulate the kill: no release, no finally — exactly what SIGKILL leaves behind.
  armStrandGuard(root, SRC_REL, PRISTINE);
  writeFileSync(join(root, SRC_REL), MUTATED);
  expect(readFileSync(join(root, SRC_REL), "utf8")).toBe(MUTATED);

  expect(healStranded(root)).toBe(SRC_REL);
  expect(readFileSync(join(root, SRC_REL), "utf8")).toBe(PRISTINE);
  expect(existsSync(join(root, ".mutation-probe-active.json"))).toBe(false);
});

test("healing a clean tree reports nothing rather than touching a file", () => {
  const root = fixtureRoot();
  writeFileSync(join(root, SRC_REL), MUTATED);
  // No marker: this content is the operator's, not a stranded mutant. Healing must NOT overwrite it.
  expect(healStranded(root)).toBeUndefined();
  expect(readFileSync(join(root, SRC_REL), "utf8")).toBe(MUTATED);
});

test("release restores and clears the marker, and is safe to call twice", () => {
  const root = fixtureRoot();
  const guard = armStrandGuard(root, SRC_REL, PRISTINE);
  writeFileSync(join(root, SRC_REL), MUTATED);
  guard.release();
  guard.release();
  expect(readFileSync(join(root, SRC_REL), "utf8")).toBe(PRISTINE);
  expect(healStranded(root)).toBeUndefined();
});

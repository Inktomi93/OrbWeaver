// @instrument-proof: a mutation stranded by a mid-plant kill must be RESTORED on the next run, not left
//   on the tree wearing the camouflage of a normal edit.
// @instrument-absence-proof: with no marker present, healing must report "nothing to heal" rather than
//   silently touching a file — a heal that fires on a clean tree would clobber real work.
// @instrument-proof: a marker whose sourceRel traverses out of the root is REFUSED, not written. The
//   marker survives a crash on disk, so it is untrusted input by the time it is read back; measured
//   against HEAD before the fix, a `../`-carrying marker overwrote a file in another directory outright.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
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

const VICTIM = "the operator's own file\n";

/** A file OUTSIDE the probe root, standing in for whatever a traversing marker would have aimed at. */
function victimOutsideRoot(): string {
  const outside = mkdtempSync(join(tmpdir(), "mutation-probe-victim-"));
  const victim = join(outside, "victim.ts");
  writeFileSync(victim, VICTIM);
  return victim;
}

function plantMarker(root: string, sourceRel: string): void {
  writeFileSync(join(root, ".mutation-probe-active.json"), JSON.stringify({ sourceRel, pristine: "MUTATION-PROBE OWNED THIS FILE\n" }));
}

// Measured against HEAD before the fix: a marker carrying `../../tmp/<victim>/victim.ts` healed
// "successfully" (it returned that path) and the victim file's bytes became the marker's payload.
test("a marker whose sourceRel traverses out of the root is REFUSED, not written", () => {
  const root = fixtureRoot();
  const victim = victimOutsideRoot();
  plantMarker(root, relative(root, victim));

  expect(() => healStranded(root)).toThrow(/REFUSED[\s\S]*escapes the probe root/u);
  expect(readFileSync(victim, "utf8")).toBe(VICTIM);
  // The marker SURVIVES a refusal: the operator still has the pristine body it carries.
  expect(existsSync(join(root, ".mutation-probe-active.json"))).toBe(true);
});

test("an absolute sourceRel is REFUSED", () => {
  const root = fixtureRoot();
  const victim = victimOutsideRoot();
  plantMarker(root, victim);

  expect(() => healStranded(root)).toThrow(/REFUSED[\s\S]*is not a repo-relative path/u);
  expect(readFileSync(victim, "utf8")).toBe(VICTIM);
});

// The arm a lexical `startsWith` check cannot see: the path IS under the root as a string, and still
// resolves somewhere else.
test("a symlink inside the root pointing out of it is REFUSED", () => {
  const root = fixtureRoot();
  const victim = victimOutsideRoot();
  symlinkSync(victim, join(root, "linked.ts"));
  plantMarker(root, "linked.ts");

  expect(() => healStranded(root)).toThrow(/REFUSED[\s\S]*resolves through a symlink/u);
  expect(readFileSync(victim, "utf8")).toBe(VICTIM);
});

test("a marker with no usable sourceRel/pristine pair is REFUSED rather than parsed by cast", () => {
  const root = fixtureRoot();
  writeFileSync(join(root, ".mutation-probe-active.json"), JSON.stringify({ sourceRel: 7 }));
  expect(() => healStranded(root)).toThrow(/REFUSED[\s\S]*no usable sourceRel\/pristine pair/u);
});

// The same door on the ARMING side: a run that could never legally restore its target must not get as
// far as writing a marker that claims it can.
test("arming against a traversing sourceRel refuses before any marker exists", () => {
  const root = fixtureRoot();
  const victim = victimOutsideRoot();
  expect(() => armStrandGuard(root, relative(root, victim), PRISTINE)).toThrow(/REFUSED/u);
  expect(existsSync(join(root, ".mutation-probe-active.json"))).toBe(false);
  expect(readFileSync(victim, "utf8")).toBe(VICTIM);
});

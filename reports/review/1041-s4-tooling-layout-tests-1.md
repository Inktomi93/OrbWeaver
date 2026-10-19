# 1041 shard s4-tooling-layout-tests-1 (runtime-test)

Outcome: five gates retired onto native tests or lint (depcruise-grant-liveness-health, runner-config-path-liveness,
tooling-slot-template, test-presence-client, tooling-instrument-proof); two gates kept and marked escalate
(test-layout, real-corpus-liveness-manifest). Both escalations fail on the live tree before any change, so the
successor test would land red.

Cadence: every successor under `tests/tooling/` runs in the weekly tooling proof, not the per-push Node CI
(`scripts/ci-shard.ts:117`). Primary rules on whether that drop is acceptable.

## Per gate

### depcruise-grant-liveness-health: done
- Successor: `tests/tooling/dependency-cruiser-backref-budget.int.test.ts` (reads the real config through `readConfigSnapshot`, asserts the `$N` selector count equals the committed 14).
- Plant: `.dependency-cruiser.cjs` rule `from tests/support/(iso|node)/` pathNot `["^tests/support/$1/", "^tests/support/$1/plant/"]`. Test exit 1, `expected 15 to be 14`. Plant removed.
- Parity: 2 mustFlag / 2 mustPass ported, 0 lost. Growth and shrink collapse to one equality assert; the filter control is the counter test; the ledger-anchor mustPass guarded fixtures only and has no tree meaning.
- Deleted: gate, `depcruise-grant-liveness-health.int.test.ts`, `_liveness/resources.ts` arm and `DEPCRUISE` const, law paragraph in `gate-runtime-standardization.md` repointed. Waivers 0, grants 0, budget row none.

### runner-config-path-liveness: done
- Successor: `tests/tooling/runner-config-paths.int.test.ts` (vitest selectors through `readConfigSnapshot`, playwright and CT configs imported as modules; testDir and globalSetup; dead, outside, symlink-escape, directory-include, empty-include).
- Plant: `vitest.config.ts` repository include gains `tests/tooling/liveness-gone.int.test.ts`. Exit 1, `names nothing on the tree`. Plant removed.
- Parity: 8 mustFlag / 6 mustPass ported, 0 lost. The classifier-rot tripwire becomes an unconditional non-empty exact-selector assert. Native provenance wording is not asserted; each spread site still reports once.
- Deleted: gate, `runner-config-path-liveness.int.test.ts`, `_liveness/resources.ts` arm, `lib/grant-liveness.ts` exports `isFileExact`, `deadExactFindings`, `irreducibleBudgetFindings` and their types (no remaining importer, rg plus ast-grep ts/tsx). Comment citations of the deleted path removed in `ops/resource-path.ts`, `contract/resource-path.ts`, `contract/gate.ts`, `lib/plumbing-literals.ts`, `tooling-runner-config-literals.ts`, `resource-path.test.ts`. Waivers 0, grants 0.

### tooling-slot-template: done
- Successor: `tests/tooling/tool-slot-template.int.test.ts` (tracked `tooling/src` inventory; engine set derived from snap import declarations with `ts.createSourceFile`).
- Plant: `tooling/src/zz-plant.ts`. Exit 1, `loose-file`. Plant removed.
- Parity: 6 mustFlag / 3 mustPass ported plus the 6 family-suite cases, 0 lost.
- Deleted: gate, `tooling-slot-template.test.ts`, `_liveness/tooling-and-authored.ts` arm. Law docs `Core-0` table, `Core-Tooling-Law` lines 57, 123 and §4.1 rewritten. Waivers 0, grants 0.

### test-presence-client: done
- Successor: `tests/tooling/standing-contrast-ct.test.ts` (the standing worst-legal-art contrast CT file exists).
- Plant: moved the CT file away. Exit 1, `restore tests/legacy/client/...`. Restored; `git status` shows no change under `tests/legacy` for it.
- Parity: 2 mustFlag / 1 mustPass ported, 0 lost. The armed-by-source-anchor and anchor re-pointing rows are gate-report mechanics.
- Deleted: gate, `_liveness/multi-root-b.ts` arm and constant, five cases in `mirror-index-family.suite.test.ts` (test-layout and test-reach cases kept). Citations repointed in `Spine-Testing.md`, `client-architecture-state-and-gates.md`, `enforcement-antipatterns.md`, `ast/ops/antipatterns.ts` (a stale id would break the antipattern pass), `contract/resource-mirror.ts`, `test-reach.ts`, `policy-soundness.ts`, `tests/legacy/client/data/trpc.test.ts`.
- Waivers rejudged: the one marker lived in a deleted family-suite fixture string; removed-dead. Grants 0.

### tooling-instrument-proof: done
- Successor: `tests/tooling/instrument-proof.int.test.ts` (arms A to D over the real `INSTRUMENT_TOOLS` tuple and tests/tooling markers) plus the native restriction `orb/instrument-verdict-door` in `eslint.config.js` (arm F; scope is every registry member's `tooling/src/<tool>/**`).
- Red first: lint test failed before the rule (`expected [] to have a length of 1`). Plants: `tests/tooling/rogue/zz-plant.test.ts` with an absence marker (exit 1, `unregistered-marker rogue`); `tooling/src/snap/ops/zz-plant.ts` importing `printResult as emit`. Real door: `pnpm exec eslint tooling/src/snap/ops/zz-plant.ts` exit 1, `1:10 error ... orb/instrument-verdict-door`. Plants removed.
- Parity: 14 mustFlag / 9 mustPass. Ported 11 mustFlag (7 to the test, 4 to lint) and 7 mustPass. Three mustFlag are n/a because the mechanism is gone and the claim holds by construction: the registry spread (the test imports the real tuple), the unreadable registry (the import fails loudly), the artifacts-home blindness tripwire (a name ban needs no home). Lost: 1 mustPass, a same-named `printResult` from another module is now refused by name (stricter); the name-prefilter mustPass is n/a.
- Deleted: gate, `mixed-hook-singletons-conversion.suite.test.ts` (its one test was this gate's receipt), the policy from `mixed-hook-singletons.suite.test.ts`, `_liveness/multi-root-b.ts` arm. `instruments.ts` header and `@public` marker repointed, `Core-Tooling-Law` §4.5 and the `Core-0` table row rewritten, `.dependency-cruiser.cjs` comment (no selector change), `absent-subject-anchor.ts` comment. Waivers 0, grants 0.
- Lint admission: `eslint.config.js` edit not run through `lint:eslint-scoped` (owed). The restriction needs no typed program.

### test-layout: escalate
Successor written and proven in scratch (draft below, 17 of 18 pass): mirror rows (6 mustFlag / 10 mustPass) and 12 history fixture cases. The last test fails on the live tree: `tests/legacy/ui/art/web-weave/web-weave-glow.fixtures.ts` is a legacy filename added after the foundation commit (`2947f63a49` renamed `web-weave-glow-probe.ts` to it). The old gate reads the same history (`--no-renames`), so it is red today too. Reverting the rename re-reds the type-home placement it was made for, so this is an owner fork: admit the rename (move the foundation or the ledger) or choose a different home. Lost claim if landed anyway: none; the claim would land red. Gate left in place. The real-tree history read takes 45 s.

### real-corpus-liveness-manifest: escalate
Successor drafted (below). On the live tree it reports ten registered gates with no collected arm: compose-wiring-only, contract-structural-copy, domain-inference-dispatch, json-column-read-parsed, test-assembly-home, test-hand-shape, test-production-clone, testid-typed-only-stories, trpc-input-declarations, wire-json-parsed-at-consumer. Earlier commits removed those arms before their gates; the old gate is red for the same ten. Four of them (domain-inference-dispatch, trpc-input-declarations, wire-json-parsed-at-consumer, testid-typed-only-stories) belong to other shards. Land after the other shards, then rerun. Gate left in place.

## Owed to primary
- `pnpm lint:eslint-scoped` for the `eslint.config.js` edit (not run, per rule).
- `docs/law/Core-Enforcement-Active-Gates.md` regeneration (five gates removed).
- Retire the unused resource doors: native-config (vitest, depcruise), static-config (playwright, ct), authored-tree `tooling-slot` still feeds the tooling mirror. No gate declares native-config or static-config any more.
- `docs/work/1076-...md` still names `tooling-slot-template` (fenced path).
- Weekly cadence for the five new tests.

## Draft successor: test-layout (`tests/tooling/test-layout.int.test.ts`)

```ts
// Test layout (docs/law/Spine-Testing.md §2, Core-0-Architecture-and-Structure.md §5): a test file carries a registered kind
// suffix, a module test lives in the directory it mirrors under packages/<pkg>/src (a tooling test under
// tooling/src/<tool>/…), a native .spec.ts lives only under tests/e2e, and tests/legacy only shrinks: a new, replaced
// or returned legacy filename is refused against founded Git history. The standing worst-legal-art contrast CT must exist.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { FixtureGitHistoryFoundation } from "@orb/tooling/floor/git/git-fixture";
import { captureFixtureGitHistoryFoundation, configureFixtureGitIdentity, execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { readAuthoredRepositoryInventory } from "../../tooling/src/floor/compiler/authored-repository.ts";
import { PACKAGE_NAMES } from "../../tooling/src/floor/compiler/project-worlds.ts";
import { classifyTestFilename, looksLikeTestFilename } from "../../tooling/src/floor/testing/test-kinds.ts";
import { isLegacyTestPath } from "../../tooling/src/floor/testing/test-population.ts";
import { loadGitPathHistoryResource } from "../../tooling/src/verify/ops/resource-git-history.ts";
import { scaledBudget } from "./_load-budget.ts";

const PKGS: ReadonlySet<string> = new Set(PACKAGE_NAMES);
const WORST_ART_STANDING_CT = "tests/legacy/client/features/chat/surfaces/worst-legal-art-contrast.suite.ct.tsx";
/** `tooling/<dir>/<file>` — anything shorter is a flat tests/tooling file, the exempt non-mirror tier. */
const MIRROR_MIN_SEGS = 3;

type Rule = "unregistered-kind" | "wrong-home" | "outside-package-mirror" | "mirror-miss";

interface Violation {
  readonly rule: Rule;
  readonly path: string;
}

/** Every ancestor directory of the given files. */
function directoriesOf(files: readonly string[]): ReadonlySet<string> {
  const dirs = new Set<string>();
  for (const file of files) {
    for (let at = file.indexOf("/"); at !== -1; at = file.indexOf("/", at + 1)) {
      dirs.add(file.slice(0, at));
    }
  }
  return dirs;
}

function violationFor(sourceDirs: ReadonlySet<string>, rel: string): Violation | undefined {
  const path = `tests/${rel}`;
  const segs = rel.split("/");
  const pkg = segs[0];
  const classification = classifyTestFilename(segs.at(-1) ?? "");
  if (classification === undefined && looksLikeTestFilename(segs.at(-1) ?? "")) {
    return { rule: "unregistered-kind", path };
  }
  // The native e2e kind is checked first so it cannot hide in a mirror-exempt tree.
  if (classification?.definition.mirror === "e2e-only" && pkg !== "e2e") {
    return { rule: "wrong-home", path };
  }
  if (pkg === "support" || pkg === "e2e") {
    return;
  }
  if (pkg === "tooling") {
    const toolDir = segs[1];
    if (toolDir === undefined || segs.length < MIRROR_MIN_SEGS || !sourceDirs.has(`tooling/src/${toolDir}`)) {
      return; // flat config test, or a research subject with no tool twin
    }
    return classification === undefined || classification.definition.mirror === "suite" || sourceDirs.has(`tooling/src/${segs.slice(1, -1).join("/")}`)
      ? undefined
      : { rule: "mirror-miss", path };
  }
  if (classification === undefined) {
    return;
  }
  if (pkg === undefined || !PKGS.has(pkg)) {
    return { rule: "outside-package-mirror", path };
  }
  // A suite asserts one property across many modules, so it mirrors no single directory.
  if (classification.definition.mirror === "suite" || sourceDirs.has(["packages", pkg, "src", ...segs.slice(1, -1)].join("/"))) {
    return;
  }
  return { rule: "mirror-miss", path };
}

/** Judge every non-legacy test-space member against the directories the authored files imply. */
function layoutViolations(files: readonly string[]): readonly Violation[] {
  const sourceDirs = directoriesOf(files.filter((file) => file.startsWith("packages/") || file.startsWith("tooling/src/")));
  return files
    .filter((file) => file.startsWith("tests/") && !isLegacyTestPath(file))
    .flatMap((file) => {
      const found = violationFor(sourceDirs, file.slice("tests/".length));
      return found === undefined ? [] : [found];
    });
}

const UI_SOURCE = "packages/ui/src/primitives/example.tsx";
const TOOL_PAIR = ["tooling/src/snapx/cli.ts", "tests/tooling/snapx/cli.test.ts"] as const;

test("an unregistered kind, a wrong-home spec, an unknown package and a mirror miss are each reported", () => {
  expect(layoutViolations([UI_SOURCE, "tests/ui/primitives/example.test.tsx", ...TOOL_PAIR])).toEqual([
    { rule: "unregistered-kind", path: "tests/ui/primitives/example.test.tsx" },
  ]);
  // The kind check precedes every exemption, so a test-shaped name cannot hide in a mirror-exempt tree.
  expect(layoutViolations([UI_SOURCE, "tests/support/shape.ct-d.ts", ...TOOL_PAIR])).toEqual([{ rule: "unregistered-kind", path: "tests/support/shape.ct-d.ts" }]);
  expect(layoutViolations([UI_SOURCE, "tests/server/domain/orphan.test.ts", ...TOOL_PAIR])).toEqual([{ rule: "mirror-miss", path: "tests/server/domain/orphan.test.ts" }]);
  expect(layoutViolations([UI_SOURCE, "tests/fresh/index.test.ts", ...TOOL_PAIR])).toEqual([{ rule: "outside-package-mirror", path: "tests/fresh/index.test.ts" }]);
  // A .spec.ts fires wrong-home even though its mirror source exists.
  expect(layoutViolations(["packages/server/src/domain/journey.ts", "tests/server/domain/journey.spec.ts", ...TOOL_PAIR])).toEqual([
    { rule: "wrong-home", path: "tests/server/domain/journey.spec.ts" },
  ]);
  // A directory named after a source FILE is not a mirrored directory.
  expect(layoutViolations(["packages/server/src/domain/chat/verbs/send.ts", "tests/server/domain/chat/verbs/send/sending.int.test.ts", ...TOOL_PAIR])).toEqual([
    { rule: "mirror-miss", path: "tests/server/domain/chat/verbs/send/sending.int.test.ts" },
  ]);
  // A tooling test nested under a live tool dir in a directory the tool lacks is judged, not waved through.
  expect(layoutViolations([UI_SOURCE, "tests/ui/primitives/example.ct.tsx", "tooling/src/snapx/cli.ts", "tests/tooling/snapx/deep/ghost.test.ts"])).toEqual([
    { rule: "mirror-miss", path: "tests/tooling/snapx/deep/ghost.test.ts" },
  ]);
});

test("mirrored, suite, e2e, support and flat tooling tests pass", () => {
  const pass = (files: readonly string[]): readonly Violation[] => layoutViolations([UI_SOURCE, ...TOOL_PAIR, ...files]);
  expect(pass(["tests/e2e/journey.spec.ts"])).toEqual([]);
  expect(pass(["packages/client/src/domain/view.tsx", "tests/client/domain/view.dom.test.ts"])).toEqual([]);
  expect(pass(["packages/client/src/domain/types.tsx", "tests/client/domain/types.dom.test-d.ts"])).toEqual([]);
  expect(pass(["packages/client/src/domain/component.tsx", "packages/client/src/domain/hook.ts", "tests/client/domain/component.ct.tsx", "tests/client/domain/hook.ct.tsx"])).toEqual([]);
  expect(pass(["packages/server/src/domain/real.ts", "tests/server/domain/real.test.ts"])).toEqual([]);
  // The file mirror ended: a behaviour-named test in a mirrored directory passes though no source file carries its name.
  expect(pass(["packages/server/src/domain/real.ts", "tests/server/domain/real-rows-survive-a-restart.int.test.ts", "tests/tooling/snapx/ghost-free-snapshots.test.ts"])).toEqual([]);
  expect(pass(["packages/showcase-plugins/src/index.ts", "tests/showcase-plugins/index.test.ts"])).toEqual([]);
  expect(pass(["tests/server/security/containment.suite.int.test.ts"])).toEqual([]);
  // A tests/tooling/<dir> whose tool dir does not exist is the exempt research-zone tier; a flat file is the exempt non-mirror tier.
  expect(pass(["tests/tooling/ghosttool/ghost.test.ts", "tests/tooling/flat-config.test.ts"])).toEqual([]);
  expect(pass(["tests/support/node/tool-fixtures.ts", "tests/e2e/helpers/login.ts"])).toEqual([]);
  // Legacy filenames are exempt from layout; their admission is the Git-history claim below.
  expect(pass(["tests/legacy/server/orphan.test.ts"])).toEqual([]);
});

const RETAINED = "tests/legacy/server/retained.test.ts";
const ADDED = "tests/legacy/server/added.test.ts";
const BASE: Readonly<Record<string, string>> = {
  "packages/server/src/index.ts": "export {};\n",
  "tooling/src/verify/index.ts": "export {};\n",
  "tests/tooling/verify/index.test.ts": "export {};\n",
  [RETAINED]: "export const original = true;\n",
};

function write(root: string, path: string, text = "export {};\n"): void {
  mkdirSync(join(root, dirname(path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function commit(root: string): void {
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["commit", "--quiet", "-m", "fixture"]);
}

function found(root: string): FixtureGitHistoryFoundation {
  for (const [path, text] of Object.entries(BASE)) {
    write(root, path, text);
  }
  execFixtureGit(root, ["init", "--quiet"]);
  configureFixtureGitIdentity(root);
  commit(root);
  return captureFixtureGitHistoryFoundation(root);
}

/** The legacy filenames that are new, replaced or returned against founded history, in the working tree or the candidate index. */
function legacyAdditions(root: string, foundation?: FixtureGitHistoryFoundation): readonly string[] {
  const loaded = loadGitPathHistoryResource(root, "legacy-tests", foundation);
  if (loaded.status !== "ready") {
    throw new Error(`legacy history cannot be read: ${loaded.reason}`);
  }
  const { history, candidatePaths } = loaded.value;
  const initial = new Set(history.initialPaths);
  const deleted = new Set(history.deletedPaths);
  const current = readAuthoredRepositoryInventory(root).paths.filter(isLegacyTestPath);
  return [...new Set([...history.addedPaths, ...[...current, ...candidatePaths].filter((path) => !initial.has(path) || deleted.has(path))])].toSorted();
}

for (const operation of ["add", "replacement", "return"] as const) {
  test(`legacy filename admission refuses ${operation}`, ({ scratch }) => {
    const foundation = found(scratch);
    let path = ADDED;
    if (operation !== "add") {
      rmSync(join(scratch, RETAINED));
    }
    if (operation === "return") {
      commit(scratch);
      path = RETAINED;
    }
    write(scratch, path);
    expect(legacyAdditions(scratch, foundation)).toEqual([path]);
  });
}

for (const operation of ["delete", "edit"] as const) {
  test(`legacy filename admission allows retained-file ${operation}`, ({ scratch }) => {
    const foundation = found(scratch);
    if (operation === "delete") {
      rmSync(join(scratch, RETAINED));
    } else {
      write(scratch, RETAINED, "export const original = false;\n");
    }
    expect(legacyAdditions(scratch, foundation)).toEqual([]);
  });
}

for (const admission of ["staged", "committed", "index-only"] as const) {
  test(`legacy admission sees an addition in ${admission} evidence`, ({ scratch }) => {
    const foundation = found(scratch);
    write(scratch, ADDED);
    execFixtureGit(scratch, ["add", ADDED]);
    if (admission === "committed") {
      commit(scratch);
    } else if (admission === "index-only") {
      rmSync(join(scratch, ADDED));
    }
    expect(legacyAdditions(scratch, foundation)).toEqual([ADDED]);
  });
}

test("committing an addition then deleting it does not erase the invalid transition", ({ scratch }) => {
  const foundation = found(scratch);
  write(scratch, ADDED);
  commit(scratch);
  rmSync(join(scratch, ADDED));
  commit(scratch);
  expect(legacyAdditions(scratch, foundation)).toEqual([ADDED]);
});

test("a whole population permits deletion without lowering a count constant", ({ scratch }) => {
  const foundation = found(scratch);
  rmSync(join(scratch, RETAINED));
  commit(scratch);
  expect(legacyAdditions(scratch, foundation)).toEqual([]);
});

for (const failure of ["missing", "shallow", "unreachable"] as const) {
  test(`legacy history ${failure} refuses rather than granting admission`, ({ scratch }) => {
    const foundation = found(scratch);
    if (failure === "shallow") {
      writeFileSync(join(scratch, ".git/shallow"), `${foundation.commit}\n`);
    } else if (failure === "unreachable") {
      execFixtureGit(scratch, ["checkout", "--orphan", "unrelated"]);
      write(scratch, "unrelated.ts");
      commit(scratch);
    }
    expect(loadGitPathHistoryResource(scratch, "legacy-tests", failure === "missing" ? undefined : foundation).status).toBe("unresolved");
  });
}

test("a merge cannot restore a filename deleted by a founded parent", ({ scratch }) => {
  const foundation = found(scratch);
  const original = execFixtureGit(scratch, ["branch", "--show-current"]).trim();
  execFixtureGit(scratch, ["checkout", "-b", "deleting"]);
  rmSync(join(scratch, RETAINED));
  commit(scratch);
  execFixtureGit(scratch, ["checkout", original]);
  write(scratch, "unrelated.ts");
  commit(scratch);
  execFixtureGit(scratch, ["merge", "--no-commit", "--no-ff", "deleting"]);
  write(scratch, RETAINED);
  commit(scratch);
  expect(legacyAdditions(scratch, foundation)).toEqual([RETAINED]);
});

test("a side parent predating foundation cannot invent a legacy addition", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "--quiet"]);
  configureFixtureGitIdentity(scratch);
  write(scratch, "before.ts");
  commit(scratch);
  const original = execFixtureGit(scratch, ["branch", "--show-current"]).trim();
  execFixtureGit(scratch, ["branch", "pre-foundation"]);
  for (const [path, text] of Object.entries(BASE)) {
    write(scratch, path, text);
  }
  commit(scratch);
  const foundation = captureFixtureGitHistoryFoundation(scratch);
  execFixtureGit(scratch, ["checkout", "pre-foundation"]);
  write(scratch, "side.ts");
  commit(scratch);
  execFixtureGit(scratch, ["checkout", original]);
  execFixtureGit(scratch, ["merge", "--no-ff", "-m", "fixture merge", "pre-foundation"]);
  expect(legacyAdditions(scratch, foundation)).toEqual([]);
});

test("every real test file has a registered kind and a mirrored home, and tests/legacy only shrinks", { timeout: scaledBudget(120_000) }, ({ repoRoot }) => {
  const files = readAuthoredRepositoryInventory(repoRoot).paths;
  // A reader that goes blind sees no tests and no sources and reports nothing.
  expect(files.filter((file) => file.startsWith("tests/") && !isLegacyTestPath(file)).length).toBeGreaterThan(1000);
  expect(files.filter((file) => file.startsWith("packages/")).length).toBeGreaterThan(1000);
  expect(layoutViolations(files)).toEqual([]);
  expect(legacyAdditions(repoRoot)).toEqual([]);
  expect(files).toContain(WORST_ART_STANDING_CT);
});
```

## Draft successor: real-corpus-liveness-manifest (`tests/tooling/verify/gates/liveness-roster.int.test.ts`)

```ts
// Every registered gate owes one real-corpus liveness arm, and every arm names a registered gate. A gate with no
// arm may be dead code that silently passes; an arm for a missing gate asserts nothing. Both sides are read from
// the loaded roster and the runner's own collected arms, so an arm declared anywhere the runner does not collect
// (an inline family-test arm) counts for nothing.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { loadGateCorpus } from "../../../../tooling/src/verify/lib/loader.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { ALL_ARMS } from "./_liveness/runner.ts";

function pinCensus(rosterIds: readonly string[], pinnedIds: readonly string[]): { readonly unpinned: readonly string[]; readonly dangling: readonly string[] } {
  const roster = new Set(rosterIds);
  const pinned = new Set(pinnedIds);
  return { unpinned: rosterIds.filter((id) => !pinned.has(id)).toSorted(), dangling: pinnedIds.filter((id) => !roster.has(id)).toSorted() };
}

test("the census reports an unpinned gate and a dangling pin, and passes a matched pair", () => {
  expect(pinCensus(["a", "b"], ["a"])).toEqual({ unpinned: ["b"], dangling: [] });
  expect(pinCensus(["a"], ["a", "ghost"])).toEqual({ unpinned: [], dangling: ["ghost"] });
  expect(pinCensus(["a", "b"], ["b", "a"])).toEqual({ unpinned: [], dangling: [] });
});

test("the loaded gate roster and the runner's collected liveness arms name the same gates", { timeout: scaledBudget(120_000) }, async ({ repoRoot }) => {
  const corpus = await loadGateCorpus(repoRoot);
  const rosterIds = corpus.gates.map((gate) => gate.id);
  expect(rosterIds.length).toBeGreaterThan(50);
  expect(ALL_ARMS.length).toBeGreaterThan(50);
  expect(pinCensus(rosterIds, ALL_ARMS.map((arm) => arm.policy.id))).toEqual({ unpinned: [], dangling: [] });
});
```

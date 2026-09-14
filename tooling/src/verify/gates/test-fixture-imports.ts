// core/Spine-Testing.md §4 + Core-Tooling-Law.md §4.8 — fixture doctrine. A test enters `test`/`it`/`expect`
// through the COMPOSED door, never a runner package directly; under `tests/tooling/` the door must be the
// one that installs the RESULT snapshot serializer, because entering through the plain door bakes
// unnormalized inline snapshots. Both halves are read structurally through `lib/test-runner-door.ts`: the
// AUTHORED door (which canonical origin deliberately preserves — both composed doors re-export the same
// vitest declaration, so origin cannot tell them apart) and the door's own serializer registration, so a
// rename of either door is free. Exempt by population: e2e, the doors themselves, and `.test-d.ts`.
//
// DIFFERENTIAL, MEASURED RATHER THAN CLAIMED. The legacy descriptor (`519242add`) reported SIX findings on
// the pre-conversion tree and the conversion's final pass reported ZERO — the only legacy-non-zero →
// final-zero row in its family, and the literal shape of a lost catch, made likelier by the fact that the
// same commit REPAIRED the member arm below (89 false positives). Replaying `519242add` establishes what
// the six were: THREE specs × the TWO named specifiers each (the legacy detector keys on `ImportSpecifier`,
// not on the import declaration) — `tests/tooling/verify/gates/{id-brand-flow,ledger-banned-shapes,
// schema-fact-wave-1}.test.ts`, each `import { expect, test } from "vitest"`, all three re-doored to
// `support/tool-fixtures.ts` by `e3c80bbbc` itself. They were FIXED, not waived, and no catch was lost.
// The claim no longer rests on that prose: `tests/tooling/verify/gates/test-fixture-imports.repo.int.test.ts`
// replays the frozen descriptor beside this policy over the SAME real workspace on every run and asserts
// SET EQUALITY of the reported sites, armed in both directions (§4.6).
//
// FAMILY `test-fixture-imports` — a declared SINGLETON. The reader it owns, `lib/test-runner-door.ts`, has
// exactly ONE importer (this module), which §5b.7 names as a shape to justify rather than assume: it lives in
// `lib/` because it answers a question canonical ORIGIN structurally cannot (both composed doors re-export the
// same vitest declaration, so the AUTHORED door and its serializer registration are the only discriminators),
// and that is a reader, not a policy detail. A second consumer inherits the door vocabulary unchanged.
//
// POPULATION PORT: byte-identical, legacy at `ef2251957^`
// (`scanRoot: (p) => p.includes("tests/") && !p.includes("tests/e2e/") && !p.includes("tests/support/") && !p.endsWith(".test-d.ts")`);
// the final `TEST_POPULATION` is that expression, and each of its three exclusions now owns a mustPass row.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `test-fixture-imports` descriptor at e8d06378079aecba08a27a033ef707794f1e625c, the parent of the conversion
// `ef2251957` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `519242add`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,186 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 2,627 and final `population` admits 2,627.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `tests/client/a11y/__cbbhr_in__ct-stories.tsx` (virtual)
// admitted by both; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import { Node, SyntaxKind } from "ts-morph";
import { readMemberReference } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import type { FixtureDoor } from "../contract/test-runner-door.ts";
import { FIXTURE_NAMES, readFixtureDoor, registersSnapshotSerializer } from "../lib/test-runner-door.ts";

const TOOLING_MIRROR = "tests/tooling/";

const MESSAGE =
  "a test/it/expect binding bypasses the composed fixture — import from 'support/fixtures' (or, under " +
  "tests/tooling/, 'support/tool-fixtures', the door that installs the RESULT snapshot serializer) " +
  "(core/Spine-Testing.md §4; docs/architecture/core/Core-Tooling-Law.md §4.8).";

const FIX =
  "import { test, expect } from the composed fixture door — 'support/fixtures' everywhere, " +
  "'support/tool-fixtures' under tests/tooling/ — never from vitest or @playwright/test directly. A " +
  "deliberate site is waived with `@orb-waive test-fixture-imports(<position>): <reason>` on the line " +
  "above, where <position> is the banned import specifier's own name (`test`/`expect`).";

/** The legacy `scanRoot` admitted any path containing `tests/`, minus `tests/e2e/`, minus `tests/support/`,
 *  minus every basename ending in `.test-d.ts`. The authored roots under any `tests/` tree, minus the e2e
 *  lane and the fixture doors themselves, minus the tsc-only type projects, is the same admitted set. */
const TEST_POPULATION = {
  in: ["@authored"],
  under: ["tests/**", "**/tests/**"],
  notUnder: ["tests/e2e/**", "tests/support/**", "**/tests/e2e/**", "**/tests/support/**"],
  notNamed: ["*.test-d.ts"],
} as const;

/** A fixture binding entering this file: a named import specifier (whose `getName()` is the exported name
 *  even under an alias) or a namespace member read. The NAME is the candidate gate; the DOOR is the verdict. */
function fixtureCandidate(node: Node): { readonly name: string; readonly anchor: Node } | null {
  if (Node.isImportSpecifier(node)) {
    const name = node.getName();
    return FIXTURE_NAMES.has(name) ? { name, anchor: node } : null;
  }
  if (!(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return null;
  }
  const member = readMemberReference(node);
  return member.kind === "resolved" && FIXTURE_NAMES.has(member.value.name) ? { name: member.value.name, anchor: node } : null;
}

/** FAIL-CLOSED IS SCOPED TO A DECLARED IMPORT DOOR. An ImportSpecifier whose door does not resolve is
 *  reported: a door nobody can read cannot be shown to install the serializer. A MEMBER read is the
 *  opposite case — `pattern.test(value)` and `page.expect` name the same three words on receivers that are
 *  not namespace imports at all, so an unresolved door there means NOT A SUBJECT, not unproven innocence.
 *  Reading it as fail-closed produced 89 confident false positives on the real tree, nearly all of them
 *  `RegExp.prototype.test`. */
function doorIsIllegal(door: FixtureDoor, inToolingMirror: boolean, viaImportDoor: boolean): boolean {
  if (door.kind === "runner") {
    return true;
  }
  if (door.kind === "unresolved") {
    return viaImportDoor;
  }
  return door.kind === "project" && inToolingMirror && !registersSnapshotSerializer(door.sourceFile);
}

export const gate = defineGate({
  id: "test-fixture-imports",
  family: "test-fixture-imports",
  authority: "ordinary",
  severity: "error",
  population: TEST_POPULATION,
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    let inToolingMirror = false;
    return {
      visitFile: (sourceFile) => {
        const path = ctx.relativePath(sourceFile);
        inToolingMirror = path.startsWith(TOOLING_MIRROR) || path.includes(`/${TOOLING_MIRROR}`);
      },
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node) => {
            const candidate = fixtureCandidate(node);
            if (candidate === null) {
              return;
            }
            if (doorIsIllegal(readFixtureDoor(candidate.anchor), inToolingMirror, Node.isImportSpecifier(candidate.anchor))) {
              ctx.report.node(candidate.anchor, { token: candidate.name, offset: candidate.anchor.getText().indexOf(candidate.name) });
            }
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "tests/server/x.test.ts": 'import { expect, test } from "vitest";\nexport const t = [test, expect];\n' },
      expect: { count: 2, token: "test" },
      why: "the founding shape — `test`/`expect` taken straight from the runner, which skips the composed db/clock/ids fixture entirely (§4)",
    },
    {
      mode: "types",
      files: { "tests/server/alias.test.ts": 'import { test as scenario } from "vitest";\nexport const t = scenario;\n' },
      expect: { count: 1, token: "test" },
      why: "AN IMPORT ALIAS enters the same door — the specifier's `getName()` is the exported name, so renaming the binding is not an escape",
    },
    {
      mode: "types",
      files: { "tests/server/ns.test.ts": 'import * as runner from "vitest";\nexport const t = runner.test;\n' },
      expect: { count: 1, token: "test" },
      why: "A NAMESPACE IMPORT produces no ImportSpecifier at all — the legacy specifier-keyed detector was offered no node whatsoever, a silent green (#1506)",
    },
    {
      mode: "types",
      files: { "tests/e2e-mirror/flow.test.ts": 'import { expect } from "@playwright/test";\nexport const e = expect;\n' },
      expect: { count: 1, token: "expect" },
      why: "the Playwright half of the same ban — only `tests/e2e/**` runs its own lane, and a Playwright import anywhere else is the doctrine's other founding case",
    },
    {
      mode: "types",
      files: {
        "tests/support/fixtures.ts": 'export { expect, test } from "vitest";\n',
        "tests/tooling/snapx/y.test.ts": 'import { expect, test } from "../../support/fixtures.ts";\nexport const t = [test, expect];\n',
      },
      expect: { count: 2, token: "test" },
      why: "the §4.8 arm — the PLAIN composed door inside the tooling mirror. It is a legitimate door everywhere else; here it skips the RESULT serializer and bakes unnormalized inline snapshots",
    },
    {
      mode: "types",
      files: { "tests/tooling/unreadable.test.ts": 'import { test } from "./missing-door.ts";\nexport const t = test;\n' },
      expect: { count: 1, token: "test" },
      why: "FAIL-CLOSED — a relative door that resolves to no module cannot be shown to install the serializer, and an unreadable door is not a licence",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "node_modules/@playwright/experimental-ct-react/index.ts": "export declare const test: unknown;\nexport declare const expect: unknown;\n",
        "tests/tooling/snap/overflow.ct.tsx": 'import { expect, test } from "@playwright/experimental-ct-react";\nexport const t = [test, expect];\n',
      },
      why: "THE EXTERNAL-DOOR CONTROL — a typed workspace resolves a PACKAGE specifier to its shipped declarations, so a package door answers `getModuleSpecifierSourceFile()` with a real file. Reading that as a composed project door made the tooling mirror demand a serializer registration from a third-party runner: four false positives on the real tree, on the CT specs that legitimately enter through the CT runner. DECLARED LIMIT: the ban names the two doors the doctrine names, and the CT runner is not one of them",
    },
    {
      mode: "types",
      files: {
        "tests/kit/regex.test.ts":
          "export const matches = (pattern: RegExp, value: string): boolean => pattern.test(value);\nexport const has = (bag: { readonly expect: number }): number => bag.expect;\n",
      },
      why: "THE MEMBER COUNTERFACTUAL — `pattern.test(value)` and a property named `expect` spell the doctrine's three words on receivers that are not namespace imports at all. Reading an unresolved door as fail-closed HERE produced 89 confident false positives on the real tree, nearly all of them `RegExp.prototype.test`; fail-closure belongs to a DECLARED import door and nowhere else",
    },
    {
      mode: "types",
      files: {
        "tests/support/fixtures.ts": 'export { expect, test } from "vitest";\n',
        "tests/server/y.test.ts": 'import { expect, test } from "../support/fixtures.ts";\nexport const t = [test, expect];\n',
      },
      why: "the sanctioned composed door OUTSIDE the tooling mirror — the ordinary case for the whole test tree",
    },
    {
      mode: "types",
      files: {
        "tests/support/fixtures.ts": 'export { expect, test } from "vitest";\n',
        "tests/support/tool-fixtures.ts":
          'import { expect, test as houseTest } from "./fixtures.ts";\nexport const test = houseTest;\nexport { expect } from "./fixtures.ts";\nexpect.addSnapshotSerializer({ serialize: () => "" });\n',
        "tests/tooling/snapx/z.test.ts": 'import { expect, test } from "../../support/tool-fixtures.ts";\nexport const t = [test, expect];\n',
      },
      why: "the §4.8 door, identified by the SERIALIZER REGISTRATION it performs rather than by its path — this is the whole reason a second door exists, and reading it structurally means the door may be renamed freely",
    },
    {
      mode: "types",
      files: {
        "tests/support/fixtures.ts": 'export { expect, test } from "vitest";\n',
        "tests/support/renamed-tool-door.ts":
          'import { expect, test as houseTest } from "./fixtures.ts";\nexport const test = houseTest;\nexport { expect } from "./fixtures.ts";\nexpect.addSnapshotSerializer({ serialize: () => "" });\n',
        "tests/tooling/snapx/renamed.test.ts": 'import { expect, test } from "../../support/renamed-tool-door.ts";\nexport const t = [test, expect];\n',
      },
      why: "THE RENAME CONTROL — the same door under a different filename still passes. A path regex (`support/fixtures$`) would have judged this by its spelling; the registration is what is actually being asked about",
    },
    {
      mode: "types",
      files: {
        "tests/support/fixtures.ts": 'export { expect, test } from "vitest";\n',
        "tests/tooling/types.test-d.ts": 'import { expect, test } from "vitest";\nexport const t = [test, expect];\n',
        "tests/tooling/quiet.test.ts": "export const quiet = 1;\n",
      },
      why: "a `.test-d.ts` is a tsc-only type project that never touches the runtime fixture — outside the population by design (core/Spine-Testing.md §1)",
    },
    {
      mode: "types",
      files: { "tests/tooling/third-party.test.ts": 'import { expect } from "chai";\nexport const e = expect;\n' },
      why: "DECLARED LIMIT — an `expect` from some OTHER package is not one of the two runner doors the doctrine names. The subject is the composed-fixture bypass, not every assertion helper in the ecosystem",
    },
    {
      mode: "types",
      files: {
        "tests/server/waived.test.ts":
          '// @orb-waive test-fixture-imports(test): this spec drives the fixture composition itself and must reach the bare runner; ends when the composition has a testable seam.\nimport { test } from "vitest";\nexport const t = test;\n',
      },
      why: "the ONE central positioned waiver naming the exact reported binding — malformed, stale and over-broad markers are proven CENTRALLY, never re-proved per policy",
    },
    {
      mode: "types",
      files: {
        "tests/e2e/flow.spec.ts": 'import { expect, test } from "@playwright/test";\nexport const t = [test, expect];\n',
        "tests/server/anchor.test.ts": "export const quiet = 1;\n",
      },
      why: "THE POPULATION FENCE, `tests/e2e/**` half — the Playwright runner entered DIRECTLY inside the e2e lane, beside an in-population anchor. e2e runs its own runner and has no composed db/clock/ids fixture to enter through, which is exactly why the legacy `scanRoot` subtracted it; the `e2e-mirror` mustFlag row above is the control showing the exclusion is a PATH, not the word 'e2e'. Dropping the e2e exclusion reds this row (w9 :262, #2046)",
    },
    {
      mode: "types",
      files: {
        "tests/support/fixtures.ts": 'import { expect, test } from "vitest";\nexport { expect, test };\n',
        "tests/server/anchor.test.ts": "export const quiet = 1;\n",
      },
      why: "THE POPULATION FENCE, `tests/support/**` half — the composed door's OWN source, which must import the runner directly or there is no door at all. A rule banning the runner import cannot apply to the one file whose job is making that import once. Dropping the support exclusion reds this row (w9 :262, #2046)",
    },
  ],
});
